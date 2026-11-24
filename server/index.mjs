import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const DIST_DIR = resolve(process.cwd(), 'dist');
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const FREE_URL = process.env.FREE_BASE_URL?.trim() || 'https://text.pollinations.ai/openai';
const FREE_MODEL = process.env.FREE_MODEL?.trim() || 'openai-fast';
const GITHUB_MODELS_URL = process.env.GITHUB_MODELS_URL?.trim() || 'https://models.github.ai/inference/chat/completions';
const GITHUB_MODELS_MODEL = process.env.GITHUB_MODELS_MODEL?.trim() || 'openai/gpt-4o-mini';
const MAX_BODY_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 75_000;
const MAX_RETRIES = 3;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const ROLES = new Set(['ORCHESTRATOR', 'PRODUCT', 'BUILDER', 'REVIEWER', 'PLEASER']);
const REQUEST_FIELDS = new Set([
  'role',
  'system',
  'user',
  'json',
  'temperature',
  'maxTokens',
  'builderFamily',
]);

class ApiError extends Error {
  constructor(status, kind, message, headers = {}) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.headers = headers;
  }
}

function setCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
    : new ApiError(500, 'HTTP', '服务内部错误');

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

function checkRateLimit(req) {
  const now = Date.now();
  const ip = clientIp(req);

  if (rateLimitBuckets.size >= 5_000) {
    for (const [key, bucket] of rateLimitBuckets) {
      if (now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) rateLimitBuckets.delete(key);
    }
  }

  let bucket = rateLimitBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
    rateLimitBuckets.set(ip, bucket);
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(
      1,
      Math.ceil((bucket.startedAt + RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    throw new ApiError(429, 'RATE_LIMIT', '请求过于频繁，请稍后重试', {
      'Retry-After': String(retryAfter),
    });
  }
  bucket.count += 1;
}

async function readJson(req) {
  const contentType = req.headers['content-type'] ?? '';
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    req.resume();
    throw new ApiError(415, 'HTTP', 'Content-Type 必须为 application/json');
  }

  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    req.resume();
    throw new ApiError(413, 'HTTP', 'JSON 请求体不能超过 1 MiB');
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;

  await new Promise((resolve, reject) => {
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', resolve);
    req.on('aborted', () => reject(new ApiError(400, 'NETWORK', '请求已中断')));
    req.on('error', () => reject(new ApiError(400, 'NETWORK', '无法读取请求体')));
  });

  if (tooLarge) throw new ApiError(413, 'HTTP', 'JSON 请求体不能超过 1 MiB');

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
    if (!REQUEST_FIELDS.has(field)) {
      throw new ApiError(400, 'HTTP', `不支持的字段：${field}`);
    }
  }

  if (typeof body.role !== 'string' || !ROLES.has(body.role)) {
    throw new ApiError(400, 'HTTP', 'role 无效');
  }
  if (typeof body.system !== 'string') {
    throw new ApiError(400, 'HTTP', 'system 必须是字符串');
  }
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

  return {
    role: body.role,
    system: body.system,
    user: body.user,
    json: body.json ?? false,
    temperature: body.temperature ?? (body.role === 'BUILDER' ? 0.7 : 0.4),
    maxTokens: body.maxTokens ?? (body.role === 'BUILDER' ? 4096 : 1400),
  };
}

function timeoutError() {
  return new ApiError(504, 'NETWORK', '模型请求超时');
}

function activeProvider() {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey) {
    return {
      id: 'deepseek',
      name: 'DeepSeek',
      family: 'DeepSeek',
      model: 'deepseek-chat',
      url: DEEPSEEK_URL,
      key: deepseekKey,
      jsonMode: true,
    };
  }
  const githubToken = process.env.GITHUB_MODELS_TOKEN?.trim();
  if (githubToken && process.env.GITHUB_MODELS_ENABLED === 'true') {
    return {
      id: 'github',
      name: 'GitHub 模型通道',
      family: 'OpenAI',
      model: GITHUB_MODELS_MODEL,
      url: GITHUB_MODELS_URL,
      key: githubToken,
      jsonMode: true,
    };
  }
  return {
    id: 'free',
    name: '免费通道',
    family: 'GPT-OSS',
    model: FREE_MODEL,
    url: FREE_URL,
    key: null,
    jsonMode: false,
  };
}

function waitForBackoff(attempt, signal) {
  if (signal.aborted) return Promise.reject(timeoutError());

  return new Promise((resolve, reject) => {
    const delay = 1000 * 2 ** attempt;
    const onAbort = () => {
      clearTimeout(timer);
      reject(timeoutError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function completeUpstream(input) {
  const provider = activeProvider();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let response;
      let raw;
      try {
        response = await fetch(provider.url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(provider.key ? { Authorization: `Bearer ${provider.key}` } : {}),
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: 'system', content: input.system },
              { role: 'user', content: provider.id === 'free'
                ? `${input.user}\n\n[构建请求 ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}]`
                : input.user },
            ],
            temperature: input.temperature,
            max_tokens: input.maxTokens,
            ...(provider.id === 'free' ? { reasoning_effort: 'low', private: true, seed: Math.floor(Math.random() * 1_000_000_000) } : {}),
            ...(input.json && provider.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
          redirect: 'error',
          signal: controller.signal,
        });
        raw = await response.text();
      } catch {
        if (controller.signal.aborted) throw timeoutError();
        if (attempt === MAX_RETRIES) {
          throw new ApiError(502, 'NETWORK', `无法连接 ${provider.name}`);
        }
        await waitForBackoff(attempt, controller.signal);
        continue;
      }

      if (response.ok) {
        let payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          throw new ApiError(502, 'PARSE', `${provider.name} 返回了无效 JSON：${String(raw).slice(0, 120)}`);
        }

        const text = payload?.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim()) {
          throw new ApiError(502, 'PARSE', `${provider.name} 返回了空响应或无效结构`);
        }

        return {
          text,
          provider: provider.id,
          providerName: provider.name,
          family: provider.family,
          model: provider.model,
        };
      }

      if (response.status === 401 || response.status === 403) {
        throw new ApiError(502, 'AUTH', `${provider.name} 密钥无效或无权限`);
      }
      if (response.status === 402 && attempt < 2) {
        await waitForBackoff(attempt + 2, controller.signal);
        continue;
      }
      if (response.status === 402) {
        throw new ApiError(402, 'QUOTA', `${provider.name} 账户余额不足`);
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < MAX_RETRIES) {
        await waitForBackoff(attempt, controller.signal);
        continue;
      }
      if (response.status === 429) {
        throw new ApiError(429, 'RATE_LIMIT', `${provider.name} 请求限流，请稍后重试`);
      }
      throw new ApiError(502, 'HTTP', `${provider.name} 返回 HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }

  throw new ApiError(502, 'NETWORK', '模型请求失败');
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

  if (!filePath.startsWith(DIST_DIR)) {
    throw new ApiError(403, 'HTTP', '禁止访问');
  }

  const isFile = existsSync(filePath) && statSync(filePath).isFile();
  if (!isFile) {
    // 单页应用回退
    if (extname(decoded)) {
      throw new ApiError(404, 'HTTP', '资源不存在');
    }
    filePath = join(DIST_DIR, 'index.html');
    if (!existsSync(filePath)) {
      throw new ApiError(404, 'HTTP', '前端尚未构建，请先运行 npm run build:web');
    }
  }

  const type = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const isHtml = type.startsWith('text/html');
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
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

  if (pathname === '/api/provider-probe') {
    const provider = activeProvider();
    const target = new URL(req.url ?? '/', 'http://localhost').searchParams.get('target') || 'github';
    const url = target === 'azure'
      ? 'https://models.inference.ai.azure.com/chat/completions'
      : provider.url;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(provider.key ? { Authorization: `Bearer ${provider.key}` } : {}) },
        body: JSON.stringify({ model: target === 'azure' ? 'gpt-4o-mini' : provider.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 16 }),
        signal: AbortSignal.timeout(30000),
      });
      const text = await r.text();
      const body = JSON.stringify({ provider: provider.id, target, status: r.status, contentType: r.headers.get('content-type'), body: text.slice(0, 300) });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ provider: provider.id, target, error: String(err) }));
    }
    return;
  }

  if (pathname === '/health' || pathname === '/healthz') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new ApiError(405, 'HTTP', '请求方法不允许', { Allow: 'GET, HEAD' });
    }
    const provider = activeProvider();
    const payload = {
      ok: true,
      service: 'api',
      provider: provider.id,
      providerName: provider.name,
      model: provider.model,
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

  if (pathname === '/api/complete') {
    if (req.method !== 'POST') {
      throw new ApiError(405, 'HTTP', '请求方法不允许', { Allow: 'POST' });
    }

    checkRateLimit(req);

    const input = validateCompletionRequest(await readJson(req));
    const result = await completeUpstream(input);
    sendJson(res, 200, result);
    return;
  }

  if (pathname.startsWith('/api/')) {
    throw new ApiError(404, 'HTTP', '接口不存在');
  }

  await serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  setCommonHeaders(res);
  handleRequest(req, res).catch((error) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    sendError(res, error);
  });
});

server.requestTimeout = UPSTREAM_TIMEOUT_MS;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`API server listening on port ${PORT}`);
});
