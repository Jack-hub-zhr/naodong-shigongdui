// Upstream model routing for the five services.
// OVHcloud AI Endpoints works anonymously, but the anonymous quota is tiny
// (observed ~1 request / model / IP / year via x-ratelimit-limit-year).
// Set OVH_API_KEY in the environment to use a registered quota instead.
// Pollinations Classic stays as the last fallback.
// LLM7.io's anonymous turbo pool is used before Pollinations: no key, ~30 RPM.

const OVH_URL = 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions';
const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';
const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';
const OVH_KEY = (process.env.OVH_API_KEY || '').trim();
export const OVH_KEYED = Boolean(OVH_KEY);
const REFERER = 'https://forgecrew-studio.onrender.com';

// 需要 Key 的 Qwen 兼容服务。优先级：用户自带 Key > 服务端环境变量 > 公共匿名链。
export const KEYED_PROVIDERS = [
  {
    id: 'groq',
    name: 'Groq · Qwen3.8-27B',
    family: 'Qwen3.8',
    model: 'qwen/qwen3.8-27b',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    env: 'GROQ_API_KEY',
    reasoningFormat: 'parsed',
  },
  {
    id: 'dashscope',
    name: '阿里云百炼 · Qwen Plus',
    family: 'Qwen3',
    model: 'qwen-plus',
    url: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    env: 'DASHSCOPE_API_KEY',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 · Qwen3-8B',
    family: 'Qwen3',
    model: 'Qwen/Qwen3-8B',
    url: 'https://api.siliconflow.cn/v1/chat/completions',
    env: 'SILICONFLOW_API_KEY',
  },
  {
    id: 'modelscope',
    name: '魔搭 · Qwen3.8-27B',
    family: 'Qwen3.8',
    model: 'Qwen/Qwen3.8-27B',
    url: 'https://api-inference.modelscope.cn/v1/chat/completions',
    env: 'MODELSCOPE_API_KEY',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter · Qwen3 Coder Free',
    family: 'Qwen3',
    model: 'qwen/qwen3-coder:free',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    env: 'OPENROUTER_API_KEY',
  },
];

function providerById(id) {
  return KEYED_PROVIDERS.find((p) => p.id === id) || null;
}

function keyedModel(provider, apiKey, prefix) {
  return {
    id: `${prefix}-${provider.id}`,
    name: provider.name,
    family: provider.family,
    model: provider.model,
    url: provider.url,
    kind: 'openai',
    apiKey,
    providerId: provider.id,
    keyed: true,
  };
}

export function customModel(providerId, apiKey) {
  const provider = providerById(String(providerId || '').trim());
  const key = String(apiKey || '').trim();
  if (!provider || key.length < 8 || key.length > 300) return null;
  return keyedModel(provider, key, 'user');
}

function envModels() {
  return KEYED_PROVIDERS
    .map((p) => {
      const key = String(process.env[p.env] || '').trim();
      return key ? keyedModel(p, key, 'env') : null;
    })
    .filter(Boolean);
}

export const KEYED_CONFIGURED = KEYED_PROVIDERS.some((p) => Boolean(String(process.env[p.env] || '').trim()));
const UPSTREAM_TIMEOUT_MS = 65_000;
const RATE_COOLDOWN_MS = 65_000;
const ERROR_COOLDOWN_MS = 20_000;

export const MODEL_CHAIN = [
  {
    id: 'ovh-qwen3.8-27b',
    name: 'OVH · Qwen3.8-27B',
    family: 'Qwen3.8',
    model: 'Qwen3.8-27B',
    url: OVH_URL,
    kind: 'ovh',
  },
  {
    id: 'ovh-qwen3.6-27b',
    name: 'OVH · Qwen3.6-27B',
    family: 'Qwen3.6',
    model: 'Qwen3.6-27B',
    url: OVH_URL,
    kind: 'ovh',
  },
  {
    id: 'ovh-qwen3.5-9b',
    name: 'OVH · Qwen3.5-9B',
    family: 'Qwen3.5',
    model: 'Qwen3.5-9B',
    url: OVH_URL,
    kind: 'ovh',
  },
  {
    id: 'ovh-qwen3.5-397b',
    name: 'OVH · Qwen3.5 397B-A17B',
    family: 'Qwen3.5',
    model: 'Qwen3.5-397B-A17B',
    url: OVH_URL,
    kind: 'ovh',
  },
  {
    id: 'llm7-gpt-oss-20b',
    name: 'LLM7 · GPT-OSS 20B',
    family: 'GPT-OSS',
    model: 'gpt-oss:20b',
    url: LLM7_URL,
    kind: 'openai',
    apiKey: 'unused',
  },
  {
    id: 'pl-openai-fast',
    name: 'Pollinations · openai-fast',
    family: 'GPT-OSS',
    model: 'openai-fast',
    url: POLLINATIONS_URL,
    kind: 'pollinations',
  },
];

const cooldowns = new Map();

function cooldownLeft(model, now = Date.now()) {
  const until = cooldowns.get(model.id) || 0;
  return Math.max(0, until - now);
}

function cool(model, ms) {
  cooldowns.set(model.id, Date.now() + ms);
}

export function modelsStatus() {
  const now = Date.now();
  const keyed = envModels().map((m) => ({
    id: m.id,
    name: m.name,
    family: m.family,
    model: m.model,
    keyed: true,
    available: cooldownLeft(m, now) === 0,
    cooldownSec: Math.ceil(cooldownLeft(m, now) / 1000),
  }));
  return [...keyed, ...MODEL_CHAIN.map((m) => ({
    id: m.id,
    name: m.name,
    family: m.family,
    model: m.model,
    keyed: false,
    available: cooldownLeft(m, now) === 0,
    cooldownSec: Math.ceil(cooldownLeft(m, now) / 1000),
  }))];
}

export function primaryModel() {
  const keyed = envModels().find((m) => cooldownLeft(m) === 0);
  if (keyed) return keyed;
  const ready = MODEL_CHAIN.find((m) => cooldownLeft(m) === 0) || MODEL_CHAIN[MODEL_CHAIN.length - 1];
  return ready;
}

function pickModels() {
  const now = Date.now();
  return MODEL_CHAIN.filter((m) => cooldownLeft(m, now) === 0);
}

function buildBody(model, input, withJsonMode) {
  if (model.kind === 'openai') {
    return {
      model: model.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      stream: false,
      ...(withJsonMode && model.jsonMode !== false
        ? {
            response_format: { type: 'json_object' },
            ...(model.reasoningFormat ? { reasoning_format: model.reasoningFormat } : {}),
          }
        : {}),
    };
  }

  if (model.kind === 'ovh') {
    return {
      model: model.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      stream: false,
      reasoning_effort: 'none',
      ...(withJsonMode ? { response_format: { type: 'json_object' } } : {}),
    };
  }

  return {
    model: model.model,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: `${input.user}\n\n[请求 ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}]` },
    ],
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    reasoning_effort: 'low',
    private: true,
    seed: Math.floor(Math.random() * 1_000_000_000),
    ...(withJsonMode ? { response_format: { type: 'json_object' } } : {}),
  };
}

async function request(model, input, withJsonMode = Boolean(input.json)) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(model.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(model.apiKey
          ? { Authorization: `Bearer ${model.apiKey}` }
          : (model.kind === 'ovh' && OVH_KEY ? { Authorization: `Bearer ${OVH_KEY}` } : {})),
        ...(model.providerId === 'openrouter' ? { 'HTTP-Referer': REFERER, 'X-Title': 'ForgeCrew' } : {}),
      },
      body: JSON.stringify(buildBody(model, input, withJsonMode)),
      redirect: 'error',
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload = null;
    try { payload = JSON.parse(raw); } catch { payload = null; }

    if (!response.ok) {
      const reset = Number.parseInt(response.headers.get('ratelimit-reset') || '', 10);
      const retryAfter = Number.parseInt(response.headers.get('retry-after') || '', 10);
      return {
        ok: false,
        status: response.status,
        message: payload?.message || payload?.error?.message || `HTTP ${response.status}`,
        retryAfter: Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter
          : (Number.isFinite(reset) && reset > 0 ? Math.min(reset, 3_456_000) : 0),
        raw: String(raw).slice(0, 180),
      };
    }

    const message = payload?.choices?.[0]?.message;
    const text = typeof message?.content === 'string' ? message.content.trim() : '';
    const finish = payload?.choices?.[0]?.finish_reason;
    return { ok: true, text, finish, payload };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error?.name === 'AbortError' ? 'timeout' : 'network',
      raw: '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function complete(input) {
  const custom = customModel(input.provider, input.providerKey);
  const models = [custom, ...envModels(), ...pickModels()].filter((m) => m && cooldownLeft(m) === 0);
  let sawRateLimit = false;
  let lastMessage = '';

  for (const model of models) {
    let jsonMode = Boolean(input.json);
    let maxTokens = input.maxTokens;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await request(model, { ...input, maxTokens }, jsonMode);

      if (result.ok) {
        if (result.text && result.finish !== 'length') {
          return {
            text: result.text,
            provider: (model.keyed || (OVH_KEYED && model.kind === 'ovh')) ? 'keyed' : 'keyless',
            providerName: model.name,
            family: model.family,
            model: model.id,
            providerId: model.providerId || model.kind,
          };
        }

        // Truncated or reasoning-only output: give the model a larger budget once.
        if (result.finish === 'length' && maxTokens < 8192) {
          maxTokens = Math.min(8192, maxTokens * 2);
          continue;
        }

        lastMessage = result.text
          ? `${model.name} 输出被截断`
          : `${model.name} 返回空响应`;
        break;
      }

      if (result.status === 429 || result.status === 402) {
        sawRateLimit = true;
        const wait = Math.max(RATE_COOLDOWN_MS, (result.retryAfter || 45) * 1000);
        cool(model, Math.min(40 * 86_400_000, wait));
        lastMessage = `${model.name} 当前额度已用完`;
        break;
      }

      if (result.status === 0 || result.status >= 500) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1_200));
          continue;
        }
        cool(model, ERROR_COOLDOWN_MS);
        lastMessage = `${model.name} 暂时不可用`;
        break;
      }

      if (result.status === 400 && jsonMode) {
        // Some deployments reject response_format; retry as plain text.
        jsonMode = false;
        continue;
      }

      if (result.status === 401 || result.status === 403) {
        cool(model, 10 * 60_000);
        lastMessage = model.keyed ? `${model.name} 的 Key 无效或已过期` : `${model.name} 拒绝匿名访问`;
        break;
      }

      lastMessage = `${model.name} 返回 ${result.status}`;
      break;
    }
  }

  const error = new Error(sawRateLimit
    ? '所有服务连接都在排队，请稍后重试'
    : (lastMessage || '服务连接暂不可用'));
  error.kind = sawRateLimit ? 'RATE_LIMIT' : 'UPSTREAM';
  error.status = sawRateLimit ? 429 : 502;
  throw error;
}
