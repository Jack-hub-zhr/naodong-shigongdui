import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { complete as completeModel, modelsStatus, primaryModel, OVH_KEYED, KEYED_CONFIGURED } from './models.mjs';
import {
  accountsInfo, getState, initAccounts, login, logout, putState, register, userForToken,
} from './db.mjs';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const DIST_DIR = resolve(process.cwd(), 'dist');
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_STATE_BODY_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const AUTH_RATE_LIMIT_MAX = 12;
const ROLES = new Set(['ORCHESTRATOR', 'PRODUCT', 'BUILDER', 'REVIEWER', 'PLEASER']);
const REQUEST_FIELDS = new Set([
  'role', 'system', 'user', 'json', 'temperature', 'maxTokens', 'builderFamily', 'provider', 'providerKey',
]);
const ALLOWED_ORIGINS = new Set([
  'https://forgecrew-studio.onrender.com',
  'http://localhost:3000',
  'http://localhost:4174',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4174',
]);

class ApiError extends Error {
  constructor(status, kind, message, headers = {}) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.headers = headers;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendJson(res, status, payload) {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, error) {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(error?.status || 500, error?.code || 'HTTP', error?.message || '服务内部错误');

  for (const [name, value] of Object.entries(apiError.headers)) {
    res.setHeader(name, value);
  }
  sendJson(res, apiError.status, {
    error: { kind: apiError.kind, message: apiError.message },
  });
}

const rateLimitBuckets = new Map();

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(req, max = RATE_LIMIT_MAX) {
  const now = Date.now();
  const key = `${clientIp(req)}:${max}`;

  if (rateLimitBuckets.size >= 5_000) {
    for (const [bucketKey, bucket] of rateLimitBuckets) {
      if (now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) rateLimitBuckets.delete(bucketKey);
    }
  }

  let bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
    rateLimitBuckets.set(key, bucket);
  }

  if (bucket.count >= max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.startedAt + RATE_LIMIT_WINDOW_MS - now) / 1000));
    throw new ApiError(429, 'RATE_LIMIT', '请求过于频繁，请稍后重试', {
      'Retry-After': String(retryAfter),
    });
  }
  bucket.count += 1;
}

async function readJson(req, limit = MAX_BODY_BYTES) {
  const contentType = req.headers['content-type'] ?? '';
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    req.resume();
    throw new ApiError(415, 'HTTP', 'Content-Type 必须为 application/json');
  }

  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > limit) {
    req.resume();
    throw new ApiError(413, 'HTTP', '请求体过大');
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;

  await new Promise((resolvePromise, reject) => {
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', resolvePromise);
    req.on('aborted', () => reject(new ApiError(400, 'NETWORK', '请求已中断')));
    req.on('error', () => reject(new ApiError(400, 'NETWORK', '无法读取请求体')));
  });

  if (tooLarge) throw new ApiError(413, 'HTTP', '请求体过大');

  try {
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } catch {
    throw new ApiError(400, 'PARSE', '请求体不是合法 JSON');
  }
}

function validateCompletionRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'HTTP', '请求体必须是 JSON 对象');
  }
  for (const field of Object.keys(body)) {
    if (!REQUEST_FIELDS.has(field)) throw new ApiError(400, 'HTTP', `不支持的字段：${field}`);
  }
  if (typeof body.role !== 'string' || !ROLES.has(body.role)) {
    throw new ApiError(400, 'HTTP', 'role 无效');
  }
  if (typeof body.system !== 'string') throw new ApiError(400, 'HTTP', 'system 必须是字符串');
  if (typeof body.user !== 'string' || !body.user.trim()) {
    throw new ApiError(400, 'HTTP', 'user 必须是非空字符串');
  }
  if (body.json !== undefined && typeof body.json !== 'boolean') {
    throw new ApiError(400, 'HTTP', 'json 必须是布尔值');
  }
  if (
    body.temperature !== undefined
    && (typeof body.temperature !== 'number'
      || !Number.isFinite(body.temperature)
      || body.temperature < 0
      || body.temperature > 2)
  ) {
    throw new ApiError(400, 'HTTP', 'temperature 必须是 0 到 2 之间的数字');
  }
  if (
    body.maxTokens !== undefined
    && (!Number.isInteger(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > 8192)
  ) {
    throw new ApiError(400, 'HTTP', 'maxTokens 必须是 1 到 8192 之间的整数');
  }
  if (
    body.builderFamily !== undefined
    && (typeof body.builderFamily !== 'string' || body.builderFamily.length > 128)
  ) {
    throw new ApiError(400, 'HTTP', 'builderFamily 必须是不超过 128 字符的字符串');
  }
  if (body.provider !== undefined && !['deepseek', 'groq', 'dashscope', 'siliconflow', 'modelscope', 'openrouter'].includes(body.provider)) {
    throw new ApiError(400, 'HTTP', 'provider 无效');
  }
  if (
    body.providerKey !== undefined
    && (typeof body.providerKey !== 'string' || body.providerKey.length > 300)
  ) {
    throw new ApiError(400, 'HTTP', 'providerKey 无效');
  }

  return {
    role: body.role,
    system: body.system,
    user: body.user,
    json: body.json ?? false,
    temperature: body.temperature ?? (body.role === 'BUILDER' ? 0.7 : 0.4),
    maxTokens: body.maxTokens ?? (body.role === 'BUILDER' ? 4096 : 1400),
    provider: body.provider,
    providerKey: body.providerKey,
  };
}

function bearerToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

function requireUser(req) {
  const user = userForToken(bearerToken(req));
  if (!user) throw new ApiError(401, 'AUTH', '登录已失效，请重新登录');
  return user;
}

function authPayload(result) {
  return {
    user: result.user,
    token: result.token,
    expiresAt: result.expiresAt,
  };
}

async function handleAuth(req, res, pathname) {
  if (pathname === '/api/auth/register') {
    if (req.method !== 'POST') throw new ApiError(405, 'HTTP', '请求方法不允许', { Allow: 'POST' });
    checkRateLimit(req, AUTH_RATE_LIMIT_MAX);
    const body = await readJson(req, 64 * 1024);
    const result = await register(body);
    sendJson(res, 201, authPayload(result));
    return true;
  }

  if (pathname === '/api/auth/login') {
    if (req.method !== 'POST') throw new ApiError(405, 'HTTP', '请求方法不允许', { Allow: 'POST' });
    checkRateLimit(req, AUTH_RATE_LIMIT_MAX);
    const body = await readJson(req, 64 * 1024);
    const result = await login(body);
    sendJson(res, 200, authPayload(result));
    return true;
  }

  if (pathname === '/api/auth/logout') {
    if (req.method !== 'POST') throw new ApiError(405, 'HTTP', '请求方法不允许', { Allow: 'POST' });
    await logout(bearerToken(req));
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/auth/me') {
    if (req.method !== 'GET') throw new ApiError(405, 'HTTP', '请求方法不允许', { Allow: 'GET' });
    const user = userForToken(bearerToken(req));
    sendJson(res, 200, { user });
    return true;
  }

  return false;
}

async function handleState(req, res, pathname) {
  if (pathname !== '/api/state' && pathname !== '/api/projects') return false;
  const user = requireUser(req);

  if (req.method === 'GET') {
    sendJson(res, 200, { state: getState(user.id) });
    return true;
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await readJson(req, MAX_STATE_BODY_BYTES);
    const state = await putState(user.id, body);
    sendJson(res, 200, { ok: true, state });
    return true;
  }

  throw new ApiError(405, 'HTTP', '请求方法不允许', { Allow: 'GET, PUT' });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new ApiError(405, 'HTTP', '请求方法不允许', { Allow: 'GET, HEAD' });
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new ApiError(400, 'HTTP', '路径无效');
  }

  const relative = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(DIST_DIR, relative);

  if (!filePath.startsWith(DIST_DIR)) throw new ApiError(403, 'HTTP', '禁止访问');

  const isFile = existsSync(filePath) && statSync(filePath).isFile();
  if (!isFile) {
    if (extname(decoded)) throw new ApiError(404, 'HTTP', '资源不存在');
    filePath = join(DIST_DIR, 'index.html');
    if (!existsSync(filePath)) {
      throw new ApiError(404, 'HTTP', '前端尚未构建，请先运行 npm run build:web');
    }
  }

  const type = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const isHtml = type.startsWith('text/html');
  const isRuntime = type.includes('javascript') || type.startsWith('text/css');
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': isHtml ? 'no-cache' : isRuntime ? 'public, max-age=60, must-revalidate' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    throw new ApiError(400, 'HTTP', '请求 URL 无效');
  }

  if (pathname === '/health' || pathname === '/healthz') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new ApiError(405, 'HTTP', '请求方法不允许', { Allow: 'GET, HEAD' });
    }
    const primary = primaryModel();
    const payload = {
      ok: true,
      service: 'api',
      provider: KEYED_CONFIGURED || OVH_KEYED ? 'keyed' : 'keyless',
      providerName: primary.name,
      model: primary.id,
      models: modelsStatus(),
      accounts: accountsInfo(),
      ts: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
    };
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end();
      return;
    }
    sendJson(res, 200, payload);
    return;
  }

  if (pathname === '/api/models') {
    if (req.method !== 'GET') throw new ApiError(405, 'HTTP', '请求方法不允许', { Allow: 'GET' });
    sendJson(res, 200, { models: modelsStatus(), primary: primaryModel().id, keyed: KEYED_CONFIGURED });
    return;
  }

  if (pathname.startsWith('/api/auth/') && await handleAuth(req, res, pathname)) return;
  if (await handleState(req, res, pathname)) return;

  if (pathname === '/api/complete') {
    if (req.method !== 'POST') throw new ApiError(405, 'HTTP', '请求方法不允许', { Allow: 'POST' });
    checkRateLimit(req);
    const input = validateCompletionRequest(await readJson(req));
    try {
      const result = await completeModel(input);
      sendJson(res, 200, result);
    } catch (error) {
      const status = error?.status === 429 ? 429 : 502;
      throw new ApiError(
        status,
        error?.kind || 'UPSTREAM',
        error?.message || '模型服务暂不可用',
        status === 429 ? { 'Retry-After': '45' } : {},
      );
    }
    return;
  }

  if (pathname.startsWith('/api/')) throw new ApiError(404, 'HTTP', '接口不存在');

  await serveStatic(req, res, pathname);
}

await initAccounts();
const server = http.createServer((req, res) => {
  applyCors(req, res);
  handleRequest(req, res).catch((error) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    sendError(res, error);
  });
});

server.requestTimeout = 120_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`API server listening on port ${PORT}`);
});
