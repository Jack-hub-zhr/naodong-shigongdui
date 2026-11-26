// app entry: routing, views, crew panel, sheet, command palette

import {
  BRAND, COPY, ICONS, LOGO_SVG, ROLES, ROLE_ICONS, TAGS, RECIPES, API, STYLES,
} from './config.js';
import {
  state, KEYS, STAGES, STATUS, loadTheme, loadState, saveNow, scheduleSave,
  setRoute, setThemeUser, newProject, touch, addLog, deriveAgents, workingCount,
  badgeOf, stageOf, projectStage, roundLabel, projectPct, stageProgress, formatClock, formatRelative,
  formatMmSs, formatDateTime, totalElapsed, pauseReasonText, callsToday, summarize,
  normalizeRoute, setCloudSaver, applyAccountState, clearAccountData, accountPayload, removeProject,
} from './store.js';
import {
  complete, heartbeat, ApiError, authMe, registerAccount, loginAccount, logoutAccount,
  loadCloudState, saveCloudState, qwenProviderConfig, setQwenProviderConfig, QWEN_PROVIDERS,
} from './api.js';
import { advance, resumeFromPause, inspect, applyBaseStyle } from './pipeline.js';

const railEl = document.getElementById('rail');
const topbarEl = document.getElementById('topbar');
const pageEl = document.getElementById('page');
const crewEl = document.getElementById('crew');
const tabbarEl = document.getElementById('tabbar');
const workspaceEl = document.getElementById('workspace');
const overlayRoot = document.getElementById('overlay-root');
const toastRoot = document.getElementById('toast-root');
const paletteRoot = document.getElementById('palette-root');

const ui = {
  running: false,
  expanded: new Set(),
  sheet: null,
  palette: null,
  paletteIndex: 0,
  chatBusy: false,
  cleared: false,
  decisionIndex: 0,
  follow: false,
  advanced: false,
  logsOpen: false,
  authMode: 'login',
  authBusy: false,
};

let lastRenderedRoute = null;
let pageAnimTimer = 0;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

setCloudSaver(saveCloudState);

const tagLabel = (k) => (TAGS.find((t) => t.key === k)?.label || k || '未分类');
const PRESSABLE = '.btn, .icon-btn, .search-pill, .account-btn, .nav-item, .tabbar button, .chip, .recipe, .agent-card, .option, .recent-row, .sheet-close';
let pressedEl = null;
function clearPress() {
  if (pressedEl) pressedEl.classList.remove('is-pressed');
  pressedEl = null;
}
document.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  const el = ev.target.closest(PRESSABLE);
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  clearPress();
  pressedEl = el;
  el.classList.add('is-pressed');
}, { passive: true });
window.addEventListener('pointerup', clearPress, { passive: true });
window.addEventListener('pointercancel', clearPress, { passive: true });
window.addEventListener('blur', clearPress);
document.addEventListener('pointerout', (ev) => {
  if (!pressedEl || !pressedEl.contains(ev.target) || pressedEl.contains(ev.relatedTarget)) return;
  clearPress();
}, { passive: true });


const ROLE_DOT = {
  ORCHESTRATOR: 'run',
  PRODUCT: 'info',
  BUILDER: 'run',
  REVIEWER: 'teal',
  PLEASER: 'violet',
  USER: 'wait',
  SYSTEM: 'idle',
};

const RESULT_PILL = {
  pass: { tone: 'ok', label: '通过' },
  fail: { tone: 'fail', label: '未通过' },
  wait: { tone: 'wait', label: '待拍板' },
  run: { tone: 'run', label: '进行中' },
};

function pill(text, tone = 'idle', extra = '') {
  return `<span class="pill" data-tone="${tone}" ${extra}><span class="dot"></span>${esc(text)}</span>`;
}

function rel(ts) {
  return formatRelative(ts);
}

function fmtElapsed(ms) {
  return ms ? formatMmSs(ms) : '—';
}

function currentProject() {
  return state.project;
}

function hasProject() {
  return Boolean(state.project);
}

function isMobile() {
  return window.matchMedia('(max-width: 760px)').matches;
}

function isTablet() {
  return window.matchMedia('(max-width: 1080px)').matches;
}

// engine loop
function deps() {
  return {
    call: (args) => complete(args),
    log: (role, text, result) => {
      addLog(state.project, role, text, result);
      if (state.route === 'build') renderPage();
      renderCrew();
      renderChrome();
    },
    save: () => {
      scheduleSave();
    },
  };
}

async function runEngine({ resume = false } = {}) {
  const p = state.project;
  if (!p || ui.running) return;
  if (p.phase === 'await' || p.phase === 'done') {
    renderAll();
    return;
  }
  ui.running = true;
  renderCrew();
  try {
    await advance(p, deps());
    if (state.project !== p) return;
  } catch (err) {
    console.error('[crew]', err);
    toast('团队异常：' + (err?.message || '未知错误'), 'err');
    if (p.status !== 'PAUSED') {
      p.status = 'PAUSED';
      p.pausedReason = 'ERROR';
      p.pausedAt = Date.now();
      p.nextRetryAt = Date.now() + 60_000;
      addLog(p, 'SYSTEM', '流程异常，已暂停并准备续跑', 'fail');
      saveNow();
    }
  } finally {
    ui.running = false;
    if (state.project === p) saveNow();
    renderAll();
  }
}

function resumeIfNeeded() {
  if (!state.user) return;
  const p = state.project;
  if (!p || p.autoRun === false) return;
  if (p.status === 'PAUSED') {
    if (p.nextRetryAt && Date.now() >= p.nextRetryAt) {
      resumeFromPause(p);
      addLog(p, 'SYSTEM', '服务连接恢复，团队续跑', null);
      saveNow();
      runEngine();
    }
    return;
  }
  const active = ['intake', 'plan', 'build', 'review', 'apply', 'deliver', 'polish'].includes(p.phase);
  if (active && p.status !== 'DELIVERED') {
    if (p.phase === 'polish') {
      addLog(p, 'SYSTEM', '恢复上次未完成的打磨说明', null);
    } else {
      addLog(p, 'SYSTEM', '检测到未完成的制作，自动续跑', null);
    }
    runEngine({ resume: true });
  }
}

function checkPauseTimer() {
  if (!state.user) return;
  const p = state.project;
  if (!p || p.status !== 'PAUSED') return;
  if (p.nextRetryAt && Date.now() >= p.nextRetryAt) {
    resumeFromPause(p);
    addLog(p, 'SYSTEM', '按计划自动续跑', null);
    saveNow();
    runEngine();
  }
}

// render: rail / topbar / tabs
function navCount(route) {
  if (route === 'idea') return state.projects.length || '';
  return '';
}

function renderRail() {
  const p = state.project;
  const agents = deriveAgents(p);
  railEl.innerHTML = `
    <div class="brand" data-nav="idea" role="button" tabindex="0">
      <div class="brand-mark">${LOGO_SVG}</div>
      <div class="brand-text"><b>${BRAND.name}</b><span>${BRAND.sub}</span></div>
    </div>
    <div class="rail-label">工作台</div>
    <div class="nav">
      <button class="nav-item ${state.route === 'idea' ? 'active' : ''}" data-new="1" type="button" aria-label="${COPY.nav.idea}" aria-current="${state.route === 'idea' ? 'page' : 'false'}">
        ${ICONS.newProject}<span>${COPY.nav.idea}</span>${state.projects.length ? `<span class="count">${state.projects.length}</span>` : ''}
      </button>
      <button class="nav-item ${state.route === 'profile' ? 'active' : ''}" data-nav="profile" type="button" aria-current="${state.route === 'profile' ? 'page' : 'false'}">
        ${ICONS.profile}<span>我的</span>
      </button>
    </div>
    <div class="rail-foot">
      <div class="row"><span class="dot ${agents.some((a) => ['working', 'thinking', 'reviewing'].includes(a.state)) ? 'run' : 'ok'}"></span>服务在线</div>
      <div class="row"><span>${workingCount(agents)} 名成员在忙</span></div>
    </div>`;
}

function crumbsHtml() {
  const p = state.project;
  if ((state.route === 'build' || state.route === 'review') && p) {
    return `<button class="crumb-link" data-nav="idea" type="button">项目</button><span class="sep">/</span><span class="current">${esc(p.title)}</span>`;
  }
  return `<button class="crumb-link" data-nav="idea" type="button">项目</button><span class="sep">/</span><span class="current">${state.route === 'profile' ? '我的' : COPY.nav.idea}</span>`;
}

function renderTopbar() {
  const p = state.project;
  const agents = deriveAgents(p);
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const themeLabel = { light: '切换为深色', dark: '切换为着色', tinted: '切换为亮色' }[theme] || '切换外观';
  const themeIcon = theme === 'light' ? ICONS.moon : theme === 'dark' ? ICONS.tint : ICONS.sun;
  const alert = p && p.status === 'AWAITING_USER';
  topbarEl.innerHTML = `
    <div class="crumbs">${crumbsHtml()}</div>
    <div class="topbar-actions">
      <button class="search-pill" id="open-palette" type="button" aria-label="搜索与命令">
        ${ICONS.search}<span>搜索</span><kbd>⌘K</kbd>
      </button>
      <button class="crew-trigger" id="open-crew" type="button" aria-label="打开团队状态台">
        ${ICONS.sliders}<span class="label">团队</span>
        <span class="badge">${workingCount(agents)}</span>
      </button>
      <button class="icon-btn guide-btn" id="open-guide" type="button" aria-label="使用说明" title="使用说明">${ICONS.info}</button>
      <button class="icon-btn" id="toggle-theme" type="button" aria-label="${themeLabel}" title="${themeLabel}">
        ${themeIcon}
      </button>
      <button class="account-btn" data-account type="button" aria-label="${state.user ? '账号' : '登录以同步项目'}">
        <span class="avatar">${state.user ? esc((state.user.name || state.user.email || '你').slice(0, 1)) : ICONS.profile}</span>
        <span class="account-name">${state.user ? esc(state.user.name || state.user.email.split('@')[0]) : '同步'}</span>
      </button>
    </div>`;
}

function renderTabbar() {
  const p = state.project;
  const items = [
    { key: 'projects', route: 'idea', icon: 'idea', label: '项目' },
    { key: 'new', new: true, icon: 'idea', label: '新建' },
    { key: 'profile', route: 'profile', icon: 'profile', label: '我的' },
  ];
  tabbarEl.innerHTML = items.map((item) => {
    const active = item.route && state.route === item.route;
    const alert = item.key === 'projects' && p && p.status === 'AWAITING_USER';
    const attr = item.new ? 'data-new="1"' : `data-nav="${item.route}"`;
    return `<button type="button" ${attr} aria-current="${active ? 'page' : 'false'}">
      ${item.new ? '<span class="plus tab-plus">＋</span>' : ICONS[item.icon]}<span>${item.label}</span>
      ${alert ? '<span class="badge-dot"></span>' : ''}
    </button>`;
  }).join('');
}

// render: crew panel
function agentCard(a, opts = {}) {
  const expanded = ui.expanded.has(a.key);
  const avatarClass = a.state === 'working' || a.state === 'thinking' ? 'hot'
    : a.state === 'done' ? 'ok' : a.state === 'blocked' ? 'wait' : '';
  const statePill = pill(a.label, a.tone, a.state === 'thinking' || a.state === 'working' ? 'data-breath="1"' : '');
  return `<button class="agent-card ${opts.mini ? 'mini' : ''} ${opts.focus ? 'focus' : ''}" data-agent="${a.key}" type="button"
      aria-expanded="${expanded}" ${a.state === 'blocked' ? 'data-breath="1"' : ''}>
    <div class="top">
      <div class="agent-avatar ${avatarClass}">${ROLE_ICONS[a.key] || a.letter}</div>
      <div class="agent-id"><b>${a.name}<em>${a.role}</em></b></div>
      <div class="state">${statePill}</div>
    </div>
    <div class="agent-action">${esc(a.action)}</div>
    ${a.handoff || a.elapsedMs ? `<div class="agent-meta">
      ${a.handoff ? `<span>${esc(a.handoff)}</span>` : ''}
      <span>${a.state === 'done' ? '已完成' : a.elapsedMs ? fmtElapsed(a.elapsedMs) : ''}</span>
    </div>` : ''}
  </button>`;
}

function crewBodyHtml(p, { mini = false } = {}) {
  if (!p) {
    const dummy = { agentRuntime: {}, status: 'PENDING', phase: 'idle', round: 0, decisions: [], spec: null };
    const agents = deriveAgents(dummy);
    return `${dummyCards(agents, mini)}`;
  }
  const agents = deriveAgents(p);
  const prog = stageProgress(p);
  const nowStage = STAGES[prog.index] || STAGES[0];
  const focusKey = (agents.find((a) => a.state === 'blocked')
    || agents.find((a) => a.state === 'reviewing')
    || agents.find((a) => a.state === 'working')
    || agents.find((a) => a.state === 'thinking')
    || agents[0])?.key;
  return `
    <div class="crew-task">
      <div class="row"><span>当前任务</span><span class="r">${roundLabel(p)}</span></div>
      <div class="title">${esc(p.title)}</div>
      <div class="stage-row"><span>现在 · ${nowStage.name}</span><span>${prog.done} / ${prog.total} 阶段完成</span></div>
      <div class="stage-dots">${STAGES.map((st, i) => `<span class="${i < prog.done ? 'done' : i === prog.index ? 'active' : ''}">${st.no}</span>`).join('')}</div>
    </div>
    <div class="agent-grid">${agents.map((a) => agentCard(a, { mini, focus: a.key === focusKey })).join('')}</div>`;
}

function dummyCards(agents, mini) {
  return `<div class="crew-empty">团队待命中。<br>写一句想法，5 名成员会立刻进场。</div>`
    + `<div class="agent-grid">${agents.map((a, i) => agentCard(a, { mini, focus: i === 0 })).join('')}</div>`;
}

function renderCrew() {
  const p = state.project;
  const agents = deriveAgents(p);
  const header = `
    <div class="crew-head">
      <div class="row"><h2>团队</h2><span class="live"><span class="dot ${p && ['BUILDING', 'REVIEWING', 'REWORKING'].includes(p.status) ? 'run' : 'ok'}"></span>${COPY.live}</span></div>
      <div class="crew-sub"><span>${agents.length} 名成员</span><span>·</span><span>${workingCount(agents)} 名作业中</span><span>·</span><span>${p ? '服务在线' : '待命中'}</span></div>
    </div>`;
  const scrollTop = crewEl.querySelector('.crew-body')?.scrollTop || 0;
  crewEl.innerHTML = `${header}
    <div class="crew-body">${crewBodyHtml(p)}</div>
    <div class="crew-foot">
      <span>${p ? `${roundLabel(p)} · 最后更新 ${rel(p.updatedAt)}` : '等待第一个想法'}</span>
      <span class="side">${p ? '<button class="btn" data-nav="profile" type="button">更多记录</button>' : ''}</span>
    </div>`;
  const body = crewEl.querySelector('.crew-body');
  if (body) body.scrollTop = scrollTop;
}

// render: page dispatch
function renderPage() {
  const active = document.activeElement;
  const focusId = active && active.id ? active.id : null;
  const selStart = active && 'selectionStart' in active ? active.selectionStart : null;
  const entering = lastRenderedRoute !== state.route;
  lastRenderedRoute = state.route;

  const scrollTop = workspaceEl.scrollTop;
  let html = '';
  if (state.route === 'idea') html = ideaHtml();
  else if (state.route === 'build') html = buildHtml();
  else if (state.route === 'review') html = buildHtml();
  else html = profileHtml();
  pageEl.innerHTML = html;
  if (entering) {
    pageEl.classList.remove('page-enter');
    void pageEl.offsetWidth;
    pageEl.classList.add('page-enter');
    clearTimeout(pageAnimTimer);
    pageAnimTimer = setTimeout(() => pageEl.classList.remove('page-enter'), 650);
  }
  workspaceEl.scrollTop = scrollTop;

  bindPageEvents();
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (selStart != null && 'setSelectionRange' in el) {
        try { el.setSelectionRange(selStart, selStart); } catch (e) {}
      }
    }
  }
  hydrate();
}

function renderChrome() {
  renderRail();
  renderTopbar();
  renderTabbar();
  document.getElementById('app').dataset.route = state.route;
}

function renderAll() {
  renderChrome();
  renderCrew();
  renderPage();
}

// view: idea
function recipeList() {
  return RECIPES.map((text, i) => `
    <button class="recipe" data-recipe="${i}" type="button">
      <span class="no">0${i + 1}</span><span>${esc(text)}</span>
    </button>`).join('');
}

function recentItems() {
  return (state.projects || []).slice(0, 6);
}

function statusPillOf(item) {
  const tone = { DELIVERED: 'ok', AWAITING_USER: 'wait', BUILDING: 'run', REVIEWING: 'run', REWORKING: 'run', PAUSED: 'fail' }[item.status] || 'idle';
  return pill(badgeOf(item.status), tone);
}

function ideaHtml() {
  const projects = recentItems();
  const p = state.project;
  const agents = deriveAgents(p);
  const online = state.heartbeat.ok !== false;
  const styleKey = state.style || 'product';
  const style = STYLES.find((x) => x.key === styleKey) || STYLES[2];
  const rows = projects.map((item) => `
    <tr data-open="${esc(item.id)}">
      <td class="title">${esc(item.title)}<span class="tag">${esc(item.tag)}</span></td>
      <td class="dim">${esc(item.styleLabel || STYLES.find((x) => x.key === item.style)?.label || '产品风')}</td>
      <td>${statusPillOf(item)}</td>
      <td class="dim">${rel(item.updatedAt)}</td>
      <td class="go">→</td>
    </tr>`).join('');
  const mobileRows = projects.map((item) => `
    <div class="recent-row" data-open="${esc(item.id)}" role="button" tabindex="0">
      <div class="txt"><b>${esc(item.title)}</b><span>${statusPillOf(item)}<span>${roundLabel(item)}</span><span>${rel(item.updatedAt)}</span></span></div>
      <span class="chev">›</span>
    </div>`).join('');

  return `
  <div class="eyebrow">01 <i>·</i> 项目</div>
  <h1 class="page-title idea-title">说一句，<br>五个人把它做出来。</h1>
  <p class="page-lead">${COPY.lead.idea}</p>

  <div class="promise-row"><span class="dot ok"></span><span>预计 3–8 分钟</span><span>·</span><span>最多 3 轮</span><span>·</span><span>只会问你 1 次</span></div>
  <p class="budget-note">${COPY.budgetNote}</p>

  <div class="idea-grid">
    <div class="idea-main">
      <div class="composer">
        <textarea id="composer-input" placeholder="${esc(COPY.placeholder)}" enterkeyhint="send" aria-label="项目想法">${esc(state.draft)}</textarea>
        <div class="composer-error" id="composer-error" hidden></div>
        <div class="composer-advanced">
          <button class="advanced-toggle" id="toggle-advanced" type="button" aria-expanded="${ui.advanced}">
            <span>高级选项</span><span class="current">${style.label} · ${tagLabel(state.tag)}</span><span class="chev">${ui.advanced ? '−' : '+'}</span>
          </button>
          ${ui.advanced ? `<div class="advanced-body">
            <div class="advanced-row"><span class="label">风格</span>
              <div class="style-chips">
                ${STYLES.map((x) => `<button class="style-chip" type="button" data-style="${x.key}" aria-pressed="${styleKey === x.key}"><b>${x.label}</b><span>${x.note}</span></button>`).join('')}
              </div>
            </div>
            <div class="advanced-row"><span class="label">类型</span>
              <div class="chips" id="tag-chips">
                ${TAGS.map((t) => `<button class="chip" type="button" data-tag="${t.key}" aria-pressed="${state.tag === t.key}">${t.label}</button>`).join('')}
              </div>
            </div>
          </div>` : ''}
        </div>
        <div class="composer-foot">
          <div class="composer-hint">${ICONS.info}<span>${COPY.queueHint}</span></div>
          <button class="btn primary" id="dispatch" type="button">${COPY.dispatch} <span class="arrow">→</span></button>
        </div>
      </div>
      <div class="flow-strip">
        <div class="flow-avatars">${agents.map((a) => `<span>${ROLE_ICONS[a.key] || a.letter}</span>`).join('')}</div>
        <div class="txt">统筹者拆解 · 策划者定标准 · 编程者制作 · 检查者检查 · 打磨者打磨。服务${online ? '在线' : '连接中'}。</div>
      </div>
    </div>
    <aside>
      <div class="aside-title">${COPY.recipesTitle}</div>
      <div class="recipe-list recipes">${recipeList()}</div>
      <div class="team-mini">
        <div class="aside-title" style="margin-top:18px">这五个人怎么接</div>
        <div class="team-row"><b>统筹者</b><span>拆成 4 个场景，定 3 轮上限</span></div>
        <div class="team-row"><b>策划者</b><span>写下什么算完成</span></div>
        <div class="team-row"><b>编程者</b><span>先跑一遍再交出去</span></div>
        <div class="team-row"><b>检查者</b><span>只认检查结果，不靠感觉</span></div>
        <div class="team-row"><b>打磨者</b><span>收字、收色、收动效</span></div>
      </div>
    </aside>
  </div>

  <section class="section">
    <div class="section-head">
      <h2>项目</h2>
      <span class="meta">${projects.length} 个 · 最近更新</span>
      <span class="spacer"></span>
      <button class="btn small" data-nav="profile" type="button">全部记录</button>
    </div>
    ${projects.length ? `
      <table class="recent-table">
        <thead><tr><th>名称</th><th>风格</th><th>状态</th><th>更新</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="recent-rows">${mobileRows}</div>
    ` : `<div class="empty"><b>${COPY.emptyRecent}</b></div>`}
  </section>`;
}

// view: build
function timelineHtml(p) {
  if (!p || !state.logs.length) {
    return `<div class="empty" style="margin-top:12px">${esc(COPY.emptyBuildHint)}</div>`;
  }
  const groups = new Map();
  state.logs.forEach((log) => {
    const r = log.round || 0;
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(log);
  });
  const rounds = [...groups.keys()].sort((a, b) => a - b);
  const now = Date.now();
  return `<div class="log-card">
    <div class="log-card-head">
      <span>操作记录</span><span>·</span><span>按轮次分组</span>
      <div class="right"><span>角色: 5</span><span>耗时 ${fmtElapsed(totalElapsed(p, now))}</span></div>
    </div>
    ${rounds.map((round) => {
      const logs = groups.get(round);
      const first = logs[0].at || now;
      const last = logs[logs.length - 1].at || now;
      const live = round === p.round && ['BUILDING', 'REVIEWING', 'REWORKING'].includes(p.status);
      const dur = (live ? now : last) - (round === p.round ? (p.roundStartedAt || first) : first);
      const result = live ? RESULT_PILL.run : (p.report?.round === round ? (p.report.passed ? RESULT_PILL.pass : RESULT_PILL.fail) : null);
      return `<div class="round-group">
        <div class="round-head">
          <span class="no">第 ${round} 轮</span>
          <span class="chip-mini">${logs.length} 条记录</span>
          <span class="line"></span>
          <span class="dur">本轮 ${fmtElapsed(Math.max(0, dur))}</span>
          ${result ? `<span class="result">${pill(result.label, result.tone)}</span>` : ''}
        </div>
        ${logs.map((log) => {
          const role = ROLES[log.role] || ROLES.SYSTEM;
          const res = log.result ? RESULT_PILL[log.result] : null;
          return `<div class="log-row ${log.result === 'fail' ? 'fail' : ''}">
            <span class="ts" data-time="${log.ts || log.at}" title="${new Date(log.ts || log.at).toLocaleString()}">${formatClock(log.ts || log.at)}</span>
            <span class="who" data-role="${log.role}"><span class="dot ${ROLE_DOT[log.role] || 'idle'}"></span>${role.name}</span>
            <span class="text">${esc(log.text)}</span>
            <span class="res">${res ? pill(res.label, res.tone) : ''}</span>
          </div>`;
        }).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

function statusTableHtml(p) {
  const agents = deriveAgents(p);
  return `<div class="status-table-wrap">
    <table class="status-table">
      <thead><tr><th role="columnheader">成员</th><th>现在在做什么</th><th>产出去向</th><th>本次用时</th><th>状态</th></tr></thead>
      <tbody>
        ${agents.map((a) => `<tr>
          <td class="who"><span class="mini-avatar">${ROLE_ICONS[a.key] || a.letter}</span><span>${a.name}<span class="sub">${a.role}</span></span></td>
          <td>${esc(a.action)}</td>
          <td>${esc(a.handoff || '—')}</td>
          <td class="mono">${fmtElapsed(a.elapsedMs)}</td>
          <td>${pill(a.label, a.tone)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function stepperHtml(p) {
  const stage = projectStage(p);
  const fail = p.status === 'PAUSED' ? -1 : (p.report && !p.report.passed && p.phase === 'review' ? stage : -1);
  return `<div class="stepper">${STAGES.map((s, i) => {
    const done = i < stage || (p.status === 'DELIVERED');
    const active = i === stage && p.status !== 'DELIVERED';
    const isFail = i === fail;
    return `<div class="step ${done ? 'done' : ''} ${active ? 'active' : ''} ${isFail ? 'fail' : ''} ${!done && !active ? 'idle' : ''}">
      <span class="no">${s.no}</span>
      <span class="name"><span class="dot"></span>${s.name}</span>
    </div>`;
  }).join('')}</div>`;
}

function isQuotaPause(p) {
  return p?.status === 'PAUSED' && (p.pausedReason === 'QUOTA' || p.pausedReason === 'RATE_LIMIT');
}

function pauseBanner(p) {
  if (p.status !== 'PAUSED') return '';
  const reason = pauseReasonText(p);
  const secs = p.nextRetryAt ? Math.max(0, Math.ceil((p.nextRetryAt - Date.now()) / 1000)) : null;
  if (p.pausedReason === 'USER') {
    return `<div class="pause-banner">
      <span class="dot wait"></span>
      <span><b>任务已暂停</b>，进度和已生成的版本都保留着。</span>
      <span class="act"><button class="btn small primary" id="resume-task" type="button">继续任务</button></span>
    </div>`;
  }
  if (isQuotaPause(p)) {
    return `<div class="pause-banner pause-error">
      <span class="dot err"></span>
      <span><b>这轮没有成功</b> ${secs != null ? `· 免费额度暂时用完，${secs} 秒后自动重试` : '· 免费额度暂时用完'}</span>
      <span class="act"><button class="btn small" id="resume-now" type="button">立即重试</button><button class="btn small" data-nav="profile" type="button">换模型</button></span>
    </div>`;
  }
  return `<div class="pause-banner pause-error">
    <span class="dot err"></span>
    <span><b>${reason.long}</b> ${secs != null ? `，${secs} 秒后自动续跑` : '，需要你换一个可用连接或立即重试'}</span>
    <span class="act"><button class="btn small" id="resume-now" type="button">立即重试</button><button class="btn small" data-nav="profile" type="button">换模型</button></span>
  </div>`;
}

function humanStatus(p) {
  const next = p.nextRetryAt ? formatClock(p.nextRetryAt) : '';
  if (p.status === 'PAUSED') {
    if (p.pausedReason === 'USER') return '任务已暂停，进度已保存，随时可以继续。';
    if (isQuotaPause(p)) return `这轮免费额度用完了，${next ? next + ' ' : ''}自动再试；也可以换模型或立即重试。`;
    return `这轮没有成功，${next ? next + ' ' : ''}会自动再试；也可以点“立即重试”或去我的页换一个连接。`;
  }
  if (p.status === 'AWAITING_USER') {
    if (p.awaitReason === 'escalate') return '同一个问题连续两轮没修好，需要你定个方向。';
    return `需要你选一个版本 · 两个都能用，差别在${p.decisions?.[0]?.topic || '节奏'}。`;
  }
  if (p.status === 'DELIVERED') {
    const pass = p.report?.passed;
    return `做好了，${pass ? '12 项检查全部通过' : '已按你的选择交付'} · 点开就能用。`;
  }
  if (p.phase === 'intake' || p.phase === 'plan') return '统筹者和策划者在拆这句话：定 4 个场景、3 轮上限和 4 条完成标准 · 约 20 秒。';
  if (p.status === 'REVIEWING') return `检查者在检查第 ${p.round} 轮：逐条看检查结果，不靠感觉 · 约 30 秒出结果。`;
  if (p.status === 'REWORKING') {
    const why = (p.failedIds || []).slice(0, 2).map((id) => {
      const f = (p.report?.findings || []).find((x) => x.id === id);
      return f ? `${id} ${f.check}` : id;
    }).join('、');
    return `第 ${p.round} 轮修正：编程者在改${why ? '「' + why + '」' : '上一轮没过的项'} · 约 40 秒后复检。`;
  }
  if (p.status === 'BUILDING') return `编程者在${roundLabel(p)}制作 · 先自己跑一遍，约 40–60 秒后交给检查者。`;
  return '统筹者在拆这句话：先定 3 轮上限，再交给策划者写完成标准 · 约 20 秒。';
}

function stageDetailHtml(p) {
  if (!p || p.status === 'DELIVERED' || p.status === 'AWAITING_USER') return '';
  const idx = projectStage(p);
  const defs = [
    { no: '01', title: '理解', owner: '统筹者 → 策划者', text: '把一句话拆成 4 个场景，定 3 轮上限；策划者写下 4 条能检查的完成标准。', items: ['不问你细节，先按最合理的理解开工', '写清不做什么，避免范围膨胀'] },
    { no: '02', title: '制作', owner: '编程者', text: '按四段结构和风格 token 写 HTML/CSS，先自己跑一遍，再把脚本补上。', items: ['色、字、距、角、影全部来自 tokens', '先交付可打开的页面，再补交互'] },
    { no: '03', title: '检查', owner: '检查者', text: '12 项检查逐条过：结构、交互、首屏主张、内容真实、三档不横滚。', items: ['不过就回到第 N 轮修正，不拿感觉当结论', '只把需要你决定的点留给你'] },
    { no: '04', title: '交付', owner: '打磨者 → 你', text: '收字、收色、收动效，附上做了什么与没做什么；成品随时能带走。', items: ['打开 / 分享 / 再做一版 / 导出', '10 分钟内可撤回确认'] },
  ];
  return `<section class="stage-detail">
    ${defs.map((d, i) => `<div class="stage-line ${i === idx ? 'current' : ''}">
      <span class="no">${d.no}</span>
      <div class="body"><div class="head"><b>${d.title}</b><span>${d.owner}</span>${i === idx ? '<em class="now">现在</em>' : ''}</div>
      ${i === idx ? `<p>${d.text}</p><ul>${d.items.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}</div>
    </div>`).join('')}
  </section>`;
}

function humanHandoffNote(note) {
  const text = String(note || '');
  if (/data-acceptance|落点/.test(text)) return '有完成标准没有落到页面上';
  return text;
}

function handoffsHtml(p) {
  const list = (p?.handoffs || []).slice(-6).reverse();
  if (!list.length) return '';
  return `<section class="section handoff-section">
    <div class="section-head">
      <h2>团队交接</h2>
      <span class="meta">谁把什么交给谁 · 最新在上 · 最近 ${list.length} 次</span>
    </div>
    <div class="handoff-list">
      ${list.map((h) => {
        const from = ROLES[h.from] || ROLES.SYSTEM;
        const to = ROLES[h.to] || ROLES.SYSTEM;
        return `<div class="handoff-row">
          <div class="handoff-route"><b>${esc(from.name)}</b><span class="handoff-arrow">→</span><b>${esc(to.name)}</b></div>
          <div class="handoff-main"><b>${esc(h.deliverable)}</b>${h.note ? `<span>${esc(humanHandoffNote(h.note))}</span>` : ''}</div>
          ${h.round ? `<span class="handoff-round">第 ${h.round} 轮</span>` : ''}
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

function projectStyleLabel(p) {
  return (STYLES.find((x) => x.key === (p?.style || 'product')) || STYLES[2]).label;
}

function taskControls(p) {
  const pausedByUser = p.status === 'PAUSED' && p.pausedReason === 'USER';
  const active = ['BUILDING', 'REVIEWING', 'REWORKING'].includes(p.status);
  return `<div class="task-controls">
    ${active ? '<button class="btn small" id="pause-task" type="button">暂停任务</button>' : ''}
  </div>`;
}

function deliverActions(p) {
  if (p.status !== 'DELIVERED' || !p.artifact) return '';
  const canUndo = p.deliveredAt && Date.now() - p.deliveredAt < 10 * 60_000;
  return `<div class="deliver-actions">
    <button class="btn primary" id="open-artifact" type="button">打开成品</button>
    <button class="btn" id="export-artifact" type="button">导出</button>
    <button class="btn" id="share-artifact" type="button">分享</button>
    <button class="btn" id="another-version" type="button">再做一版</button>
    ${canUndo ? '<button class="btn ghost" id="undo-delivery" type="button">撤回确认</button>' : ''}
  </div>`;
}

function recordsHtml(p) {
  const count = state.logs.length;
  return `<section class="section records">
    <button class="records-toggle" id="toggle-logs" type="button" aria-expanded="${ui.logsOpen}">
      <span>过程记录</span><span class="count">${count} 条</span><span class="chev">${ui.logsOpen ? '−' : '+'}</span>
    </button>
    ${ui.logsOpen ? `<div class="records-body">
      <div class="log-head">
        <span class="dim">按轮分组 · 默认只看结论，需要时展开</span>
        <span class="spacer" style="flex:1"></span>
        <div class="segmented" role="tablist">
          <button type="button" data-view="timeline" aria-selected="${state.view === 'timeline'}">${COPY.timeline}</button>
          <button type="button" data-view="table" aria-selected="${state.view === 'table'}">${COPY.statusTable}</button>
        </div>
      </div>
      ${state.view === 'timeline' ? timelineHtml(p) : statusTableHtml(p)}
      ${p ? `<div class="records-danger"><button class="danger-link" id="delete-task" type="button">删除这个任务</button><span>删除后本地和云端都会移除，不能恢复</span></div>` : ''}
    </div>` : ''}
  </section>`;
}

const CREW_ORDER = ['ORCHESTRATOR', 'PRODUCT', 'BUILDER', 'REVIEWER', 'PLEASER'];

function accountDisplayName() {
  return state.user?.name || '访客';
}

function ensureTeamChat(p) {
  const name = accountDisplayName();
  if (!Array.isArray(p.chat)) p.chat = [];
  // 只清掉旧版自动生成的五条敬礼，不制造新的自动消息。
  if (p.chat.every((m) => m.salute)) p.chat = [];
  if (p.chatName === name) return;
  p.chatName = name;
  saveNow();
}

function chatMessageHtml(m) {
  const role = ROLES[m.role] || ROLES.SYSTEM;
  const me = m.role === 'USER';
  const tag = m.kind === 'requirement' ? '<span class="chat-tag">已记入要求</span>' : '';
  const rebuild = m.action === 'rebuild'
    ? '<button class="btn small chat-rebuild" type="button" data-chat-rebuild>按新要求再做一版</button>'
    : '';
  return `<div class="chat-msg ${me ? 'me' : ''}">
    <span class="chat-avatar">${ROLE_ICONS[role.key] || esc(role.letter)}</span>
    <div class="chat-bubble"><b>${esc(role.name)}</b><p>${esc(m.text)}</p>${tag}${rebuild}</div>
  </div>`;
}

function chatTypingHtml() {
  return `<div class="chat-msg chat-typing">
    <span class="chat-avatar">统</span>
    <div class="chat-bubble"><b>统筹者</b><p>正在看项目进度并回复<span class="typing-dots"><i></i><i></i><i></i></span></p></div>
  </div>`;
}

function scrollChatBottom() {
  requestAnimationFrame(() => {
    const log = document.getElementById('team-chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  });
}

function teamChatHtml(p) {
  ensureTeamChat(p);
  const list = (p.chat || []).filter((m) => !m.salute).slice(-30);
  return `<section class="section team-chat" id="team-chat">
    <div class="section-head">
      <h2>团队聊天</h2>
      <span class="meta">${(p.extraRequirements || []).length ? `已记录 ${p.extraRequirements.length} 条要求 · ` : ''}说一句，团队会真的回复</span>
    </div>
    <div class="chat-log" id="team-chat-log">${list.map(chatMessageHtml).join('')}${p.chatPending ? chatTypingHtml() : ''}</div>
    <form class="chat-form" id="team-chat-form">
      <input id="team-chat-input" name="message" type="text" maxlength="240" placeholder="对团队说点什么…" autocomplete="off" aria-label="团队聊天输入">
      <button class="btn primary" type="submit">发送</button>
    </form>
  </section>`;
}

function looksLikeRequirement(text) {
  return /(加|新增|增加|改|换|删|去掉|不要|必须|希望|想要|优化|调整|做成|变成|颜色|字体|按钮|布局|交互|动效|文案|风格|更大|更小|更清晰|更简洁|更专业|vibe)/i.test(text);
}

function addChatRequirement(p, text) {
  const clean = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!clean) return false;
  p.extraRequirements = p.extraRequirements || [];
  if (p.extraRequirements.includes(clean)) return true;
  p.extraRequirements.push(clean);
  p.extraRequirements = p.extraRequirements.slice(-8);
  return true;
}

function parseChatReply(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const unfenced = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  const candidates = [unfenced, start >= 0 && end > start ? unfenced.slice(start, end + 1) : ''].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const data = JSON.parse(candidate);
      if (data && typeof data.reply === 'string' && data.reply.trim()) {
        return {
          reply: data.reply.trim().slice(0, 220),
          requirement: typeof data.requirement === 'string' ? data.requirement.trim().slice(0, 100) : '',
        };
      }
    } catch (e) {}
  }
  return null;
}

async function sendTeamChat(text) {
  const p = state.project;
  const clean = String(text || '').trim().slice(0, 240);
  if (!p || !clean) return;
  if (ui.chatBusy || p.chatPending) {
    toast('团队正在回复上一条，稍等', 'err');
    return;
  }
  ensureTeamChat(p);
  const now = Date.now();
  p.chat = p.chat || [];
  p.chat.push({ id: 'c_' + now.toString(36) + '_u', role: 'USER', text: clean, ts: now });
  p.chatPending = true;
  p.chat = p.chat.slice(-60);
  ui.chatBusy = true;
  saveNow();
  renderPage();
  scrollChatBottom();

  const statusText = STATUS[p.status] || p.status || '进行中';
  const recent = (p.chat || []).slice(-7, -1).map((m) => {
    const role = ROLES[m.role] || ROLES.SYSTEM;
    return `${role.name}：${m.text}`;
  }).join('\n');
  const context = `工程：《${p.prompt}》
标签：${p.tag} · 风格：${p.style || 'product'}
阶段：${p.phase} · 轮次：${p.round} · 状态：${statusText}
规格概述：${p.spec?.summary || '（暂无）'}
完成标准：${(p.spec?.acceptance || []).join('；') || '（暂无）'}
已记录的聊天要求：${(p.extraRequirements || []).join('；') || '（暂无）'}
最近对话：
${recent || '（这是第一句）'}

用户刚刚说：${clean}`;
  const system = `你是 ForgeCrew 的统筹者，在团队聊天里直接回复委托用户。团队有统筹者、策划者、编程者、检查者、打磨者五个角色，你做统一发言。
要求：
1. 用中文，像真人同事，1 到 2 句，不超过 70 字，承接项目当前阶段，不说空话。
2. 不要假装已经改完页面；正在制作就说会在下一轮带上，已交付就提示用户可以再做一版。
3. 如果用户在提功能、视觉、文案、交互的新要求或修改意见，把可执行的那一句提炼到 requirement；纯聊天、提问、催促、表扬则 requirement 为空字符串。
4. 只输出 JSON：{"reply":"回复内容","requirement":"可执行要求或空字符串"}，不要输出 Markdown。`;

  let reply = '';
  let requirement = '';
  let failed = false;
  try {
    const res = await complete({
      role: 'ORCHESTRATOR', system, user: context, json: true, maxTokens: 700, temperature: 0.45,
    });
    const parsed = parseChatReply(res.text);
    if (!parsed) throw new ApiError('PARSE', '团队回复格式不完整');
    reply = parsed.reply;
    requirement = parsed.requirement;
  } catch (err) {
    failed = true;
    reply = '服务连接这次没接通，消息已留在聊天里，但团队没有生成回复。可以稍后重发，或到「我的」填入自己的 Qwen Key 再试。';
    if (looksLikeRequirement(clean)) requirement = clean;
  }

  const applied = requirement ? addChatRequirement(p, requirement) : false;
  const replyMsg = {
    id: 'c_' + (now + 1).toString(36) + '_r',
    role: 'ORCHESTRATOR',
    text: reply,
    ts: Date.now(),
    kind: applied ? 'requirement' : undefined,
    action: applied && p.status === 'DELIVERED' ? 'rebuild' : undefined,
  };
  if (applied) {
    replyMsg.text = `${reply}（已记入要求：${requirement}）`;
    addLog(p, 'ORCHESTRATOR', `聊天新增要求：${requirement}`, 'wait');
    if (p.status === 'DELIVERED') {
      replyMsg.text = `${reply}（已记入要求：${requirement}。点下面的按钮可立即带上它做一版）`;
    }
  }
  p.chat.push(replyMsg);
  p.chat = p.chat.slice(-60);
  p.chatPending = false;
  ui.chatBusy = false;
  saveNow();
  renderPage();
  scrollChatBottom();
  if (failed) toast('团队回复失败，已如实提示', 'err');
  const input = document.getElementById('team-chat-input');
  if (input) input.focus({ preventScroll: true });
}

function buildHtml() {
  const p = state.project;
  if (!p) {
    return `<div class="eyebrow">当前项目</div>
      <h1 class="page-title">还没有打开项目</h1>
      <p class="page-lead">从项目列表打开一个，或者新建一句话。</p>
      <div class="empty" style="margin-top:24px"><b>${COPY.emptyBuild}</b>${COPY.emptyBuildHint}<div style="margin-top:14px"><button class="btn primary" data-new="1" type="button">${COPY.goIdea}</button></div></div>`;
  }
  const awaiting = p.status === 'AWAITING_USER';
  return `
  <button class="back-link" data-nav="idea" type="button">← 项目</button>
  <div class="project-head ${awaiting ? 'is-awaiting' : ''}">
    <div class="eyebrow">当前项目 · ${projectStyleLabel(p)}</div>
    <div class="title-row">
      <h1 class="page-title">${esc(p.title)}</h1>
      ${pill(badgeOf(p.status), { PENDING: 'idle', BUILDING: 'run', REVIEWING: 'teal', AWAITING_USER: 'wait', REWORKING: 'run', DELIVERED: 'ok', PAUSED: 'fail' }[p.status] || 'idle')}
    </div>
    <div class="status-sentence ${p.status === 'PAUSED' ? 'is-paused' : ''}">
      <span class="dot ${p.status === 'DELIVERED' ? 'ok' : p.status === 'PAUSED' ? 'err' : awaiting ? 'wait' : 'run'}"></span>
      <span>${humanStatus(p)}</span>
    </div>
    ${p.status === 'DELIVERED' ? `<p class="budget-note">${COPY.budgetNote}</p>` : ''}
    <div class="meta-row">
      <span><b>${roundLabel(p)}</b> / 最多 ${p.maxRound || 3} 轮</span>
      <span>更新 <b data-rel="${p.updatedAt}">${rel(p.updatedAt)}</b></span>
      ${p.artifact ? `<span>当前版本 <b>${(p.artifact.html.length / 1024).toFixed(1)} KB</b></span><button class="btn small" id="open-artifact" type="button">打开预览 ↗</button>` : ''}
    </div>
    ${deliverActions(p)}
    ${taskControls(p)}
  </div>
  ${pauseBanner(p)}
  ${awaiting ? `<section class="section act-section await-focus">
    <div class="await-lead"><span class="dot wait"></span><span><b>现在轮到你</b> · 团队已停在这里，选完就继续</span></div>
    ${p.awaitReason === 'escalate' ? escalateCard(p) : decisionCard(p)}
    ${p.artifact ? previewCard(p, { compact: true }) : ''}
  </section>` : `
    ${stepperHtml(p)}
    ${handoffsHtml(p)}
    ${stageDetailHtml(p)}
  `}
  ${!awaiting && p.status === 'DELIVERED' ? `<section class="section act-section">
    ${previewCard(p)}
  </section>` : ''}
  ${teamChatHtml(p)}
  ${recordsHtml(p)}`;
}

// view: review
function currentDecision(p) {
  const list = p.decisions || [];
  if (!list.length) return null;
  const idx = Math.min(ui.decisionIndex, list.length - 1);
  const unanswered = list.findIndex((d) => !d.chosen);
  return unanswered === -1 ? list[Math.min(list.length - 1, idx)] : list[unanswered];
}

function decisionCard(p) {
  const d = currentDecision(p);
  if (!d) return '';
  const list = p.decisions || [];
  const total = list.length;
  const index = list.findIndex((x) => x.id === d.id) + 1;
  const allChosen = list.every((x) => x.chosen);
  const preview = (o, key) => `
    <div class="option-preview" data-variant="${key}" aria-hidden="true">
      <div class="mini-screen">
        <span class="mini-top"></span>
        <span class="mini-hero">${esc((o?.label || '').slice(0, 8))}</span>
        <span class="mini-line"></span>
        <span class="mini-line short"></span>
        <span class="mini-cta">${key === 'A' ? '直接开始' : '先看一步'}</span>
        ${key === 'B' ? '<span class="mini-note">多一层铺垫</span>' : ''}
      </div>
      <span class="preview-caption">${key === 'A' ? '一屏直达' : '分层开场'} · 方向示意</span>
    </div>`;
  const opt = (o, i) => {
    const key = o?.key || (i === 0 ? 'A' : 'B');
    const bullet = o?.tradeoff ? `<ul class="tradeoff"><li>${esc(Array.isArray(o.tradeoff) ? o.tradeoff.join(' / ') : o.tradeoff)}</li></ul>` : '';
    return `
    <button class="option" type="button" data-choice="${d.id}:${key}" aria-pressed="${d.chosen === key}">
      <span class="key-wrap"><span class="key">${key}</span><span>方案</span></span>
      <span class="pick" aria-hidden="true"></span>
      ${preview(o, key)}
      <h4>${esc(o?.label || '未命名方案')}</h4>
      <span class="body">${esc(o?.body || '')}</span>
      ${bullet}
    </button>`;
  };
  return `<div class="decision-card">
    <div class="decision-head">
      <span class="no">第 ${d.index || index} 个选择 / ${total}</span>
      <h3>${d.topic ? `${esc(d.topic)}：` : ''}${esc(d.title || '待定')}</h3>
      <span class="act">${d.chosen ? pill('已拍板 · ' + d.chosen, 'ok') : pill('等你拍板', 'wait', 'data-breath="1"')}</span>
    </div>
    <div class="decision-sub">${esc(d.context || '两个方案都能验收，差别在第一次打开时的感受')} · ${esc(tagLabel(p.tag))} · ${roundLabel(p)}</div>
    <div class="options" role="group" aria-label="方案选项">
      ${opt(d.optionA, 0)}${opt(d.optionB, 1)}
    </div>
    <div class="decision-foot">
      <span>${allChosen ? '选择已记录，可以继续制作' : COPY.decisionFoot}</span>
      <span class="spacer"></span>
      <button class="btn" id="reject-plan" type="button">${COPY.reject}</button>
      <button class="btn primary" id="apply-plan" type="button" ${allChosen ? '' : 'disabled'}>${COPY.accept}</button>
    </div>
  </div>`;
}

function escalateCard(p) {
  const failed = (p.report?.findings || []).filter((f) => !f.passed);
  return `<div class="decision-card">
    <div class="decision-head">
      <span class="no">第 ${p.round} 轮 · 需要你定方向</span>
      <h3>同一个问题连续两轮没修好</h3>
      <span class="act">${pill('等你拍板', 'wait')}</span>
    </div>
    <div class="decision-context">
      <div class="quote">${failed.length
        ? failed.map((f) => `<span>${f.id} · ${esc(f.check)}：${esc(f.detail)}</span>`).join('<br>')
        : '团队连续两轮没有通过同一项检查。'}</div>
    </div>
    <div class="decision-sub">你可以再给开发一轮机会（上限放宽到第 ${p.round + 2} 轮），或先拿到当前这一版成品。</div>
    <div class="decision-foot">
      <span>${esc(p.prompt)}</span>
      <span class="spacer"></span>
      <button class="btn" id="escalate-accept" type="button">先拿到当前成品</button>
      <button class="btn primary" id="escalate-retry" type="button">再给开发一轮</button>
    </div>
  </div>`;
}

function previewCard(p, opts = {}) {
  const a = p.artifact;
  if (!a) return '';
  const compact = Boolean(opts.compact);
  const versions = (p.versions || []).slice(-5).reverse();
  return `<div class="preview-card ${compact ? 'compact' : ''}">
    <div class="preview-head">
      <h3>${compact ? '当前版本' : '成品'}</h3>${pill(compact ? '待你确认' : '已交付', compact ? 'wait' : 'ok')}
      <span class="meta" style="font-size:10.5px;color:var(--text-3)">第 ${a.round} 轮 · ${formatDateTime(a.createdAt)} · ${(a.html.length / 1024).toFixed(1)} KB</span>
      <span class="act">${compact ? `<button class="btn small" id="open-artifact" type="button">打开</button>` : ''}</span>
    </div>
    ${versions.length > 1 ? `<div class="version-row"><span>历史版本</span>${versions.map((v) => `<span class="version-item"><button class="version-chip" data-version="${v.createdAt}" type="button">第 ${v.round} 轮${(v.revision || 1) > 1 ? ` · 第 ${v.revision} 版` : ''}${v.createdAt === a.createdAt ? ' · 当前' : ''}</button>${v.createdAt === a.createdAt ? '' : `<button class="version-restore" data-restore-version="${v.createdAt}" type="button">回到这版</button>`}</span>`).join('')}</div>` : ''}
    <div class="preview-body">
      <div class="preview-frame-wrap">
        <div class="browser-chrome"><span></span><span></span><span></span><span class="url">forgecrew.app/p/${esc(p.id.slice(-6))} · round ${a.round}</span></div>
        <iframe class="preview-frame" id="artifact-frame" sandbox="allow-scripts" title="成品预览"></iframe>
      </div>
      ${compact ? '' : `<div class="delight">
        <h4>${COPY.delight}</h4>
        <div class="sub">${COPY.delightSub}</div>
        ${p.delight?.length ? `<ul>${p.delight.map((d) => `<li>
          <span class="check">✓</span>
          <span><b>${esc(d.requirement || d.text || '')}</b>${esc(d.response || '')}<span>${d.kind === 'IMPLICIT' ? '隐性偏好 · 已补' : '显性要求 · 已满足'}</span></span>
        </li>`).join('')}</ul>` : `<div class="empty" style="padding:18px 0;border:0">
          ${p.pleaserFailed ? '打磨说明生成失败。' : '打磨说明正在生成…'}
          ${p.pleaserFailed ? '<div style="margin-top:10px"><button class="btn small" id="retry-delight" type="button">重试</button></div>' : ''}
        </div>`}
      </div>`}
    </div>
  </div>`;
}

function reviewHtml() {
  const p = state.project;
  if (!p) {
    return `<div class="eyebrow">03 / 关键决策</div>
      <h1 class="page-title">项目页</h1>
      <p class="page-lead">${COPY.lead.review}</p>
      <div class="empty" style="margin-top:24px"><b>${COPY.emptyReview}</b>${COPY.emptyReviewHint}<div style="margin-top:14px"><button class="btn" data-nav="build" type="button">${COPY.seeLog}</button></div></div>`;
  }
  const awaiting = p.status === 'AWAITING_USER';
  return `
  <div class="eyebrow">03 / 关键决策</div>
  <h1 class="page-title">项目页</h1>
  <p class="page-lead">${COPY.lead.review}</p>
  ${awaiting && p.awaitReason === 'escalate' ? escalateCard(p) : ''}
  ${awaiting && p.awaitReason !== 'escalate' ? decisionCard(p) : ''}
  ${!awaiting && p.status !== 'DELIVERED' ? `<div class="await-bar" style="margin-top:20px">
      <span class="dot run"></span><span>团队正在作业，${roundLabel(p)}。需要你决定会在产物通过自检后出现在这里。</span>
      <span class="act"><button class="btn small" data-nav="build" type="button">${COPY.goBuild}</button></span>
    </div>` : ''}
  ${p.status === 'DELIVERED' && !awaiting ? previewCard(p) : ''}
  ${awaiting && p.artifact ? previewCard(p) : ''}`
  ;
}

// view: profile
function historyRowsHtml() {
  const items = (state.projects || []).slice(0, 5);
  if (!items.length) return `<div class="empty" style="padding:20px;border:0">还没有历史想法。</div>`;
  return items.map((item) => `
    <button class="history-row" data-open="${esc(item.id)}" type="button">
      <div class="txt"><b>${esc(item.title)}</b><span>${esc(tagLabel(item.tag))} · ${roundLabel(item)} · ${formatDateTime(item.updatedAt)}</span></div>
      ${statusPillOf(item)}
      <span class="chev">›</span>
    </button>`).join('');
}

function channelStatus() {
  const hb = state.heartbeat;
  const gap = Date.now() - (hb.lastOkAt || 0);
  if (!hb.lastOkAt) return { tone: 'idle', text: '心跳连接中' };
  if (gap < 6 * 60_000) return { tone: 'ok', text: `服务在线 · 心跳 ${rel(hb.lastOkAt)}` };
  if (gap < 15 * 60_000) return { tone: 'wait', text: '心跳中断（超过 6 分钟）' };
  return { tone: 'fail', text: '可能已冷却（超过 15 分钟）' };
}

function maskKey(key) {
  if (!key) return '未填写';
  return key.length <= 8 ? '已保存' : `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function qwenProviderHtml() {
  const cfg = qwenProviderConfig();
  const current = QWEN_PROVIDERS.find((x) => x.id === cfg.provider) || QWEN_PROVIDERS[0];
  return `<div class="panel provider-panel">
    <h3>Qwen 直连 <span class="chip-mini">可选</span></h3>
    <div class="desc">默认服务排队时，可以填入你自己的免费 Key。Key 存在这台浏览器；请求时会临时交给本站服务端转发，不会被保存，不进入账号同步，也不会写进项目。</div>
    <div class="provider-form">
      <label class="provider-field">
        <span>服务商</span>
        <select id="qwen-provider-select">
          ${QWEN_PROVIDERS.map((x) => `<option value="${x.id}" ${x.id === cfg.provider ? 'selected' : ''}>${x.name} · ${x.model}</option>`).join('')}
        </select>
      </label>
      <label class="provider-field">
        <span>API Key</span>
        <input id="qwen-provider-key" type="password" autocomplete="off" spellcheck="false" placeholder="${cfg.key ? '已保存，重新填写可替换' : current.hint}" aria-label="Qwen API Key">
      </label>
      <div class="provider-actions">
        <button class="btn small primary" id="qwen-provider-save" type="button">保存到本机</button>
        <button class="btn small" id="qwen-provider-clear" type="button">清除</button>
        <a class="provider-help" href="${current.url}" target="_blank" rel="noreferrer">获取 Key ↗</a>
      </div>
    </div>
    <div class="provider-state">${cfg.key
      ? `已启用 <b>${esc(current.name)}</b> · ${esc(maskKey(cfg.key))} · 优先于公共链`
      : '当前未填 Key，继续使用默认服务'}</div>
    <div class="provider-tip">国内网络优先用<b>硅基流动</b>或百炼、魔搭，控制台打开快、无需 VPN。硅基流动的 Qwen3-8B 是长期免费模型（约 30 次/分钟），注册后可直接创建 Key；百炼新账号有 90 天免费额度，魔搭需绑定阿里云并实名。Groq / OpenRouter 需要能稳定访问外网。</div>
  </div>`;
}


// ---------------- 使用说明 ----------------
function guideSeenKey() {
  return 'fc-guide-seen:' + (state.user?.id || 'guest');
}

function guideSeen() {
  try { return localStorage.getItem(guideSeenKey()) === '1'; } catch (e) { return false; }
}

function markGuideSeen() {
  try { localStorage.setItem(guideSeenKey(), '1'); } catch (e) {}
}

function guideHtml() {
  return `<div class="guide-scrim" data-guide-close></div>
  <div class="guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">
    <div class="guide-head">
      <div>
        <div class="eyebrow">FORGECREW · 快速上手</div>
        <h2 id="guide-title">两分钟看完，随时可以关</h2>
        <p>这里只写真正会用到的操作。看不完也没关系，截图可以点开放大，右上角 <b>?</b> 随时再打开。</p>
      </div>
      <button class="guide-close" type="button" data-guide-close aria-label="关闭说明">×</button>
    </div>
    <div class="guide-body">
      <section class="guide-step">
        <span class="guide-no">01</span>
        <div>
          <h3>写一句想法，选好风格就能开工</h3>
          <p>在首页写清楚“做什么、给谁用、最想要的效果”。标签决定页面骨架，风格决定气质；高级选项可以补上不要什么、参考感觉。点“让团队开工”，五个角色开始接手。</p>
          <figure><a href="/assets/guide/home.webp" target="_blank" rel="noreferrer"><img src="/assets/guide/home.webp" alt="首页新建项目界面" loading="lazy"></a><figcaption>首页：一句话 + 标签 + 风格，三步开工。</figcaption></figure>
        </div>
      </section>
      <section class="guide-step">
        <span class="guide-no">02</span>
        <div>
          <h3>四个阶段会自动往下走</h3>
          <p>明确 → 制作 → 检查 → 交付。顶部会显示当前阶段、轮次和成员状态。中途可以暂停、继续；不想做了可以删除。只有到了“需要你确认”，才真的需要你出手。</p>
          <figure><a href="/assets/guide/project.webp" target="_blank" rel="noreferrer"><img src="/assets/guide/project.webp" alt="项目页四个阶段与团队状态" loading="lazy"></a><figcaption>项目页：阶段、进度、团队状态一眼看清。</figcaption></figure>
        </div>
      </section>
      <section class="guide-step">
        <span class="guide-no">03</span>
        <div>
          <h3>需要你确认时，二选一就行</h3>
          <p>团队会把两条都能走通的方案摆出来，写清代价和适用场景。选一个，点确认，团队继续。两项都选过之后按钮才能继续，避免漏选。</p>
          <figure><a href="/assets/guide/decision.webp" target="_blank" rel="noreferrer"><img src="/assets/guide/decision.webp" alt="需要你确认时的两个方案" loading="lazy"></a><figcaption>确认卡：两项都拍板后才会放行。</figcaption></figure>
        </div>
      </section>
      <section class="guide-step">
        <span class="guide-no">04</span>
        <div>
          <h3>团队交接记录，能查每一步是谁做的</h3>
          <p>每次角色交接都会留下一条：谁交给谁、交付了什么、为什么。最新的一条在最上面，最多保留最近 6 条。它不是角色介绍，而是这次项目真实发生过的事。</p>
        </div>
      </section>
      <section class="guide-step">
        <span class="guide-no">05</span>
        <div>
          <h3>聊天不是摆设，可以直接改需求</h3>
          <p>在项目页底部对团队说一句话，统筹者会真的读项目进度再回复。如果你在提新要求，它会自动记成一条“要求”，下一轮制作会带上；已交付的项目会多出一个“按新要求再做一版”的按钮。</p>
          <figure><a href="/assets/guide/chat.webp" target="_blank" rel="noreferrer"><img src="/assets/guide/chat.webp" alt="团队聊天真实回复与新要求" loading="lazy"></a><figcaption>聊天：真回复，也能把新要求写进下一轮。</figcaption></figure>
        </div>
      </section>
      <section class="guide-step">
        <span class="guide-no">06</span>
        <div>
          <h3>成品能打开、导出、分享，也能回到旧版</h3>
          <p>交付后可以全屏打开成品、导出 HTML、复制分享链接，或者“再做一版”。10 分钟内还能撤回确认，重新选方案。历史版本区里，每个旧版本都有“回到这版”，二次确认后会把项目切回那一版。</p>
        </div>
      </section>
      <section class="guide-step">
        <span class="guide-no">07</span>
        <div>
          <h3>账号、外观和模型连接</h3>
          <p>登录后项目跟着账号走。“我的”页可以切换跟随系统 / 深色 / 亮色，打开确认通知，查看今日调用。默认服务排队时，可以填入自己的 Qwen Key，只保存在这台浏览器，不进入账号同步。</p>
          <figure><a href="/assets/guide/profile.webp" target="_blank" rel="noreferrer"><img src="/assets/guide/profile.webp" alt="我的页账号、外观与 Qwen 连接" loading="lazy"></a><figcaption>我的页：账号、外观、服务连接与历史。</figcaption></figure>
        </div>
      </section>
    </div>
    <div class="guide-foot">
      <span>首次登录会自动打开一次；关掉后不再打扰。</span>
      <div class="guide-actions">
        <button class="btn" type="button" data-guide-close>先跳过</button>
        <button class="btn primary" type="button" data-guide-close>开始使用</button>
      </div>
    </div>
  </div>`;
}

function closeGuide() {
  const modal = overlayRoot.querySelector('.guide-modal');
  if (!modal) return;
  modal.classList.add('closing');
  const scrim = overlayRoot.querySelector('.guide-scrim');
  if (scrim) scrim.classList.add('closing');
  setTimeout(() => {
    overlayRoot.querySelectorAll('.guide-modal, .guide-scrim').forEach((el) => el.remove());
    document.body.classList.remove('guide-open');
  }, 180);
  const opener = ui.guideOpener;
  if (opener && opener.isConnected) opener.focus({ preventScroll: true });
}

function openGuide() {
  if (overlayRoot.querySelector('.guide-modal')) return;
  markGuideSeen();
  const scrim = document.createElement('div');
  scrim.className = 'guide-plain';
  const wrap = document.createElement('div');
  wrap.innerHTML = guideHtml();
  const nodes = [...wrap.children];
  const guideScrim = nodes.find((el) => el.classList.contains('guide-scrim'));
  const modal = nodes.find((el) => el.classList.contains('guide-modal'));
  ui.guideOpener = document.activeElement;
  overlayRoot.append(guideScrim, modal);
  document.body.classList.add('guide-open');
  requestAnimationFrame(() => { modal.classList.add('open'); guideScrim.classList.add('open'); });
}

function maybeOpenGuide() {
  if (!state.user || guideSeen()) return;
  setTimeout(() => { if (!overlayRoot.querySelector('.guide-modal')) openGuide(); }, 900);
}

function profileHtml() {
  const p = state.project;
  const hb = channelStatus();
  const reason = p?.pausedReason ? pauseReasonText(p) : null;
  const next = p?.nextRetryAt ? `下次自动重试 ${formatClock(p.nextRetryAt)}` : '暂无计划重试';
  return `
  <div class="eyebrow">04 / 偏好与记录</div>
  <h1 class="page-title">我的</h1>
  <p class="page-lead">${COPY.lead.profile}</p>
  <div class="profile-grid">
    <div>
      <div class="panel account-panel">
        <h3>账号</h3>
        <div class="account-head">
          <span class="account-avatar">${state.user ? esc((state.user.name || state.user.email || '你').slice(0, 1)) : ICONS.profile}</span>
          <div class="txt">
            <b>${state.user ? esc(state.user.name) : '还没有登录'}</b>
            <span>${state.user
              ? esc(state.user.email)
              : '登录后项目跟着账号走，换一台设备也能继续。'}</span>
          </div>
          <span class="side">
            ${state.user
              ? '<button class="btn small" data-logout type="button">退出</button>'
              : '<button class="btn small primary" data-account type="button">登录 / 注册</button>'}
          </span>
        </div>
        <div class="account-foot">
          ${state.user
            ? `项目自动同步 · ${state.syncing ? '正在同步…' : state.cloudSavedAt ? '上次同步 ' + rel(state.cloudSavedAt) : '等待首次同步'}${state.cloudError ? ' · <span class="warn">' + esc(state.cloudError) + '</span>' : ''}`
            : '未登录 · 数据只保存在这台浏览器里。'}
        </div>
      </div>

      <div class="panel">
        <h3>外观</h3>
        <div class="desc">跟随系统，或固定使用亮色、深色、着色。</div>
        <div class="seg-full" role="group" aria-label="外观">
          ${[['system', '跟随系统'], ['light', '亮色'], ['dark', '深色'], ['tinted', '着色']].map(([key, label]) => `<button type="button" data-theme-set="${key}" aria-selected="${state.themeUser === key}">${label}</button>`).join('')}
        </div>
        <div class="panel-sect">
          <div class="setting-row">
            <div class="txt"><b>团队敬礼</b><span>开工与交付时，5 名成员各敬一个礼</span></div>
            <div class="side"><button class="switch" data-toggle-follow type="button" aria-checked="${state.autofollow}" aria-label="自动跟随"></button></div>
          </div>
          <div class="setting-row">
            <div class="txt"><b>确认通知</b><span>到达需要你决定或交付时提醒你</span></div>
            <div class="side"><button class="switch" id="notify-toggle" type="button" aria-checked="false" aria-label="确认通知"></button></div>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>制作服务连接</h3>
        <div class="desc">公共链自动调度；填入自己的 Key 后可优先走你的 Qwen 服务。</div>
        <div class="channel-row">
          <span class="dot ${hb.tone === 'fail' ? 'err' : hb.tone === 'wait' ? 'wait' : 'ok'}"></span>
          <div class="txt"><b>${COPY.channel}</b><span>${esc(hb.text)}</span></div>
          <span class="side">${hb.tone === 'fail' ? '离线' : '在线'}</span>
        </div>
        <div class="panel-sect">
          <div class="setting-row">
            <div class="txt"><b>串行作业</b><span>一次只接一个想法，保证每一步都做到位</span></div>
            <div class="side"><button class="switch on-locked" type="button" aria-checked="true" disabled aria-label="串行作业"></button></div>
          </div>
        </div>
        <div class="channel-foot">
          ${reason ? `上次暂停原因：${esc(reason.long)} · ${next}<br>` : ''}
          今日调用 ${callsToday()} 次 · 单服务串行，同一时间只接一个想法<br>
          <span style="color:var(--text-3)">07:00–23:59 每 15 分钟只保 API，冷启动通常 < 30 秒。</span>
        </div>
      </div>
      ${qwenProviderHtml()}
    </div>

    <div>
      <div class="panel">
        <div class="section-head" style="margin-bottom:10px"><h3>历史想法</h3><span class="meta" style="margin-left:auto">${state.projects.length} 个</span></div>
        <div class="history-tabs segmented" role="tablist">
          ${['全部', '进行中', '需要你确认', '已交付', '稍后继续'].map((t, i) => `<button type="button" aria-selected="${i === 0}" style="pointer-events:none">${t}</button>`).join('')}
        </div>
        ${historyRowsHtml()}
        <div class="danger-zone">
          <span class="txt">清空本地数据会删除所有想法、日志与成品，无法恢复。</span>
          <span class="side"><button class="btn small ghost-danger" id="clear-start" type="button">清空数据</button></span>
        </div>
        <div id="clear-confirm-wrap"></div>
      </div>

      <div class="panel">
        <div class="about-product">
          <div><b>${BRAND.name} · ${BRAND.version}</b><span>Agent crew · idea to acceptance</span></div>
          <span class="logo-mini">${LOGO_SVG}</span>
        </div>
        <div class="about-row"><span>使用说明</span><span class="side"><button class="link-btn" type="button" data-open-guide>打开两分钟说明</button> · 右上角 ? 也可以</span></div>
        <div class="about-row"><span>设计语言</span><span class="side"><span class="chip-mini">视觉 v3</span> 三态 · 石墨 / 纸白 / 着色 · iOS 26 手感</span></div>
        <div class="about-row"><span>生成服务</span><span class="side">自动选择可用连接 · ${API.base() ? '跨域代理' : '同源代理'}</span></div>
      </div>
    </div>
  </div>`;
}

function bindPageEvents() {
  // delegated at document level; page handlers are bound here
}

document.addEventListener('click', (ev) => {
  const delTask = ev.target.closest('[data-del]');
  if (delTask) {
    ev.preventDefault();
    ev.stopPropagation();
    deleteTask(delTask.dataset.del);
    return;
  }

  if (ev.target.closest('#pause-task')) {
    pauseTask();
    return;
  }

  if (ev.target.closest('#resume-task')) {
    continueNow();
    return;
  }

  if (ev.target.closest('#delete-task')) {
    deleteTask();
    return;
  }

  if (ev.target.closest('#open-guide') || ev.target.closest('[data-open-guide]')) {
    openGuide();
    return;
  }

  if (ev.target.closest('[data-guide-close]')) {
    closeGuide();
    return;
  }

  if (ev.target.closest('[data-chat-rebuild]')) {
    anotherVersion();
    return;
  }

  if (ev.target.closest('#qwen-provider-save')) {
    const select = document.getElementById('qwen-provider-select');
    const input = document.getElementById('qwen-provider-key');
    const key = String(input?.value || '').trim();
    if (!key) {
      toast('先粘贴一个 API Key；没有 Key 就继续用公共链', 'err');
      return;
    }
    if (setQwenProviderConfig(select?.value || 'dashscope', key)) {
      toast('已保存到本机，后续制作和聊天优先走你的 Qwen', 'ok');
      renderPage();
    } else {
      toast('浏览器不允许写入本地存储', 'err');
    }
    return;
  }

  if (ev.target.closest('#qwen-provider-clear')) {
    setQwenProviderConfig('dashscope', '');
    toast('已清除本机 Key，回到默认服务', 'ok');
    renderPage();
    return;
  }

  const authClose = ev.target.closest('[data-auth-close]');
  if (authClose) {
    closeAuth();
    return;
  }

  const authTab = ev.target.closest('[data-auth-tab]');
  if (authTab) {
    ui.authMode = authTab.dataset.authTab === 'register' ? 'register' : 'login';
    ui.authBusy = false;
    rerenderAuth();
    return;
  }

  if (ev.target.closest('[data-account]')) {
    if (state.user) {
      setRoute('profile');
      renderAll();
    } else {
      openAuth('login');
    }
    return;
  }

  if (ev.target.closest('[data-logout]')) {
    handleLogout();
    return;
  }

  const newBtn = ev.target.closest('[data-new]');
  if (newBtn) {
    setRoute('idea');
    renderAll();
    requestAnimationFrame(() => {
      const input = document.getElementById('composer-input');
      if (input) {
        input.focus({ preventScroll: false });
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
    return;
  }

  const nav = ev.target.closest('[data-nav]');
  if (nav) {
    setRoute(nav.dataset.nav);
    renderAll();
    workspaceEl.scrollTop = 0;
    return;
  }

  const open = ev.target.closest('[data-open]');
  if (open) {
    const id = open.dataset.open;
    const proj = (state.projects || []).find((x) => x.id === id);
    if (proj && (!state.project || state.project.id !== id)) {
      const full = safeReadProject(id);
      if (full) {
        state.project = full;
        state.logs = full.logs || [];
        saveNow();
        toast('已切回《' + proj.title + '》');
      }
    }
    setRoute(state.project?.status === 'DELIVERED' ? 'review' : 'build');
    renderAll();
    return;
  }

  const tag = ev.target.closest('[data-tag]');
  if (tag) {
    state.tag = tag.dataset.tag;
    pageEl.querySelectorAll('[data-tag]').forEach((b) => b.setAttribute('aria-pressed', String(b === tag)));
    try { localStorage.setItem('fc-tag', state.tag); } catch (e) {}
    return;
  }

  const recipe = ev.target.closest('[data-recipe]');
  if (recipe) {
    const text = RECIPES[Number(recipe.dataset.recipe)] || '';
    state.draft = text;
    const input = document.getElementById('composer-input');
    if (input) { input.value = text; input.focus(); }
    return;
  }

  const view = ev.target.closest('[data-view]');
  if (view) {
    state.view = view.dataset.view;
    try { localStorage.setItem(KEYS.view, JSON.stringify(state.view)); } catch (e) {}
    renderPage();
    return;
  }

  const agent = ev.target.closest('[data-agent]');
  if (agent) {
    const key = agent.dataset.agent;
    if (ui.expanded.has(key)) ui.expanded.delete(key); else ui.expanded.add(key);
    agent.setAttribute('aria-expanded', String(ui.expanded.has(key)));
    return;
  }

  const styleBtn = ev.target.closest('[data-style]');
  if (styleBtn) {
    state.style = styleBtn.dataset.style || 'product';
    try { localStorage.setItem('fc-style', state.style); } catch (e) {}
    renderPage();
    return;
  }

  if (ev.target.closest('#toggle-advanced')) {
    ui.advanced = !ui.advanced;
    renderPage();
    return;
  }

  if (ev.target.closest('#toggle-logs')) {
    ui.logsOpen = !ui.logsOpen;
    renderPage();
    return;
  }

  const versionBtn = ev.target.closest('[data-version]');
  if (versionBtn) {
    const p = state.project;
    const v = (p?.versions || []).find((x) => String(x.createdAt) === versionBtn.dataset.version);
    if (v?.html) {
      const url = URL.createObjectURL(new Blob([applyBaseStyle(v.html, p.style)], { type: 'text/html' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    return;
  }

  const restoreBtn = ev.target.closest('[data-restore-version]');
  if (restoreBtn) {
    const p = state.project;
    const v = (p?.versions || []).find((x) => String(x.createdAt) === restoreBtn.dataset.restoreVersion);
    if (!p || !v?.html) return;
    if (!window.confirm(`回到第 ${v.round} 轮这一版？当前版本仍保留在历史里。`)) return;
    p.artifact = {
      ...(p.artifact || {}),
      round: v.round,
      html: v.html,
      createdAt: v.createdAt,
      bytes: v.html.length,
      title: p.title,
      features: (p.spec?.acceptance || []).slice(0, 4),
    };
    p.status = 'DELIVERED';
    p.phase = 'done';
    p.autoRun = false;
    p.round = v.round;
    p.deliveredAt = p.deliveredAt || Date.now();
    p.restoredAt = Date.now();
    addLog(p, 'USER', `回到第 ${v.round} 轮这一版`, 'wait');
    saveNow();
    renderPage();
    hydrate();
    toast(`已回到第 ${v.round} 轮这一版`);
    return;
  }

  const themeSet = ev.target.closest('[data-theme-set]');
  if (themeSet) {
    setThemeUser(themeSet.dataset.themeSet);
    renderChrome();
    renderPage();
    toast('外观已切换为' + ({ system: '跟随系统', dark: '深色', light: '亮色', tinted: '着色' }[themeSet.dataset.themeSet] || ''));
    return;
  }

  if (ev.target.closest('#toggle-theme')) {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : current === 'dark' ? 'tinted' : 'light';
    setThemeUser(next);
    renderChrome();
    renderPage();
    toast('外观：' + ({ light: '亮色', dark: '深色', tinted: '着色' }[next] || next));
    return;
  }

  if (ev.target.closest('[data-peek]')) {
    toast('方案预览会在成品产出后出现在下方预览卡里');
    return;
  }

  const choice = ev.target.closest('[data-choice]');
  if (choice) {
    const [id, key] = choice.dataset.choice.split(':');
    const p = state.project;
    const d = p?.decisions?.find((x) => x.id === id);
    if (d) {
      d.chosen = d.chosen === key ? null : key;
      addLog(p, 'USER', `需要你决定 ${d.marker} 已选择 ${key} 方案：${key === 'A' ? d.optionA.label : d.optionB.label}`, null);
      saveNow();
      renderPage();
      renderCrew();
    }
    return;
  }

  if (ev.target.closest('#open-palette')) { openPalette(); return; }
  if (ev.target.closest('#open-crew')) {
    if (isMobile()) openCrewSheet(); else openDrawer();
    return;
  }
  if (ev.target.closest('#toggle-follow') || ev.target.closest('[data-toggle-follow]')) {
    state.autofollow = !state.autofollow;
    try { localStorage.setItem('fc-autofollow', JSON.stringify(state.autofollow)); } catch (e) {}
    renderPage();
    return;
  }
  if (ev.target.closest('#advance') || ev.target.closest('#resume-now')) {
    continueNow();
    return;
  }
  if (ev.target.closest('#dispatch')) { dispatchIdea(); return; }
  if (ev.target.closest('#apply-plan')) { applyPlan(); return; }
  if (ev.target.closest('#reject-plan')) { rejectPlan(); return; }
  if (ev.target.closest('#escalate-retry')) { escalateRetry(); return; }
  if (ev.target.closest('#escalate-accept')) { escalateAccept(); return; }
  if (ev.target.closest('#open-artifact')) { openArtifact(); return; }
  if (ev.target.closest('#export-artifact')) { exportArtifact(); return; }
  if (ev.target.closest('#share-artifact')) { shareArtifact(); return; }
  if (ev.target.closest('#another-version')) { anotherVersion(); return; }
  if (ev.target.closest('#undo-delivery')) { undoDelivery(); return; }
  if (ev.target.closest('#retry-delight')) { retryDelight(); return; }
  if (ev.target.closest('#clear-start')) { renderClearConfirm(); return; }
  if (ev.target.closest('#clear-cancel')) { const w = document.getElementById('clear-confirm-wrap'); if (w) w.innerHTML = ''; return; }
  if (ev.target.closest('#clear-run')) { clearAll(); return; }
  if (ev.target.closest('#notify-toggle')) {
    toast('确认通知需要在浏览器里允许通知权限后才生效');
    return;
  }
  if (ev.target.closest('#close-sheet')) { closeCrewSheet(); return; }
  if (ev.target.closest('#close-drawer')) { closeDrawer(); return; }
});

document.addEventListener('keydown', (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
    ev.preventDefault();
    if (ui.palette) closePalette(); else openPalette();
  }
  if (ev.key === 'Escape') {
    if (overlayRoot.querySelector('.auth-root')) closeAuth();
    else if (overlayRoot.querySelector('.guide-modal')) closeGuide();
    else if (ui.palette) closePalette();
    else if (ui.sheet) closeCrewSheet();
    else if (document.querySelector('.drawer')) closeDrawer();
  }
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
    if (state.route === 'idea' && document.activeElement?.id === 'composer-input') dispatchIdea();
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'composer-input') {
    setTimeout(() => ev.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    state.draft = ev.target.value;
    try { localStorage.setItem(KEYS.draft, JSON.stringify(state.draft)); } catch (e) {}
  }
});

// actions
function dispatchIdea() {
  const input = document.getElementById('composer-input');
  const text = (input ? input.value : state.draft).trim();
  const errEl = document.getElementById('composer-error');
  const btn = document.getElementById('dispatch');
  const showError = (msg) => {
    if (!errEl) return;
    errEl.hidden = false;
    errEl.textContent = msg;
  };
  if (!text) { showError('先写一句想法：团队需要一个具体目标。'); return; }
  if (text.length < 6) { showError('太短了，补一句要做什么或给谁用。'); return; }
  if (state.project && ['BUILDING', 'REVIEWING', 'REWORKING', 'PAUSED'].includes(state.project.status)) {
    showError('团队正在作业，一次只接一个想法。等当前项目交付后再进场。');
    return;
  }
  if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
  if (btn) { btn.disabled = true; btn.textContent = COPY.dispatchPending; }
  state.draft = '';
  try { localStorage.removeItem(KEYS.draft); } catch (e) {}
  const project = newProject(text, state.tag);
  project.spec = null;
  project.style = state.style || 'product';
  project.versions = [];
  project.saluteUntil = Date.now() + 15000;
  project.saluteKind = 'start';
  setRoute('build');
  renderAll();
  workspaceEl.scrollTop = 0;
  runEngine();
}

function pauseTask() {
  const p = state.project;
  if (!p || p.status === 'PAUSED' || p.status === 'DELIVERED') return;
  const agents = deriveAgents(p);
  Object.keys(p.agentRuntime || {}).forEach((key) => {
    const rt = p.agentRuntime[key];
    const shown = agents.find((a) => a.key === key)?.progress;
    if (typeof shown === 'number') rt.progressBase = Math.max(rt.progressBase || 0, shown);
    if (rt.startedAt) {
      rt.elapsedMs = (rt.elapsedMs || 0) + Math.max(0, Date.now() - rt.startedAt);
      rt.startedAt = null;
    }
  });
  p.pausedFrom = p.status;
  p.status = 'PAUSED';
  p.pausedReason = 'USER';
  p.pausedAt = Date.now();
  p.nextRetryAt = null;
  p.autoRun = false;
  addLog(p, 'USER', '手动暂停任务，当前进度已保存', 'wait');
  saveNow();
  renderAll();
  toast('任务已暂停，随时可以继续', 'ok');
}

function deleteTask(id) {
  const targetId = id || state.project?.id;
  const target = (state.projects || []).find((x) => x.id === targetId) || state.project;
  if (!target) return;
  const ok = window.confirm(`删除「${target.title}」？删除后本地和云端的这个任务都会移除，不能恢复。`);
  if (!ok) return;
  const wasCurrent = state.project?.id === targetId;
  if (wasCurrent && ui.running) {
    target.status = 'PAUSED';
    target.pausedReason = 'DELETED';
    target.autoRun = false;
    target.nextRetryAt = null;
  }
  removeProject(targetId);
  if (wasCurrent) {
    const next = (state.projects || [])[0];
    state.project = next ? safeReadProject(next.id) : null;
    state.logs = state.project?.logs || [];
    if (!state.project) setRoute('idea');
    else setRoute(state.project.status === 'DELIVERED' ? 'review' : 'build');
  }
  saveNow();
  renderAll();
  toast('任务已删除', 'ok');
}

function continueNow() {
  ui.follow = true;
  const p = state.project;
  if (!p) { setRoute('idea'); renderAll(); return; }
  if (p.status === 'AWAITING_USER') { setRoute('build'); renderAll(); return; }
  if (p.status === 'PAUSED') {
    p.autoRun = true;
    resumeFromPause(p);
    addLog(p, 'USER', '点击“现在继续”，恢复制作', null);
    saveNow();
    renderAll();
    runEngine();
    return;
  }
  if (ui.running) { toast('团队正在作业，请稍候'); return; }
  runEngine();
}

function applyPlan() {
  const p = state.project;
  if (!p) return;
  const all = (p.decisions || []).every((d) => d.chosen);
  if (!all) { toast('两个需要你决定都要选一个方案', 'err'); return; }
  p.phase = 'apply';
  p.decisionsApplied = true;
  addLog(p, 'USER', '两个选择已拍板，团队按所选方案继续', 'wait');
  saveNow();
  setRoute('build');
  renderAll();
  runEngine();
}

function rejectPlan() {
  const p = state.project;
  if (!p) return;
  p.decisionsApplied = true;
  p.revision = (p.revision || 1) + 1;
  p.maxRound = 3;
  p.reworkOrder = '用户要求再试一版：换一种更贴近原话的表达，保留全部完成标准';
  p.phase = 'build';
  p.status = 'REWORKING';
  p.stage = stageOf('REWORKING');
  p.roundStartedAt = Date.now();
  addLog(p, 'USER', '要求团队再试一版', 'wait');
  saveNow();
  setRoute('build');
  renderAll();
  runEngine();
}

function escalateRetry() {
  const p = state.project;
  if (!p) return;
  p.escalate = false;
  p.revision = (p.revision || 1) + 1;
  p.maxRound = 3;
  p.phase = 'build';
  p.status = 'REWORKING';
  p.stage = stageOf('REWORKING');
  p.reworkOrder = (p.failedIds || []).map((id) => `${id} 仍未通过，必须换实现方式`).join('；');
  p.roundStartedAt = Date.now();
  addLog(p, 'USER', '再给开发一轮，换实现方式', 'wait');
  saveNow();
  setRoute('build');
  renderAll();
  runEngine();
}

function escalateAccept() {
  const p = state.project;
  if (!p) return;
  p.escalate = false;
  p.awaitReason = null;
  p.phase = 'deliver';
  addLog(p, 'USER', '先拿到当前成品，接受现状', 'wait');
  saveNow();
  renderAll();
  runEngine();
}

function retryDelight() {
  const p = state.project;
  if (!p || !p.artifact) return;
  p.pleaserFailed = false;
  p.phase = 'polish';
  p.status = 'DELIVERED';
  p.stage = stageOf('DELIVERED');
  addLog(p, 'USER', '重试打磨说明', null);
  saveNow();
  renderPage();
  runEngine();
}

function openArtifact() {
  const p = state.project;
  if (!p?.artifact?.html) { toast('还没有可打开的成品', 'err'); return; }
  const blob = new Blob([applyBaseStyle(p.artifact.html, p.style)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function exportArtifact() {
  const p = state.project;
  if (!p?.artifact?.html) { toast('还没有可导出的成品', 'err'); return; }
  const blob = new Blob([applyBaseStyle(p.artifact.html, p.style)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (p.title || '成品').replace(/[\\/:*?"<>|]/g, '') + '.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  toast('已导出 HTML');
}

async function shareArtifact() {
  const p = state.project;
  if (!p?.artifact?.html) return;
  const html = applyBaseStyle(p.artifact.html, p.style);
  const file = new File([html], `${(p.title || '成品').slice(0, 24)}.html`, { type: 'text/html' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: p.title, text: '在浏览器里直接打开就能用。' });
      toast('已发出这一版');
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  exportArtifact();
  toast('已导出 HTML，可直接发给对方');
}

function anotherVersion() {
  const p = state.project;
  if (!p) return;
  const next = newProject(p.prompt, p.tag);
  next.style = p.style || 'product';
  next.extraRequirements = (p.extraRequirements || []).slice(-8);
  next.versions = [];
  state.project = next;
  state.logs = [];
  saveNow();
  setRoute('build');
  renderAll();
  runEngine();
}

function undoDelivery() {
  const p = state.project;
  if (!p?.artifact) return;
  if (p.deliveredAt && Date.now() - p.deliveredAt >= 10 * 60_000) {
    toast('超过 10 分钟，成品已归档，不能再撤回', 'err');
    return;
  }
  p.status = 'AWAITING_USER';
  p.phase = 'await';
  p.awaitReason = 'decision';
  p.decisionsApplied = false;
  p.deliveredAt = null;
  (p.decisions || []).forEach((d) => { d.chosen = null; });
  addLog(p, 'USER', '撤回确认，回到确认步骤', 'wait');
  saveNow();
  renderAll();
  toast('已撤回，可以重新选择');
}

function renderClearConfirm() {
  const wrap = document.getElementById('clear-confirm-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="clear-confirm">
    <input class="field" id="clear-input" placeholder="输入 清空 以确认" aria-label="确认清空" style="flex:1">
    <button class="btn small" id="clear-cancel" type="button">取消</button>
    <button class="btn small ghost-danger" id="clear-run" type="button">确认清空</button>
  </div>`;
  document.getElementById('clear-input')?.focus();
}

function clearAll() {
  const val = document.getElementById('clear-input')?.value.trim();
  if (val !== '清空') { toast('请输入「清空」两个字再确认', 'err'); return; }
  Object.values(KEYS).forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
  try { localStorage.removeItem('fc-calls'); localStorage.removeItem('fc-autofollow'); } catch (e) {}
  state.project = null;
  state.projects = [];
  state.logs = [];
  state.draft = '';
  state.route = 'idea';
  renderAll();
  toast('本机数据已清空');
}

// crew sheet
function sheetHtml({ mobile = true } = {}) {
  const p = state.project;
  const agents = deriveAgents(p);
  return `${mobile ? '<div class="sheet-handle"></div>' : ''}
    <div class="sheet-head">
      <div>
        <h2>团队</h2>
        <div class="sub">${agents.length} 名成员 · ${workingCount(agents)} 名作业中 · ${p ? '服务在线' : '待命中'}</div>
      </div>
      <button class="sheet-close" id="close-sheet" type="button">收起团队</button>
    </div>
    <div class="sheet-body">${crewBodyHtml(p, { mini: true })}</div>
    <div class="sheet-foot">
      <span>${p ? `${roundLabel(p)} · 最后更新 ${rel(p.updatedAt)}` : '等待第一个想法'}</span>
      <span class="side"><button class="btn" data-nav="idea" type="button">${COPY.backToIdea}</button></span>
    </div>`;
}

function openCrewSheet() {
  document.body.classList.add('sheet-open');
  if (ui.sheet) return;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', '团队状态台');
  sheet.innerHTML = sheetHtml();
  overlayRoot.append(scrim, sheet);
  requestAnimationFrame(() => { sheet.classList.add('open'); scrim.classList.add('open'); });
  ui.sheet = { scrim, sheet, opener: document.activeElement };
  const close = () => closeCrewSheet();
  scrim.addEventListener('click', close);
  document.getElementById('close-sheet').addEventListener('click', close);
  sheet.querySelector('.sheet-body').addEventListener('click', (ev) => {
    const agent = ev.target.closest('[data-agent]');
    if (agent) {
      const key = agent.dataset.agent;
      if (ui.expanded.has(key)) ui.expanded.delete(key); else ui.expanded.add(key);
      agent.setAttribute('aria-expanded', String(ui.expanded.has(key)));
    }
    if (ev.target.closest('[data-nav]')) { close(); }
  });
  // drag to close: 1:1 follow + rubber band + velocity projection
  let drag = null;
  const rubber = (d, dim = 480, c = .55) => (1 - 1 / (d * c / dim + 1)) * dim;
  const settleBack = () => {
    sheet.style.transition = 'transform var(--dur-settle) var(--spring-settle)';
    sheet.style.transform = 'translateY(0)';
  };
  const endDrag = () => {
    if (!drag) return;
    const now = performance.now();
    const recent = drag.samples.filter((s) => now - s.t < 100);
    const v = recent.length > 1
      ? (recent[recent.length - 1].y - recent[0].y) / ((now - recent[0].t) / 1000)
      : 0;
    const projected = drag.offset + v * 0.32;
    drag = null;
    if (v > 160 || projected > 240) close();
    else settleBack();
  };
  const onDown = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const tf = getComputedStyle(sheet).transform;
    const matrix = tf && tf !== 'none' ? new DOMMatrixReadOnly(tf) : null;
    const startOffset = Math.max(0, matrix?.m42 || 0);
    drag = { startY: e.clientY, startOffset, offset: startOffset, samples: [{ t: performance.now(), y: e.clientY }] };
    sheet.style.transition = 'none';
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag) return;
    const raw = Math.max(0, drag.startOffset + e.clientY - drag.startY);
    drag.offset = raw <= 180 ? raw : 180 + rubber(raw - 180);
    sheet.style.transform = `translateY(${drag.offset}px)`;
    drag.samples.push({ t: performance.now(), y: e.clientY });
    if (drag.samples.length > 12) drag.samples.shift();
  };
  const onUp = () => endDrag();
  const onCancel = () => { if (drag) { drag = null; settleBack(); } };
  [sheet.querySelector('.sheet-handle'), sheet.querySelector('.sheet-head')]
    .filter(Boolean)
    .forEach((grab) => {
      grab.addEventListener('pointerdown', onDown);
      grab.addEventListener('pointermove', onMove);
      grab.addEventListener('pointerup', onUp);
      grab.addEventListener('pointercancel', onCancel);
    });
  // focus trap
  setTimeout(() => document.getElementById('close-sheet')?.focus(), 60);
}

function closeCrewSheet() {
  document.body.classList.remove('sheet-open');
  if (!ui.sheet) return;
  const { scrim, sheet, opener } = ui.sheet;
  ui.sheet = null;
  sheet.style.transform = '';
  sheet.classList.remove('open');
  sheet.classList.add('closing');
  scrim.style.opacity = '0';
  setTimeout(() => { scrim.remove(); sheet.remove(); }, 500);
  if (opener?.focus) opener.focus({ preventScroll: true });
}

function openDrawer() {
  document.body.classList.add('sheet-open');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', '团队状态台');
  drawer.innerHTML = `<div class="crew" style="height:100%;border-left:0;display:flex">
      <div class="crew-head"><div class="row"><h2>团队</h2><span class="live"><span class="dot ok"></span>LIVE</span></div>
      <div class="crew-sub">${deriveAgents(state.project).length} 名成员 · ${workingCount(deriveAgents(state.project))} 名作业中</div></div>
      <div class="crew-body">${crewBodyHtml(state.project, { mini: true })}</div>
      <div class="crew-foot"><span>${state.project ? `${roundLabel(state.project)} · ${rel(state.project.updatedAt)}` : '待命'}</span>
        <span class="side"><button class="btn" id="close-drawer" type="button">收起</button></span></div>
    </div>`;
  overlayRoot.append(scrim, drawer);
  requestAnimationFrame(() => { drawer.classList.add('open'); scrim.classList.add('open'); });
  const close = () => closeDrawer();
  scrim.addEventListener('click', close);
  drawer.querySelector('#close-drawer').addEventListener('click', close);
  drawer.querySelector('.crew-body').addEventListener('click', (ev) => {
    const agent = ev.target.closest('[data-agent]');
    if (agent) {
      const key = agent.dataset.agent;
      if (ui.expanded.has(key)) ui.expanded.delete(key); else ui.expanded.add(key);
      agent.setAttribute('aria-expanded', String(ui.expanded.has(key)));
    }
  });
}

function closeDrawer() {
  document.body.classList.remove('sheet-open');
  const drawer = overlayRoot.querySelector('.drawer');
  const scrim = overlayRoot.querySelector('.scrim');
  if (!drawer) return;
  drawer.classList.remove('open');
  if (scrim) scrim.style.opacity = '0';
  setTimeout(() => { drawer.remove(); if (scrim) scrim.remove(); }, 500);
}

// command palette
function paletteItems() {
  const base = [
    { label: '想法 · 把你的想法交给团队', hint: '#/idea', route: 'idea' },
    { label: '制作 · 实时进度与过程记录', hint: '#/build', route: 'build' },
    { label: '确认 · 需要你决定与成品', hint: '#/review', route: 'review' },
    { label: '我的 · 外观、服务连接与历史', hint: '#/profile', route: 'profile' },
    { label: '切换主题（暗 / 亮）', hint: 'theme', action: 'theme' },
  ];
  const recent = (state.projects || []).slice(0, 4).map((p) => ({
    label: '最近项目 · ' + p.title,
    hint: 'R' + (p.round || 0),
    id: p.id,
  }));
  return [...base, ...recent];
}

function openPalette() {
  if (ui.palette) return;
  ui.paletteIndex = 0;
  const wrap = document.createElement('div');
  wrap.className = 'palette-wrap';
  wrap.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="命令面板">
    <input id="palette-input" placeholder="搜索页面、主题或最近项目" aria-label="搜索">
    <div class="palette-list" id="palette-list"></div>
    <div class="palette-foot"><span>↑↓ 选择</span><span>Enter 执行</span><span>Esc 关闭</span></div>
  </div>`;
  paletteRoot.appendChild(wrap);
  ui.palette = wrap;
  renderPaletteList('');
  const input = document.getElementById('palette-input');
  input.focus();
  input.addEventListener('input', () => { ui.paletteIndex = 0; renderPaletteList(input.value); });
  input.addEventListener('keydown', (e) => {
    const items = currentPaletteItems();
    if (e.key === 'ArrowDown') { e.preventDefault(); ui.paletteIndex = Math.min(items.length - 1, ui.paletteIndex + 1); highlight(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); ui.paletteIndex = Math.max(0, ui.paletteIndex - 1); highlight(); }
    if (e.key === 'Enter') { e.preventDefault(); runPaletteItem(items[ui.paletteIndex]); }
  });
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) closePalette();
    const item = e.target.closest('[data-palette-index]');
    if (item) runPaletteItem(currentPaletteItems()[Number(item.dataset.paletteIndex)]);
  });
}

let paletteFiltered = [];

function currentPaletteItems() {
  return paletteFiltered;
}

function renderPaletteList(query) {
  const q = query.trim().toLowerCase();
  paletteFiltered = paletteItems().filter((it) => !q || it.label.toLowerCase().includes(q) || (it.hint || '').toLowerCase().includes(q));
  const list = document.getElementById('palette-list');
  if (!list) return;
  list.innerHTML = paletteFiltered.length
    ? paletteFiltered.map((it, i) => `<button class="palette-item" data-palette-index="${i}" aria-selected="${i === ui.paletteIndex}" type="button">
        <span>${esc(it.label)}</span><span class="hint">${esc(it.hint || '')}</span>
      </button>`).join('')
    : `<div class="palette-item">没有匹配项</div>`;
}

function highlight() {
  document.querySelectorAll('[data-palette-index]').forEach((el) => {
    el.setAttribute('aria-selected', String(Number(el.dataset.paletteIndex) === ui.paletteIndex));
  });
}

function runPaletteItem(item) {
  if (!item) return;
  closePalette();
  if (item.route) { setRoute(item.route); renderAll(); workspaceEl.scrollTop = 0; }
  else if (item.action === 'theme') {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : current === 'dark' ? 'tinted' : 'light';
    setThemeUser(next);
    renderChrome();
    renderPage();
    toast('外观：' + ({ light: '亮色', dark: '深色', tinted: '着色' }[next] || next));
  } else if (item.id) {
    const full = safeReadProject(item.id);
    if (full) {
      state.project = full;
      state.logs = full.logs || [];
      saveNow();
      setRoute(full.status === 'DELIVERED' ? 'review' : 'build');
      renderAll();
    }
  }
}

function closePalette() {
  if (!ui.palette) return;
  ui.palette.remove();
  ui.palette = null;
}

// ---------- account ----------

function authModalHtml() {
  const register = ui.authMode === 'register';
  return `
  <div class="scrim auth-scrim" data-auth-close></div>
  <section class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <button class="icon-btn auth-close" data-auth-close type="button" aria-label="关闭">${ICONS.close}</button>
    <div class="eyebrow">ACCOUNT · 可选</div>
    <h2 id="auth-title">${register ? '创建同步账号' : '登录以同步项目'}</h2>
    <p class="auth-lead">${register
      ? '账号只用来跨设备同步项目。不注册也能继续用，数据留在这台浏览器。'
      : '登录只用来把项目同步到其他设备。不登录也能直接用，数据留在这台浏览器。'}</p>
    <div class="auth-tabs segmented" role="tablist">
      <button type="button" data-auth-tab="login" aria-selected="${!register}">登录</button>
      <button type="button" data-auth-tab="register" aria-selected="${register}">注册</button>
    </div>
    <form id="auth-form" autocomplete="on" novalidate>
      ${register ? `
      <label class="auth-field"><span>昵称</span>
        <input name="name" type="text" maxlength="24" placeholder="团队里怎么称呼你" autocomplete="nickname" required>
      </label>` : ''}
      <label class="auth-field"><span>邮箱</span>
        <input name="email" type="email" maxlength="120" placeholder="you@example.com" autocomplete="email" required>
      </label>
      <label class="auth-field"><span>密码</span>
        <input name="password" type="password" minlength="8" maxlength="128" placeholder="${register ? '至少 8 位' : '输入密码'}" autocomplete="${register ? 'new-password' : 'current-password'}" required>
      </label>
      <div class="auth-error" id="auth-error" role="alert"></div>
      <button class="btn primary auth-submit" type="submit" ${ui.authBusy ? 'disabled' : ''}>${ui.authBusy ? '请稍候…' : (register ? '创建账号' : '登录')}</button>
    </form>
    <div class="auth-foot">
      <span>${register ? '已经有账号？' : '还没有账号？'}</span>
      <button class="link-btn" data-auth-tab="${register ? 'login' : 'register'}" type="button">${register ? '去登录' : '免费注册'}</button>
      <span class="spacer"></span>
      <button class="link-btn auth-skip" data-auth-close type="button">先用本机模式</button>
    </div>
    <p class="auth-note">密码只保存加密后的指纹，服务端不会读到明文。</p>
  </section>`;
}

function openAuth(mode = 'login') {
  ui.authMode = mode === 'register' ? 'register' : 'login';
  ui.authBusy = false;
  overlayRoot.querySelector('.auth-root')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'auth-root';
  wrap.innerHTML = authModalHtml();
  overlayRoot.appendChild(wrap);
  requestAnimationFrame(() => {
    const input = wrap.querySelector('input[name="email"]');
    if (input) input.focus({ preventScroll: true });
  });
}

function closeAuth() {
  overlayRoot.querySelector('.auth-root')?.remove();
}

function rerenderAuth() {
  const wrap = overlayRoot.querySelector('.auth-root');
  if (!wrap) return;
  wrap.innerHTML = authModalHtml();
  const input = wrap.querySelector('input[name="email"]');
  if (input) input.focus({ preventScroll: true });
}

async function hydrateAfterLogin() {
  state.syncing = true;
  try {
    const cloud = await loadCloudState();
    applyAccountState(cloud);
    await saveCloudState(accountPayload());
    state.cloudSavedAt = Date.now();
    state.cloudError = '';
  } catch (error) {
    state.cloudError = error?.message || '同步失败';
    toast('账号已登录，但项目同步暂时失败', 'warn');
  } finally {
    state.syncing = false;
  }
  renderAll();
  hydrate();
  resumeIfNeeded();
}

async function submitAuth(form) {
  const errorEl = form.querySelector('#auth-error');
  const data = new FormData(form);
  const email = String(data.get('email') || '').trim();
  const password = String(data.get('password') || '');
  const name = String(data.get('name') || '').trim();

  if (!email || !password) {
    if (errorEl) errorEl.textContent = '请填写邮箱和密码';
    return;
  }
  if (ui.authMode === 'register' && (!name || password.length < 8)) {
    if (errorEl) errorEl.textContent = '昵称不能为空，密码至少 8 位';
    return;
  }

  ui.authBusy = true;
  rerenderAuth();
  const busyForm = document.querySelector('#auth-form');
  if (busyForm) busyForm.dataset.mode = ui.authMode;

  try {
    const user = ui.authMode === 'register'
      ? await registerAccount({ email, name, password })
      : await loginAccount({ email, password });
    state.user = user;
    closeAuth(true);
    await hydrateAfterLogin();
    toast(`欢迎，${user.name}`, 'ok');
    maybeOpenGuide();
  } catch (error) {
    ui.authBusy = false;
    rerenderAuth();
    const freshError = document.querySelector('#auth-error');
    const freshForm = document.querySelector('#auth-form');
    if (freshError) freshError.textContent = error?.message || '登录失败，请稍后重试';
    if (freshForm) {
      freshForm.querySelector('input[name="email"]').value = email;
      if (freshForm.querySelector('input[name="name"]')) {
        freshForm.querySelector('input[name="name"]').value = name;
      }
    }
  }
}

async function handleLogout() {
  const p = state.project;
  if (p && ['BUILDING', 'REVIEWING', 'REWORKING'].includes(p.status)) {
    p.pausedFrom = p.status;
    p.status = 'PAUSED';
    p.pausedReason = 'USER';
    p.autoRun = false;
    p.nextRetryAt = null;
  }
  try {
    if (state.user) await saveCloudState(accountPayload());
  } catch (e) {}
  await logoutAccount();
  clearAccountData();
  state.user = null;
  state.cloudSavedAt = 0;
  state.cloudError = '';
  renderAll();
  toast('已退出登录，云端项目仍保留', 'ok');
}

async function initAccount() {
  try {
    const user = await authMe();
    if (!user) {
      state.user = null;
      state.cloudSavedAt = 0;
      return;
    }
    state.user = user;
    const cloud = await loadCloudState();
    applyAccountState(cloud);
    if (!(cloud?.projects || []).length && accountPayload().projects.length) {
      await saveCloudState(accountPayload());
      state.cloudSavedAt = Date.now();
    }
    renderAll();
    resumeIfNeeded();
    maybeOpenGuide();
  } catch (error) {
    state.user = null;
    state.cloudError = error?.message || '';
  } finally {
    state.authChecked = true;
    renderAll();
  }
}

// toast
function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  toastRoot.appendChild(el);
  while (toastRoot.children.length > 3) toastRoot.firstChild.remove();
  setTimeout(() => el.remove(), 3500);
}

// iframe mount + clock
function hydrate() {
  const p = state.project;
  const frame = document.getElementById('artifact-frame');
  if (frame && p?.artifact?.html) {
    frame.srcdoc = applyBaseStyle(p.artifact.html, p.style);
  }
  const chatLog = document.getElementById('team-chat-log');
  if (chatLog) {
    const toBottom = () => { chatLog.scrollTop = chatLog.scrollHeight; };
    toBottom();
    requestAnimationFrame(toBottom);
    setTimeout(toBottom, 60);
  }
  updateRelativeTimes();
  if (state.autofollow && state.route === 'build' && ui.follow) {
    workspaceEl.scrollTop = workspaceEl.scrollHeight;
  }
}

function updateRelativeTimes() {
  document.querySelectorAll('[data-rel]').forEach((el) => {
    const ts = Number(el.dataset.rel);
    el.textContent = rel(ts);
  });
}

// project switching
function safeReadProject(id) {
  if (state.project && state.project.id === id) return state.project;
  try {
    const list = JSON.parse(localStorage.getItem(KEYS.projects) || '[]');
    return list.find((x) => x.id === id) || null;
  } catch (e) {
    return null;
  }
}

// heartbeat
async function pollHeartbeat() {
  const hb = await heartbeat();
  if (hb.ok) {
    state.heartbeat = { lastOkAt: hb.ts, lastTryAt: hb.ts, ok: true, provider: hb.providerName };
  } else {
    state.heartbeat = { ...state.heartbeat, lastTryAt: hb.ts, ok: false };
  }
  try { localStorage.setItem(KEYS.heartbeat, JSON.stringify(state.heartbeat)); } catch (e) {}
  if (state.route === 'profile' || state.route === 'idea') renderPage();
}

document.addEventListener('change', (ev) => {
  if (ev.target?.id !== 'qwen-provider-select') return;
  const provider = QWEN_PROVIDERS.find((x) => x.id === ev.target.value) || QWEN_PROVIDERS[0];
  const input = document.getElementById('qwen-provider-key');
  const help = document.querySelector('.provider-help');
  if (input && !qwenProviderConfig().key) input.placeholder = provider.hint;
  if (help) help.href = provider.url;
});

document.addEventListener('submit', (ev) => {
  if (ev.target?.id === 'team-chat-form') {
    ev.preventDefault();
    const input = document.getElementById('team-chat-input');
    sendTeamChat(input?.value);
    if (input) input.value = '';
    return;
  }
  if (ev.target?.id !== 'auth-form') return;
  ev.preventDefault();
  submitAuth(ev.target);
});

// boot
function boot() {
  loadTheme();
  loadState();
  try { state.tag = localStorage.getItem('fc-tag') || '工具'; } catch (e) {}
  const pathRoute = pathToRoute(location.pathname);
  const hashRoute = hashToRoute();
  if (pathRoute) {
    state.route = pathRoute;
    const root = location.pathname.endsWith('/')
      ? location.pathname
      : location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1);
    history.replaceState({ route: pathRoute }, '', root + '#/' + pathRoute);
  } else if (hashRoute) {
    state.route = hashRoute;
  }
  renderAll();
  updateRouteFromLocation();
  hydrate();
  initAccount();

  // 计时：状态台实时
  setInterval(() => {
    if (state.route === 'build') updateRelativeTimes();
    renderCrew();
  }, 1500);

  pollHeartbeat();
  setInterval(pollHeartbeat, 60_000);
  setInterval(checkPauseTimer, 1000);

  workspaceEl.addEventListener('scroll', () => {
    const near = workspaceEl.scrollHeight - workspaceEl.scrollTop - workspaceEl.clientHeight < 60;
    ui.follow = near;
  }, { passive: true });

  window.addEventListener('popstate', updateRouteFromLocation);
  window.addEventListener('hashchange', updateRouteFromLocation);
  window.addEventListener('resize', () => { renderPage(); });
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (state.themeUser === 'system') applyTheme();
  });

  document.addEventListener('fc:theme', () => {
    if (state.route === 'profile') renderPage();
  });

}

function pathToRoute(pathname) {
  const clean = decodeURIComponent(pathname || '/').replace(/\/$/, '');
  if (clean === '' || clean === '/' || clean === '/index.html') return null;
  const map = { '/idea': 'idea', '/new': 'idea', '/build': 'build', '/review': 'review', '/profile': 'profile', '/我的': 'profile', '/想法': 'idea', '/制作': 'build', '/验收': 'review' };
  return map[clean] || null;
}

function hashToRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (!raw) return null;
  if (raw === 'new') return 'idea';
  return ['idea', 'build', 'review', 'profile'].includes(raw) ? normalizeRoute(raw) : null;
}

function updateRouteFromLocation() {
  const hashRoute = hashToRoute();
  if (hashRoute && hashRoute !== state.route) {
    state.route = hashRoute;
    renderAll();
  }
}

boot();
