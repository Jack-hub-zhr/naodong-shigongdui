// /api/complete client: timeout, retry, error mapping

import { API } from './config.js';
import { bumpCalls } from './store.js';

export class ApiError extends Error {
  constructor(kind, message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set(['NETWORK', 'RATE_LIMIT', 'HTTP']);

function timeoutSignal(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, cancel: () => clearTimeout(t) };
}

/**
 * POST /api/complete
 * body: { role, system, user, json, temperature, maxTokens }
 */
async function completeViaServer(req) {
  const url = API.endpoint('/api/complete');
  const maxTokens = Math.min(8192, req.maxTokens || (req.role === 'BUILDER' ? 7000 : 1500));
  const keyConfig = qwenProviderConfig();
  let lastMessage = '服务端不可用';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { signal, cancel } = timeoutSignal(120_000);
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: req.role,
          system: req.system,
          user: req.user,
          json: Boolean(req.json),
          temperature: req.temperature ?? (req.role === 'BUILDER' ? 0.7 : 0.4),
          maxTokens,
          ...(keyConfig.key ? { provider: keyConfig.provider, providerKey: keyConfig.key } : {}),
        }),
        signal,
      });
    } catch (err) {
      cancel();
      lastMessage = err?.name === 'AbortError' ? '模型请求超时' : '网络异常';
      if (attempt === 0) { await sleep(1200); continue; }
      throw new ApiError('NETWORK', lastMessage);
    }
    cancel();

    if (response.ok) {
      const data = await response.json().catch(() => null);
      const text = data?.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new ApiError('PARSE', '模型返回为空');
      }
      bumpCalls();
      return {
        text,
        provider: data.provider || 'free',
        providerName: data.providerName || '公共模型链',
        family: data.family || 'GPT-OSS',
        model: data.model || 'openai',
      };
    }

    const payload = await response.json().catch(() => null);
    const kind = payload?.error?.kind || (response.status === 429 ? 'RATE_LIMIT' : 'HTTP');
    lastMessage = payload?.error?.message || `服务端返回 HTTP ${response.status}`;

    if (RETRYABLE.has(kind) && attempt === 0) {
      await sleep(1400);
      continue;
    }
    throw new ApiError(kind, lastMessage, response.status);
  }

  throw new ApiError('NETWORK', lastMessage);
}


// ---------- 可选：用户自己的 Qwen API Key ----------
// 只保存在这台浏览器的 localStorage，不进入账号云同步，也不会被服务端持久化。
const PROVIDER_CONFIG_KEY = 'fc-qwen-provider';

export function qwenProviderConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROVIDER_CONFIG_KEY) || '{}');
    if (!raw || typeof raw !== 'object') return { provider: 'dashscope', key: '' };
    return {
      provider: ['dashscope', 'siliconflow', 'modelscope', 'groq', 'openrouter'].includes(raw.provider) ? raw.provider : 'dashscope',
      key: typeof raw.key === 'string' ? raw.key : '',
    };
  } catch (e) {
    return { provider: 'dashscope', key: '' };
  }
}

export function setQwenProviderConfig(provider, key) {
  try {
    const clean = String(key || '').trim().slice(0, 300);
    if (!clean) localStorage.removeItem(PROVIDER_CONFIG_KEY);
    else localStorage.setItem(PROVIDER_CONFIG_KEY, JSON.stringify({ provider, key: clean }));
    return true;
  } catch (e) {
    return false;
  }
}

export const QWEN_PROVIDERS = [
  { id: 'dashscope', name: '阿里云百炼', hint: 'sk-…', model: 'qwen-plus', url: 'https://bailian.console.aliyun.com/' },
  { id: 'siliconflow', name: '硅基流动', hint: 'sk-…', model: 'Qwen/Qwen3-8B', url: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'modelscope', name: '魔搭 ModelScope', hint: 'ms-…', model: 'Qwen/Qwen3.8-27B', url: 'https://modelscope.cn/' },
  { id: 'groq', name: 'Groq（需外网）', hint: 'gsk_…', model: 'qwen/qwen3.8-27b', url: 'https://console.groq.com/keys' },
  { id: 'openrouter', name: 'OpenRouter（需外网）', hint: 'sk-or-v1-…', model: 'qwen/qwen3-coder:free', url: 'https://openrouter.ai/' },
];

// ---- 浏览器直连（免密钥额度按访问者 IP 计算）----
const DIRECT_MODELS = [
  { id: 'ovh-qwen3.8-27b', name: 'OVH · Qwen3.8-27B', family: 'Qwen3.8', model: 'Qwen3.8-27B', kind: 'ovh' },
  { id: 'ovh-qwen3.6-27b', name: 'OVH · Qwen3.6-27B', family: 'Qwen3.6', model: 'Qwen3.6-27B', kind: 'ovh' },
  { id: 'ovh-qwen3.5-9b', name: 'OVH · Qwen3.5-9B', family: 'Qwen3.5', model: 'Qwen3.5-9B', kind: 'ovh' },
  { id: 'ovh-qwen3.5-397b', name: 'OVH · Qwen3.5 397B-A17B', family: 'Qwen3.5', model: 'Qwen3.5-397B-A17B', kind: 'ovh' },
  { id: 'pl-openai-fast', name: 'Pollinations · openai-fast', family: 'GPT-OSS', model: 'openai-fast', kind: 'pl' },
];
const OVH_DIRECT = 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions';
const PL_DIRECT = 'https://text.pollinations.ai/openai';
const directCool = new Map();

async function directOne(model, req, maxTokens, jsonMode) {
  if ((directCool.get(model.id) || 0) > Date.now()) return null;
  const { signal, cancel } = timeoutSignal(90_000);
  const body = model.kind === 'ovh'
    ? {
        model: model.model,
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
        temperature: req.temperature ?? 0.4,
        max_tokens: maxTokens,
        stream: false,
        reasoning_effort: 'none',
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }
    : {
        model: model.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: `${req.user}\n\n[请求 ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}]` },
        ],
        temperature: req.temperature ?? 0.4,
        max_tokens: maxTokens,
        private: true,
        seed: Math.floor(Math.random() * 1_000_000_000),
      };
  let response;
  try {
    response = await fetch(model.kind === 'ovh' ? OVH_DIRECT : PL_DIRECT, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    cancel();
    return null;
  }
  cancel();
  if (!response.ok) {
    directCool.set(model.id, Date.now() + (response.status === 429 ? 65_000 : 20_000));
    return null;
  }
  const data = await response.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  const finish = data?.choices?.[0]?.finish_reason;
  if (typeof text !== 'string' || !text.trim() || finish === 'length') return null;
  return {
    text: text.trim(),
    provider: 'direct',
    providerName: model.name,
    family: model.family,
    model: model.id,
  };
}

async function completeDirect(req) {
  const baseTokens = Math.min(8192, req.maxTokens || (req.role === 'BUILDER' ? 7000 : 1500));
  let jsonMode = Boolean(req.json);
  let tokens = baseTokens;
  for (const model of DIRECT_MODELS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await directOne(model, req, tokens, jsonMode);
      if (result) {
        bumpCalls();
        return result;
      }
      if (jsonMode) { jsonMode = false; continue; }
      break;
    }
  }
  throw new ApiError('RATE_LIMIT', '所有服务连接都在排队，请稍后重试', 429);
}

export async function complete(req) {
  try {
    return await completeViaServer(req);
  } catch (err) {
    // 只有服务端完全不可达时才走浏览器直连的免费兜底；服务端已返回业务错误就不再绕过它。
    if (err && err.kind !== 'QUOTA' && !err.status) {
      try { return await completeDirect(req); } catch (e) {}
    }
    throw err;
  }
}


export async function heartbeat() {
  const url = API.endpoint('/healthz');
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      ts: Date.now(),
      providerName: data.providerName || '公共模型链',
      service: data.service || 'api',
    };
  } catch (e) {
    return { ok: false, ts: Date.now(), message: e.message };
  }
}

// ---------- account ----------

const TOKEN_KEY = 'fc-token';

export function authToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
}

async function authFetch(path, options = {}) {
  const token = authToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(API.endpoint(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('TIMEOUT', '请求超时，请重试', 0);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
      setAuthToken('');
    }
    throw new ApiError(
      payload?.error?.kind || (response.status === 401 ? 'AUTH' : 'HTTP'),
      payload?.error?.message || `服务端返回 HTTP ${response.status}`,
      response.status,
    );
  }
  return payload;
}

export async function authMe() {
  if (!authToken()) return null;
  try {
    const data = await authFetch('/api/auth/me');
    return data?.user || null;
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

export async function registerAccount(input) {
  const data = await authFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  setAuthToken(data.token);
  return data.user;
}

export async function loginAccount(input) {
  const data = await authFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  setAuthToken(data.token);
  return data.user;
}

export async function logoutAccount() {
  try {
    await authFetch('/api/auth/logout', { method: 'POST', body: '{}' });
  } catch (e) {}
  setAuthToken('');
}

export async function loadCloudState() {
  if (!authToken()) return null;
  const data = await authFetch('/api/state');
  return data?.state || null;
}

export async function saveCloudState(payload) {
  if (!authToken()) return false;
  await authFetch('/api/state', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return true;
}
