import type { CrewRole, ProviderId } from '../types';
import {
  PROVIDERS,
  apiBase,
  providerKey,
  routeFor,
  type ProviderConfig,
  type RouteEntry,
} from './providers';

export type ApiRole = Exclude<CrewRole, 'USER' | 'SYSTEM'> | 'PLEASER';

export interface CompletionRequest {
  role: ApiRole;
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  builderFamily?: string;
  onEvent?: (type: ApiEventType, message: string) => void;
}

export type ApiEventType = 'backoff' | 'failover' | 'quota';

export interface CompletionResult {
  text: string;
  provider: ProviderId;
  providerName: string;
  family: string;
  model: string;
}

export type FailureKind = 'NO_KEY' | 'QUOTA' | 'RATE_LIMIT' | 'AUTH' | 'NETWORK' | 'HTTP' | 'PARSE';

export interface ProviderFailure {
  provider: ProviderId;
  providerName: string;
  kind: FailureKind;
  message: string;
}

export class AllProvidersFailedError extends Error {
  failures: ProviderFailure[];
  quotaExhausted: boolean;
  noProvider: boolean;

  constructor(failures: ProviderFailure[]) {
    super(failures.map((f) => `${f.providerName}: ${f.message}`).join('；') || '所有提供商均不可用');
    this.name = 'AllProvidersFailedError';
    this.failures = failures;
    this.quotaExhausted = failures.length > 0 && failures.every((f) => f.kind === 'QUOTA');
    this.noProvider = failures.length > 0 && failures.every((f) => f.kind === 'NO_KEY');
  }
}

export class MissingKeyError extends Error {
  constructor() {
    super('未配置任何 API Key');
    this.name = 'MissingKeyError';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 指数退避：1s → 2s → 4s → … 上限 30s */
function backoffDelay(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt);
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

interface RawCallResult {
  text: string;
  retryable: boolean;
  rateLimited: boolean;
  failureKind?: FailureKind;
  message?: string;
}

function extractOpenAIText(payload: unknown): string {
  const data = payload as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text ?? '').join('');
  }
  return '';
}

function extractGeminiText(payload: unknown): string {
  const data = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (
    data?.candidates?.[0]?.content?.parts?.map((part) => part?.text ?? '').join('') ?? ''
  );
}

async function callProvider(
  entry: RouteEntry,
  key: string,
  req: CompletionRequest,
): Promise<RawCallResult> {
  const { provider, model } = entry;
  const maxTokens = req.maxTokens ?? (req.role === 'BUILDER' ? 4096 : 1400);
  const temperature = req.temperature ?? (req.role === 'BUILDER' ? 0.7 : 0.4);

  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (provider.kind === 'gemini') {
    url = `${provider.baseUrl}/models/${model}:generateContent`;
    headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    };
    body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: Math.min(maxTokens, 8192),
        ...(req.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
  } else {
    url = `${provider.baseUrl}/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    };
    body = {
      model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      temperature,
      max_tokens: maxTokens,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: timeoutSignal(60_000),
    });
  } catch (error) {
    return {
      text: '',
      retryable: true,
      rateLimited: false,
      failureKind: 'NETWORK',
      message: error instanceof Error ? error.message : '网络异常',
    };
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    const detail = raw.slice(0, 240).replace(/\s+/g, ' ');
    if (response.status === 429) {
      return {
        text: '',
        retryable: true,
        rateLimited: true,
        failureKind: 'RATE_LIMIT',
        message: `429 限流 ${detail}`,
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        text: '',
        retryable: false,
        rateLimited: false,
        failureKind: 'AUTH',
        message: `${response.status} Key 无效或无权限`,
      };
    }
    if (response.status >= 500) {
      return {
        text: '',
        retryable: true,
        rateLimited: false,
        failureKind: 'HTTP',
        message: `${response.status} 服务端错误`,
      };
    }
    return {
      text: '',
      retryable: false,
      rateLimited: false,
      failureKind: 'HTTP',
      message: `${response.status} ${detail}`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      text: '',
      retryable: true,
      rateLimited: false,
      failureKind: 'PARSE',
      message: '响应不是合法 JSON',
    };
  }

  const text =
    provider.kind === 'gemini' ? extractGeminiText(payload) : extractOpenAIText(payload);
  if (!text.trim()) {
    return {
      text: '',
      retryable: true,
      rateLimited: false,
      failureKind: 'PARSE',
      message: '模型返回为空',
    };
  }
  return { text, retryable: false, rateLimited: false };
}

const MAX_ATTEMPTS = 3;

interface ServerResponse {
  text: string;
  provider: ProviderId;
  providerName: string;
  family: string;
  model: string;
}

/**
 * 服务端托管模式：浏览器只调用我们自己的 API，DeepSeek 密钥保存在服务器。
 */
async function completeViaServer(base: string, req: CompletionRequest): Promise<CompletionResult> {
  const maxTokens = req.maxTokens ?? (req.role === 'BUILDER' ? 4096 : 1400);
  const url = `${base}/api/complete`;
  let lastMessage = '服务端不可用';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: req.role,
          system: req.system,
          user: req.user,
          json: Boolean(req.json),
          temperature: req.temperature,
          maxTokens,
        }),
        signal: timeoutSignal(80_000),
      });
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : '网络异常';
      if (attempt < MAX_ATTEMPTS - 1) {
        req.onEvent?.('backoff', `服务端连接失败，${2 ** attempt}s 后重试`);
        await sleep(backoffDelay(attempt));
        continue;
      }
      break;
    }

    if (response.ok) {
      const data = (await response.json()) as ServerResponse;
      if (!data?.text?.trim()) {
        lastMessage = '服务端返回为空';
        break;
      }
      return {
        text: data.text,
        provider: data.provider ?? 'deepseek',
        providerName: data.providerName ?? 'DeepSeek',
        family: data.family ?? 'DeepSeek',
        model: data.model ?? 'deepseek-chat',
      };
    }

    const payload = (await response.json().catch(() => null)) as
      | { error?: { kind?: FailureKind; message?: string } }
      | null;
    const kind = payload?.error?.kind;
    lastMessage = payload?.error?.message ?? `服务端返回 HTTP ${response.status}`;

    const retryable = kind === 'NETWORK' || response.status === 429 || response.status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS - 1) {
      req.onEvent?.('backoff', `${lastMessage}，${2 ** attempt}s 后重试`);
      await sleep(backoffDelay(attempt));
      continue;
    }

    throw new AllProvidersFailedError([
      {
        provider: 'deepseek',
        providerName: 'DeepSeek',
        kind: kind ?? (response.status === 429 ? 'RATE_LIMIT' : 'HTTP'),
        message: lastMessage,
      },
    ]);
  }

  throw new AllProvidersFailedError([
    { provider: 'deepseek', providerName: 'DeepSeek', kind: 'NETWORK', message: lastMessage },
  ]);
}

/**
 * 真实免费 API 客户端：
 * 按工种路由 → 令牌桶限流 → 429 指数退避 → 提供商故障转移。
 * 所有提供商不可用时抛出 AllProvidersFailedError，由调度工种决定 PAUSED。
 */
export async function complete(req: CompletionRequest): Promise<CompletionResult> {
  const base = apiBase();
  if (base !== null) {
    return completeViaServer(base, req);
  }

  const route = routeFor(req.role, req.builderFamily);
  const failures: ProviderFailure[] = [];

  for (const entry of route) {
    const { provider } = entry;
    const key = providerKey(provider.id);
    if (!key) {
      failures.push({
        provider: provider.id,
        providerName: provider.name,
        kind: 'NO_KEY',
        message: '未配置 Key',
      });
      continue;
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const result = await callProvider(entry, key, req);

      if (result.text) {
        return {
          text: result.text,
          provider: provider.id,
          providerName: provider.name,
          family: entry.family,
          model: entry.model,
        };
      }

      if (result.retryable && attempt < MAX_ATTEMPTS - 1) {
        const delay = result.rateLimited
          ? Math.min(30_000, 1000 * 2 ** attempt)
          : backoffDelay(attempt);
        req.onEvent?.('backoff', `${provider.name} ${result.message ?? '请求失败'}，${Math.round(delay / 1000)}s 后重试`);
        await sleep(delay);
        continue;
      }

      failures.push({
        provider: provider.id,
        providerName: provider.name,
        kind: result.failureKind ?? 'HTTP',
        message: result.message ?? '未知错误',
      });
      break;
    }

    const next = route[route.indexOf(entry) + 1];
    if (next) {
      req.onEvent?.('failover', `${provider.name} 不可用，切换到 ${next.provider.name}`);
    }
  }

  throw new AllProvidersFailedError(failures);
}

export function describeProvider(provider: ProviderConfig): string {
  return `${provider.name} · ${provider.defaultModel}`;
}

export function providerDisplayName(id: ProviderId): string {
  return PROVIDERS[id]?.name ?? id;
}
