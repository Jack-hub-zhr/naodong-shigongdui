// project store: state machine, selectors, persistence

import { ROLES } from './config.js';
import { getLang } from './i18n.js';

export const KEYS = {
  themeUser: 'fc-theme-user',
  project: 'fc-project',
  logs: 'fc-logs',
  route: 'fc-route',
  projects: 'fc-projects',
  view: 'fc-view',
  draft: 'fc-draft',
  heartbeat: 'fc-heartbeat',
};

export const STATUS = {
  PENDING: '准备中',
  BUILDING: '制作中',
  REVIEWING: '检查中',
  AWAITING_USER: '需要你确认',
  REWORKING: '修正中',
  DELIVERED: '已交付',
  PAUSED: '稍后继续',
};

export const STATUS_TONE = {
  PENDING: 'idle',
  BUILDING: 'run',
  REVIEWING: 'teal',
  AWAITING_USER: 'wait',
  REWORKING: 'run',
  DELIVERED: 'ok',
  PAUSED: 'fail',
};

/** stage index: 0 理解 / 1 制作 / 2 检查 / 3 交付 */
export function stageOf(status) {
  switch (status) {
    case 'PENDING': return 0;
    case 'BUILDING': return 1;
    case 'REVIEWING': return 2;
    case 'AWAITING_USER': return 2;
    case 'REWORKING': return 1;
    case 'DELIVERED': return 3;
    case 'PAUSED': return 1;
    default: return 0;
  }
}

const STATUS_EN = {
  PENDING: 'Queued', BUILDING: 'Building', REVIEWING: 'Checking',
  AWAITING_USER: 'Needs you', REWORKING: 'Fixing', DELIVERED: 'Delivered', PAUSED: 'Paused',
};

export function badgeOf(status) {
  const zh = STATUS[status] || STATUS.PENDING;
  return getLang() === 'en' ? (STATUS_EN[status] || zh) : zh;
}

/** 用运行阶段而不是 status 猜阶段，保证标题、阶段条、成员卡同源。 */
export function projectStage(p) {
  if (!p) return 0;
  if (p.status === 'DELIVERED' || p.phase === 'done' || p.phase === 'polish') return 3;
  if (p.phase === 'review' || p.phase === 'await') return 2;
  if (p.phase === 'build' || p.phase === 'apply' || p.phase === 'rework') return 1;
  if (p.phase === 'intake' || p.phase === 'plan') return 0;
  return Math.max(0, Math.min(3, Number(p.stage) || 0));
}

export function roundLabel(p) {
  if (!p || !(p.round > 0)) return getLang() === 'en' ? 'Preparing' : '准备中';
  return getLang() === 'en' ? `Round ${p.round}` : `第 ${p.round} 轮`;
}

export const STAGES = [
  { no: '01', key: 'understand', name: '理解' },
  { no: '02', key: 'build', name: '制作' },
  { no: '03', key: 'review', name: '检查' },
  { no: '04', key: 'deliver', name: '交付' },
];

// runtime state (not persisted)
export const state = {
  route: 'idea',
  project: null,
  projects: [],
  logs: [],
  view: 'timeline',
  autofollow: true,
  draft: '',
  tag: '工具',
  style: 'product',
  running: false,
  heartbeat: { lastOkAt: 0, lastTryAt: 0, ok: null, provider: '' },
  themeUser: 'system',
  lastSavedAt: 0,
  user: null,
  lang: 'zh',
  authChecked: false,
  syncing: false,
  cloudSavedAt: 0,
  cloudError: '',
};

let cloudSaver = null;
let cloudTimer = 0;

export function setCloudSaver(fn) {
  cloudSaver = typeof fn === 'function' ? fn : null;
}

function scheduleCloudSave() {
  if (!state.user || !cloudSaver || typeof window === 'undefined') return;
  if (cloudTimer) window.clearTimeout(cloudTimer);
  const delay = state.running ? 9000 : 2500;
  cloudTimer = window.setTimeout(async () => {
    cloudTimer = 0;
    if (!state.user || !cloudSaver) return;
    state.syncing = true;
    state.cloudError = '';
    try {
      await cloudSaver(accountPayload());
      state.cloudSavedAt = Date.now();
    } catch (error) {
      state.cloudError = error?.message || '同步失败';
    } finally {
      state.syncing = false;
      document.dispatchEvent(new CustomEvent('fc:cloud', { detail: { ok: !state.cloudError } }));
    }
  }, delay);
}

export function accountPayload() {
  return {
    projects: compactProjects(state.projects).map((p) => ({
      ...p,
      logs: (p.logs || []).slice(-60),
    })),
    currentId: state.project?.id || null,
  };
}

export function mergeAccountProjects(cloudProjects) {
  const local = state.projects || [];
  const byId = new Map();
  for (const p of [...cloudProjects, ...local]) {
    if (!p || !p.id) continue;
    const existing = byId.get(p.id);
    if (!existing || (p.updatedAt || 0) >= (existing.updatedAt || 0)) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 12);
}

export function applyAccountState(cloud) {
  const cloudProjects = Array.isArray(cloud?.projects) ? cloud.projects : [];
  state.projects = mergeAccountProjects(cloudProjects);
  const currentId = cloud?.currentId
    && state.projects.some((p) => p.id === cloud.currentId)
    ? cloud.currentId
    : state.projects[0]?.id;
  state.project = state.projects.find((p) => p.id === currentId) || null;
  state.logs = (state.project?.logs || []).slice(-120);
  if (state.project) {
    const idx = state.projects.findIndex((p) => p.id === state.project.id);
    if (idx !== -1) state.projects[idx] = state.project;
  }
  state.lastSavedAt = Date.now();
  saveNow();
}

export function clearAccountData() {
  state.project = null;
  state.projects = [];
  state.logs = [];
  state.route = 'idea';
  try {
    localStorage.removeItem(KEYS.project);
    localStorage.removeItem(KEYS.projects);
    localStorage.removeItem(KEYS.logs);
    localStorage.setItem(KEYS.route, JSON.stringify('idea'));
  } catch (e) {}
}

// persistence
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // quota exceeded: drop old artifacts and retry once
    try {
      const projects = (state.projects || []).slice(-3).map((p) => ({ ...p, artifact: null }));
      localStorage.setItem(KEYS.projects, JSON.stringify(projects));
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('本地存储写入失败', err);
    }
  }
}

let saveTimer = 0;
export function scheduleSave() {
  if (typeof window === 'undefined') return;
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    saveNow();
  }, 300);
}

export function saveNow() {
  if (state.project) {
    state.project.logs = state.logs.slice(-120);
    write(KEYS.project, state.project);
  }
  write(KEYS.logs, state.logs.slice(-220));
  write(KEYS.projects, compactProjects(state.projects));
  state.lastSavedAt = Date.now();
  scheduleCloudSave();
}

function compactProjects(list) {
  return (list || []).slice(0, 8).map((p) => ({
    ...p,
    logs: (p.logs || []).slice(-80),
  }));
}

export function loadTheme() {
  try {
    const user = localStorage.getItem(KEYS.themeUser) || 'system';
    state.themeUser = ['system', 'dark', 'light'].includes(user) ? user : 'system';
  } catch (e) {
    state.themeUser = 'system';
  }
  applyTheme();
}

export function applyTheme() {
  const system = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
  const theme = state.themeUser === 'system' ? system : state.themeUser;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-theme-user', state.themeUser);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F2F2F7' : '#000000');
  try { localStorage.setItem(KEYS.themeUser, state.themeUser); } catch (e) {}
  document.dispatchEvent(new CustomEvent('fc:theme', { detail: { theme, user: state.themeUser } }));
}

export function setThemeUser(user) {
  state.themeUser = user;
  applyTheme();
}

export function loadState() {
  state.projects = read(KEYS.projects, []) || [];
  state.project = read(KEYS.project, null);
  state.logs = read(KEYS.logs, []) || [];
  state.view = read(KEYS.view, 'timeline') === 'table' ? 'table' : 'timeline';
  try { state.lang = localStorage.getItem('fc-lang') === 'en' ? 'en' : 'zh'; } catch (e) { state.lang = 'zh'; }
  state.autofollow = read('fc-autofollow', true) !== false;
  state.draft = read(KEYS.draft, '') || '';
  state.style = read('fc-style', 'product') || 'product';
  state.heartbeat = read(KEYS.heartbeat, state.heartbeat) || state.heartbeat;
  if (state.project && !state.projects.some((p) => p.id === state.project.id)) {
    state.projects.push(snapshot(state.project));
  }
  state.projects = state.projects.map((p) => {
    if (state.project && p.id === state.project.id) {
      return { ...p, ...state.project, logs: (state.logs || p.logs || []).slice(-80) };
    }
    return p;
  });
  const savedRoute = read(KEYS.route, null);
  state.route = normalizeRoute(savedRoute);
}

export function normalizeRoute(route) {
  return ['idea', 'build', 'review', 'profile'].includes(route) ? route : 'idea';
}

export function setRoute(route, { push = true } = {}) {
  state.route = normalizeRoute(route);
  if (push) {
    const hash = '#/' + state.route;
    if (location.hash !== hash) history.pushState({ route: state.route }, '', hash);
  }
  write(KEYS.route, state.route);
  document.dispatchEvent(new CustomEvent('fc:route', { detail: state.route }));
}

// projects
export function titleFromPrompt(prompt) {
  const clean = String(prompt).replace(/\s+/g, ' ').trim();
  const cut = clean.replace(/^(帮我|请|给我|我想|想要|做一个|做个)/, '').trim();
  return (cut || clean).slice(0, 42);
}

export function newProject(prompt, tag) {
  const now = Date.now();
  const project = {
    id: 'p_' + now.toString(36),
    title: titleFromPrompt(prompt),
    prompt: String(prompt).trim(),
    tag,
    status: 'PENDING',
    stage: 0,
    phase: 'intake',
    autoRun: true,
    round: 0,
    revision: 1,
    maxRound: 3,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    roundStartedAt: now,
    agentStartedAt: now,
    pausedReason: null,
    pausedAt: null,
    nextRetryAt: null,
    pausedFrom: null,
    escalate: false,
    failedSignature: null,
    failedHistory: [],
    spec: null,
    decisions: [],
    artifact: null,
    report: null,
    delight: [],
    providerName: '默认服务',
    callsToday: 0,
    agentRuntime: {},
    awaitReason: null,
    costMs: 0,
  };
  state.project = project;
  state.logs = [];
  state.projects = [snapshot(project), ...state.projects.filter((p) => p.id !== project.id)];
  scheduleSave();
  return project;
}

export function removeProject(id) {
  state.projects = (state.projects || []).filter((p) => p.id !== id);
  if (state.project && state.project.id === id) {
    state.project = null;
    state.logs = [];
    try { localStorage.removeItem(KEYS.project); localStorage.removeItem(KEYS.logs); } catch (e) {}
  }
  try { localStorage.setItem(KEYS.projects, JSON.stringify(compactProjects(state.projects))); } catch (e) {}
  saveNow();
}

export function summarize(p) {
  return {
    id: p.id,
    title: p.title,
    tag: p.tag,
    status: p.status,
    stage: p.stage,
    round: p.round,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
    prompt: p.prompt,
  };
}

function snapshot(p) {
  return { ...p, logs: (state.logs || []).slice(-80) };
}

export function syncProjectSummary() {
  if (!state.project) return;
  const snap = snapshot(state.project);
  const idx = state.projects.findIndex((p) => p.id === snap.id);
  if (idx === -1) state.projects.push(snap);
  else state.projects[idx] = snap;
  state.projects = state.projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function touch(p, extra = {}) {
  p.updatedAt = Date.now();
  Object.assign(p, extra);
  syncProjectSummary();
  scheduleSave();
}

// logs
export function addLog(p, role, text, result = null, extra = {}) {
  const entry = {
    ts: Date.now(),
    ms: Date.now(),
    role,
    text: String(text),
    result: result || null,
    round: p ? p.round : 0,
    durationMs: extra.durationMs || 0,
    id: 'l_' + Math.random().toString(36).slice(2, 8),
  };
  state.logs.push(entry);
  if (state.logs.length > 240) state.logs = state.logs.slice(-240);
  if (p) {
    p.agentRuntime = p.agentRuntime || {};
    const key = ROLES[role]?.key;
    if (key) {
      const rt = (p.agentRuntime[key] = p.agentRuntime[key] || {});
      rt.recent = [{ ts: entry.ts, text: entry.text }, ...(rt.recent || [])].slice(0, 3);
    }
    p.updatedAt = entry.ts;
  }
  syncProjectSummary();
  scheduleSave();
  document.dispatchEvent(new CustomEvent('fc:log', { detail: entry }));
  return entry;
}

export function clearLogs() {
  state.logs = [];
  scheduleSave();
}

// agent selectors
const EST = { orch: 26000, product: 26000, builder: 52000, reviewer: 16000, pleaser: 20000 };
const BASE = { orch: 12, product: 8, builder: 8, reviewer: 12, pleaser: 0 };

function runtimeElapsed(p, key, now) {
  const rt = (p.agentRuntime || {})[key] || {};
  const running = rt.startedAt && p.status !== 'PAUSED';
  return (rt.elapsedMs || 0) + (running ? Math.max(0, now - rt.startedAt) : 0);
}

function progressFor(p, key, now) {
  const rt = (p.agentRuntime || {})[key] || {};
  if (rt.progress === 100) return 100;
  if (rt.progress != null && !rt.startedAt) return rt.progress;
  const elapsed = runtimeElapsed(p, key, now);
  const base = Math.max(BASE[key] || 0, rt.progressBase || 0);
  const span = EST[key] || 30000;
  return Math.max(base, Math.min(92, Math.round(base + (elapsed / span) * (92 - base))));
}

function agentState(p) {
  if (p.status === 'PAUSED') return 'paused';
  switch (p.phase) {
    case 'intake':
    case 'plan': return { orch: 'thinking', product: 'working', builder: 'standby', reviewer: 'standby', pleaser: 'standby' };
    case 'build': return { orch: 'thinking', product: 'done', builder: 'working', reviewer: 'standby', pleaser: 'standby' };
    case 'review': return { orch: 'thinking', product: 'done', builder: 'done', reviewer: 'reviewing', pleaser: 'standby' };
    case 'await': return { orch: 'blocked', product: 'done', builder: 'done', reviewer: 'done', pleaser: 'standby' };
    case 'apply':
    case 'rework': return { orch: 'thinking', product: 'done', builder: 'working', reviewer: 'standby', pleaser: 'standby' };
    case 'deliver': return { orch: 'done', product: 'done', builder: 'done', reviewer: 'done', pleaser: 'working' };
    case 'done': return { orch: 'done', product: 'done', builder: 'done', reviewer: 'done', pleaser: 'done' };
    default: return { orch: 'standby', product: 'standby', builder: 'standby', reviewer: 'standby', pleaser: 'standby' };
  }
}

export function agentAction(p, key, st) {
  if (!p) {
    return {
      orch: '等待新项目',
      product: '等统筹者派工',
      builder: '等策划者写规格',
      reviewer: '等产物，产物到了逐项检查',
      pleaser: '交付后做最后一公里打磨',
    }[key] || '待命';
  }
  if (p.status === 'PAUSED') {
    return `稍后继续 · ${pauseReasonText(p).short}`;
  }
  const round = Math.max(0, p.round);
  const when = round ? `第 ${round} 轮` : '准备第 1 轮';
  const map = {
    orch: {
      thinking: p.phase === 'plan' ? '正在拆成 4 个场景，定 3 轮上限' : `监督${when}：谁交了什么，下一步给谁`,
      blocked: p.awaitReason === 'escalate' ? '同一问题连续失败，等你定方向' : '需要你选一个版本',
      done: '已交付，等你打开或再做一版',
      standby: '等待新项目',
    },
    product: {
      working: `${when} · 把这句话拆成 4 条验收标准`,
      done: '交给编程者：4 条验收标准 + 1 个关键分叉',
      standby: '等统筹者派工',
    },
    builder: {
      working: p.phase === 'rework' || (p.reworkOrder && p.phase === 'build')
        ? `${when}修正 · 修掉 ${p.failedIds?.slice(0, 2).join(' / ') || '未通过项'}`
        : `${when}产出 · 先跑一遍再交出去`,
      done: `交给检查者：${when} HTML`,
      standby: '等策划者写规格',
    },
    reviewer: {
      reviewing: '逐条跑 12 项检查，只列必改项',
      done: p.report?.passed ? '交给统筹者：12 项全通过' : `交给统筹者：${p.report?.findings?.filter((f) => !f.passed).length || 0} 项未通过`,
      standby: '等产物，产物到了逐项检查',
    },
    pleaser: {
      working: '收字号、收颜色、补一次得分动效',
      done: '交给你：成品 + 做了什么',
      standby: '功能通过后进入最后一公里',
    },
  };
  return (map[key] && map[key][st]) || '';
}

export function deriveAgents(p, now = Date.now()) {
  const st = p ? agentState(p) : {};
  return ['orch', 'product', 'builder', 'reviewer', 'pleaser'].map((key) => {
    const role = Object.values(ROLES).find((r) => r.key === key);
    const s = st[key] || 'standby';
    const progress = !p || s === 'standby' ? 0 : s === 'done' ? 100 : s === 'paused' ? progressFor(p, key, p.pausedAt || now) : progressFor(p, key, now);
    const handoffs = (p?.handoffs || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
    const outgoing = handoffs.find((h) => ROLES[h.from]?.key === key);
    const incoming = handoffs.find((h) => ROLES[h.to]?.key === key);
    const handoff = outgoing
      ? `交付给 ${ROLES[outgoing.to]?.name || '你'}`
      : incoming ? `${ROLES[incoming.from]?.name || '团队'} 已交来` : '';
    return {
      key,
      name: role.name,
      role: role.en,
      letter: role.letter,
      state: s,
      label: stateLabel(s, key),
      action: agentAction(p, key, s),
      handoff,
      progress,
      round: (p && p.round) || 0,
      elapsedMs: p ? runtimeElapsed(p, key, p.status === 'PAUSED' ? p.pausedAt || now : now) : 0,
      recent: ((p && p.agentRuntime && p.agentRuntime[key]?.recent) || []).slice(0, 3),
      tone: toneOf(s),
    };
  });
}

export function stateLabel(s, key) {
  switch (s) {
    case 'thinking': return '正在拆解';
    case 'working': return '正在做';
    case 'reviewing': return '在检查';
    case 'blocked': return '需要你';
    case 'done': return '已完成';
    case 'paused': return '稍后继续';
    case 'standby': return '待命';
    default: return '待命';
  }
}

export function toneOf(s) {
  switch (s) {
    case 'thinking':
    case 'working': return 'run';
    case 'reviewing': return 'teal';
    case 'blocked': return 'wait';
    case 'done': return 'ok';
    case 'paused': return 'fail';
    default: return 'idle';
  }
}

export function workingCount(agents) {
  return agents.filter((a) => ['thinking', 'working', 'reviewing'].includes(a.state)).length;
}

export function pauseReasonText(p) {
  const map = {
    QUOTA: { short: '额度不足', long: '上游额度不足' },
    NO_PROVIDER: { short: '服务连接不可用', long: '当前服务连接不可用' },
    ERROR: { short: '服务连接故障', long: '服务连接暂时故障' },
    NETWORK: { short: '网络异常', long: '网络异常' },
  };
  return map[p?.pausedReason] || { short: '已暂停', long: '已暂停' };
}

// time format
export function formatRelative(ts, now = Date.now()) {
  if (!ts) return '—';
  const en = getLang() === 'en';
  const diff = Math.max(0, now - ts);
  if (diff < 6000) return en ? 'just now' : '刚刚';
  if (diff < 60_000) return en ? `${Math.floor(diff / 1000)}s ago` : `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3600_000) return en ? `${Math.floor(diff / 60_000)}m ago` : `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return en ? `${Math.floor(diff / 3600_000)}h ago` : `${Math.floor(diff / 3600_000)} 小时前`;
  return en ? `${Math.floor(diff / 86_400_000)}d ago` : `${Math.floor(diff / 86_400_000)} 天前`;
}

export function formatClock(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function formatMmSs(ms) {
  if (!ms || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDateTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString() === d.toDateString();
  const en = getLang() === 'en';
  if (sameDay) return en ? `Today ${p(d.getHours())}:${p(d.getMinutes())}` : `今天 ${p(d.getHours())}:${p(d.getMinutes())}`;
  if (yesterday) return en ? `Yesterday ${p(d.getHours())}:${p(d.getMinutes())}` : `昨天 ${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function stageProgress(p) {
  if (!p) return { index: 0, done: 0, total: 4, pct: 0 };
  const index = projectStage(p);
  const done = p.status === 'DELIVERED' ? 4 : index;
  return { index, done, total: 4, pct: Math.round((done / 4) * 100) };
}

export function projectPct(p) {
  if (!p) return 0;
  if (p.status === 'DELIVERED') return 100;
  return stageProgress(p).pct;
}

export function totalElapsed(p, now = Date.now()) {
  if (!p) return 0;
  const end = p.status === 'DELIVERED'
    ? (p.deliveredAt || p.updatedAt || now)
    : p.status === 'PAUSED' ? (p.pausedAt || now) : now;
  return Math.max(0, end - (p.startedAt || p.createdAt));
}

export function callsToday() {
  try {
    const raw = JSON.parse(localStorage.getItem('fc-calls') || '{}');
    const day = new Date().toISOString().slice(0, 10);
    return raw.day === day ? raw.n || 0 : 0;
  } catch (e) {
    return 0;
  }
}

export function bumpCalls() {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const raw = JSON.parse(localStorage.getItem('fc-calls') || '{}');
    const n = (raw.day === day ? raw.n || 0 : 0) + 1;
    localStorage.setItem('fc-calls', JSON.stringify({ day, n }));
    if (state.project) state.project.callsToday = n;
    return n;
  } catch (e) {
    return 0;
  }
}
