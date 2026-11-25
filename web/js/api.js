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
export async function complete(req) {
  const url = API.endpoint('/api/complete');
  const maxTokens = Math.min(8192, req.maxTokens || (req.role === 'BUILDER' ? 7000 : 1500));
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
        providerName: data.providerName || '五模型链',
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

export async function heartbeat() {
  const url = API.endpoint('/healthz');
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      ts: Date.now(),
      providerName: data.providerName || '五模型链',
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
  const response = await fetch(API.endpoint(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });
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
