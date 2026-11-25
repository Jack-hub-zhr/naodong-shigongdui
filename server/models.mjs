// Upstream model routing for the five services.
// OVHcloud AI Endpoints works anonymously, but the anonymous quota is tiny
// (observed ~2 requests / model / IP / year via x-ratelimit-limit-year).
// Set OVH_API_KEY in the environment to use a registered quota instead.
// Pollinations Classic stays as the last fallback.

const OVH_URL = 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions';
const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';
const OVH_KEY = (process.env.OVH_API_KEY || '').trim();
export const OVH_KEYED = Boolean(OVH_KEY);
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
  return MODEL_CHAIN.map((m) => ({
    id: m.id,
    name: m.name,
    family: m.family,
    model: m.model,
    available: cooldownLeft(m, now) === 0,
    cooldownSec: Math.ceil(cooldownLeft(m, now) / 1000),
  }));
}

export function primaryModel() {
  const ready = MODEL_CHAIN.find((m) => cooldownLeft(m) === 0) || MODEL_CHAIN[MODEL_CHAIN.length - 1];
  return ready;
}

function pickModels() {
  const now = Date.now();
  return MODEL_CHAIN.filter((m) => cooldownLeft(m, now) === 0);
}

function buildBody(model, input, withJsonMode) {
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
        ...(model.kind === 'ovh' && OVH_KEY ? { Authorization: `Bearer ${OVH_KEY}` } : {}),
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
  const models = pickModels();
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
            provider: OVH_KEYED && model.kind === 'ovh' ? 'keyed' : 'keyless',
            providerName: model.name,
            family: model.family,
            model: model.id,
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
        lastMessage = `${model.name} 拒绝匿名访问`;
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
