// app entry: routing, views, crew panel, sheet, command palette

import {
  BRAND, COPY, ICONS, LOGO_SVG, ROLES, TAGS, RECIPES, API,
} from './config.js';
import {
  state, KEYS, STAGES, STATUS, loadTheme, loadState, saveNow, scheduleSave,
  setRoute, setThemeUser, newProject, touch, addLog, deriveAgents, workingCount,
  badgeOf, stageOf, projectPct, stageProgress, formatClock, formatRelative,
  formatMmSs, formatDateTime, totalElapsed, pauseReasonText, callsToday, summarize,
  normalizeRoute,
} from './store.js';
import { complete, heartbeat, ApiError } from './api.js';
import { advance, resumeFromPause, inspect } from './pipeline.js';

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
  cleared: false,
  decisionIndex: 0,
  follow: false,
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const tagLabel = (k) => (TAGS.find((t) => t.key === k)?.label || k || '未分类');

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
  } catch (err) {
    console.error('[crew]', err);
    toast('施工队异常：' + (err?.message || '未知错误'), 'err');
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
    saveNow();
    renderAll();
  }
}

function resumeIfNeeded() {
  const p = state.project;
  if (!p || p.autoRun === false) return;
  if (p.status === 'PAUSED') {
    if (p.nextRetryAt && Date.now() >= p.nextRetryAt) {
      resumeFromPause(p);
      addLog(p, 'SYSTEM', '通道恢复，施工队续跑', null);
      saveNow();
      runEngine();
    }
    return;
  }
  const active = ['intake', 'plan', 'build', 'review', 'apply', 'deliver', 'polish'].includes(p.phase);
  if (active && p.status !== 'DELIVERED') {
    if (p.phase === 'polish') {
      addLog(p, 'SYSTEM', '恢复上次未完成的取悦声明', null);
    } else {
      addLog(p, 'SYSTEM', '检测到未完成的施工，自动续跑', null);
    }
    runEngine({ resume: true });
  }
}

function checkPauseTimer() {
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
  const active = state.route;
  const recent = (state.projects || []).slice(0, 3);
  const link = (route, icon) => {
    const label = COPY.nav[route];
    const count = navCount(route);
    const alert = route === 'review' && p && p.status === 'AWAITING_USER';
    return `<button class="nav-item ${active === route ? 'active' : ''}" data-nav="${route}" type="button" aria-current="${active === route ? 'page' : 'false'}">
      ${ICONS[route]}<span>${label}</span>
      ${alert ? '<span class="dot-alert"></span>' : ''}
      ${count ? `<span class="count">${count}</span>` : ''}
    </button>`;
  };
  railEl.innerHTML = `
    <div class="brand" data-nav="idea" role="button" tabindex="0">
      <div class="brand-mark">${LOGO_SVG}</div>
      <div class="brand-text"><b>${BRAND.name}</b><span>${BRAND.sub}</span></div>
    </div>
    <div class="rail-label">工作台</div>
    <div class="nav">
      ${link('idea')}${link('build')}${link('review')}${link('profile')}
    </div>
    <div class="rail-recent">
      <div class="head"><span>最近的脑洞</span><b>${state.projects.length}</b></div>
      ${recent.length ? recent.map((item) => `
        <button class="item" data-open="${esc(item.id)}" type="button">
          <span class="bullet ${item.status === 'DELIVERED' ? 'ok' : item.status === 'AWAITING_USER' ? 'wait' : ['BUILDING', 'REVIEWING', 'REWORKING'].includes(item.status) ? 'run' : ''}"></span>
          <span>${esc(item.title)}</span>
        </button>`).join('') : '<div class="crew-empty" style="padding:6px 0;text-align:left">还没有脑洞</div>'}
    </div>
    <div class="rail-foot">
      <div class="row"><span class="dot ${agents.some((a) => ['working', 'thinking', 'reviewing'].includes(a.state)) ? 'run' : 'ok'}"></span>${COPY.channelShort} · ${COPY.serial}<span class="ver">${BRAND.version}</span></div>
      <div class="row"><span>${workingCount(agents)} 名成员作业中</span></div>
    </div>`;
}

function crumbsHtml() {
  const p = state.project;
  if (state.route === 'build' && p) {
    return `<span>${COPY.breadcrumb}</span><span class="sep">/</span><span>${COPY.nav.build}</span><span class="sep">/</span><span class="current">${esc(p.title)}</span>`;
  }
  return `<span>${COPY.breadcrumb}</span><span class="sep">/</span><span class="current">${COPY.nav[state.route]}</span>`;
}

function renderTopbar() {
  const p = state.project;
  const agents = deriveAgents(p);
  const alert = p && p.status === 'AWAITING_USER';
  topbarEl.innerHTML = `
    <div class="crumbs">${crumbsHtml()}</div>
    <div class="topbar-actions">
      <button class="search-pill" id="open-palette" type="button" aria-label="搜索与命令">
        ${ICONS.search}<span>搜索</span><kbd>⌘K</kbd>
      </button>
      <button class="crew-trigger" id="open-crew" type="button" aria-label="打开施工队状态台">
        ${ICONS.sliders}<span class="label">施工队</span>
        <span class="badge">${workingCount(agents)}</span>
      </button>
      <button class="icon-btn" id="toggle-theme" type="button" aria-label="切换主题" title="切换暗色 / 亮色">
        ${ICONS.sun}
      </button>
      <button class="avatar" data-nav="profile" type="button" aria-label="我的">你</button>
    </div>`;
}

function renderTabbar() {
  const p = state.project;
  const items = ['idea', 'build', 'review', 'profile'];
  tabbarEl.innerHTML = items.map((route) => {
    const alert = route === 'review' && p && p.status === 'AWAITING_USER';
    return `<button type="button" data-nav="${route}" aria-current="${state.route === route ? 'page' : 'false'}">
      ${ICONS[route]}<span>${COPY.nav[route]}</span>
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
  const saluting = Boolean(state.project?.saluteUntil && Date.now() < state.project.saluteUntil);
  return `<button class="agent-card ${opts.mini ? 'mini' : ''}" data-agent="${a.key}" type="button"
      aria-expanded="${expanded}" ${a.state === 'blocked' ? 'data-breath="1"' : ''}>
    <div class="top">
      <div class="agent-avatar ${avatarClass}">${a.letter}</div>
      <div class="agent-id"><b>${a.name}${saluting ? '<span class="salute" role="img" aria-label="敬礼">🫡</span>' : ''}<em>${a.role}</em></b></div>
      <div class="state">${statePill}</div>
    </div>
    <div class="agent-action">${esc(a.action)}</div>
    <div class="agent-progress">
      <div class="bar ${a.state === 'done' ? 'ok' : a.state === 'paused' ? 'danger' : ''}"><i style="width:${Math.max(0, Math.min(100, a.progress))}%"></i></div>
      <span class="num">${a.state === 'done' ? '已完成' : a.progress + '%'}</span>
    </div>
    ${a.recent?.length ? `<ul class="agent-recent">${a.recent.map((r) => `<li><span class="t">${formatClock(r.ts)}</span><span>${esc(r.text).slice(0, 46)}</span></li>`).join('')}</ul>` : ''}
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
  return `
    <div class="crew-task">
      <div class="row"><span>当前任务</span><span class="r">R${p.round || 0}</span></div>
      <div class="title">${esc(p.title)}</div>
      <div class="stage-row"><span>${prog.done} / ${prog.total} 阶段</span><span class="pct">${projectPct(p)}%</span></div>
      <div class="bar ${p.status === 'DELIVERED' ? 'ok' : p.status === 'PAUSED' ? 'danger' : ''}"><i style="width:${projectPct(p)}%"></i></div>
    </div>
    ${agents.map((a) => agentCard(a, { mini })).join('')}`;
}

function dummyCards(agents, mini) {
  return `<div class="crew-empty">施工队待命中。<br>写一句脑洞，5 名成员会立刻进场。</div>`
    + agents.map((a) => agentCard(a, { mini })).join('');
}

function renderCrew() {
  const p = state.project;
  const agents = deriveAgents(p);
  const header = `
    <div class="crew-head">
      <div class="row"><h2>施工队</h2><span class="live"><span class="dot ${p && ['BUILDING', 'REVIEWING', 'REWORKING'].includes(p.status) ? 'run' : 'ok'}"></span>${COPY.live}</span></div>
      <div class="crew-sub"><span>${agents.length} 名成员</span><span>·</span><span>${workingCount(agents)} 名作业中</span><span>·</span><span>${p?.providerName || COPY.channelShort}</span></div>
    </div>`;
  const scrollTop = crewEl.querySelector('.crew-body')?.scrollTop || 0;
  crewEl.innerHTML = `${header}
    <div class="crew-body">${crewBodyHtml(p)}</div>
    <div class="crew-foot">
      <span>${p ? `第 ${p.round || 0} 轮 · 最后更新 ${rel(p.updatedAt)}` : '等待第一个脑洞'}</span>
      <span class="side"><button class="btn" data-nav="build" type="button">查看时间线</button></span>
    </div>`;
  const body = crewEl.querySelector('.crew-body');
  if (body) body.scrollTop = scrollTop;
}

// render: page dispatch
function renderPage() {
  const active = document.activeElement;
  const focusId = active && active.id ? active.id : null;
  const selStart = active && 'selectionStart' in active ? active.selectionStart : null;

  const scrollTop = workspaceEl.scrollTop;
  let html = '';
  if (state.route === 'idea') html = ideaHtml();
  else if (state.route === 'build') html = buildHtml();
  else if (state.route === 'review') html = reviewHtml();
  else html = profileHtml();
  pageEl.innerHTML = html;
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
  const rows = projects.map((item) => `
    <tr data-open="${esc(item.id)}">
      <td class="title">${esc(item.title)}<span class="tag">${esc(item.tag)}</span></td>
      <td class="dim">第 ${item.round || 0} 轮</td>
      <td>${statusPillOf(item)}</td>
      <td class="dim">${formatDateTime(item.updatedAt)}</td>
      <td class="go">→</td>
    </tr>`).join('');
  const mobileRows = projects.map((item) => `
    <button class="recent-row" data-open="${esc(item.id)}" type="button">
      <div class="txt"><b>${esc(item.title)}</b><span>${statusPillOf(item)}<span>第 ${item.round || 0} 轮</span><span>${rel(item.updatedAt)}</span></span></div>
      <span class="chev">›</span>
    </button>`).join('');

  return `
  <div class="eyebrow">01 <i>·</i> 新想法</div>
  <h1 class="page-title idea-title">${COPY.title.idea}</h1>
  <p class="page-lead">${COPY.lead.idea}</p>

  <div class="idea-grid">
    <div class="idea-main">
      <div class="composer">
        <textarea id="composer-input" placeholder="${esc(COPY.placeholder)}" enterkeyhint="send" aria-label="脑洞输入">${esc(state.draft)}</textarea>
        <div class="composer-tags">
          <span class="label">标签</span>
          <div class="chips" id="tag-chips">
            ${TAGS.map((t) => `<button class="chip" type="button" data-tag="${t.key}" aria-pressed="${state.tag === t.key}">${t.label}</button>`).join('')}
          </div>
        </div>
        <div class="composer-error" id="composer-error" hidden></div>
        <div class="composer-foot">
          <div class="composer-hint">${ICONS.info}<span>${COPY.queueHint}</span></div>
          <button class="btn primary" id="dispatch" type="button">${COPY.dispatch} <span class="arrow">→</span></button>
        </div>
      </div>
      <div class="flow-strip">
        <div class="flow-avatars">${agents.map((a) => `<span>${a.letter}</span>`).join('')}</div>
        <div class="txt">${COPY.flow.replace('。', '。 ')}当前 <b>${COPY.channelShort}</b> ${online ? '在线' : '连接中'}。</div>
      </div>
    </div>
    <aside>
      <div class="aside-title">${COPY.recipesTitle}</div>
      <div class="recipe-list recipes">${recipeList()}</div>
    </aside>
  </div>

  <section class="section">
    <div class="section-head">
      <h2>${COPY.recentTitle}</h2>
      <span class="meta">${COPY.recentCount.replace('{n}', projects.length)}</span>
      <span class="spacer"></span>
      <button class="btn small" data-nav="profile" type="button">${COPY.allRecords}</button>
    </div>
    ${projects.length ? `
      <table class="recent-table">
        <thead><tr><th>名称</th><th>轮次</th><th>状态</th><th>更新</th><th></th></tr></thead>
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
      <thead><tr><th role="columnheader">员工</th><th>状态</th><th>当前动作</th><th>进度</th><th>轮次</th><th>用时</th></tr></thead>
      <tbody>
        ${agents.map((a) => `<tr>
          <td class="who"><span class="mini-avatar">${a.letter}</span><span>${a.name}<span class="sub">${a.role}</span></span></td>
          <td>${pill(a.label, a.tone)}</td>
          <td>${esc(a.action)}</td>
          <td class="bar-cell">
            <div class="bar ${a.state === 'done' ? 'ok' : ''}"><i style="width:${a.progress}%"></i></div>
            <span class="num">${a.state === 'done' ? '100%' : a.progress + '%'}</span>
          </td>
          <td class="mono">R${a.round || 0}</td>
          <td class="mono">${fmtElapsed(a.elapsedMs)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function stepperHtml(p) {
  const stage = stageOf(p.status);
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
  if (isQuotaPause(p)) {
    return `<div class="pause-banner">
      <span class="dot err"></span>
      <span><b>免费通道额度已用完</b> ${secs != null ? `，${secs} 秒后自动重试，无需操作` : '，正在自动重试'}</span>
    </div>`;
  }
  return `<div class="pause-banner">
    <span class="dot err"></span>
    <span><b>${reason.long}</b> ${secs != null ? `，施工队将在 ${secs} 秒后自动续跑` : '，请到我的页检查通道'}</span>
    <span class="act"><button class="btn small" id="resume-now" type="button">${COPY.retry}</button></span>
  </div>`;
}

function buildActions(p) {
  if (p.status === 'AWAITING_USER') {
    return `<button class="btn" data-nav="review" type="button">${COPY.goReview}</button>
      <button class="btn primary" data-nav="review" type="button">${p.awaitReason === 'escalate' ? '去定方向' : '去拍板'}</button>`;
  }
  if (p.status === 'DELIVERED') {
    return `<button class="btn" data-nav="idea" type="button">${COPY.backToIdea}</button>
      <button class="btn primary" data-nav="review" type="button">${COPY.goReview}</button>`;
  }
  if (isQuotaPause(p)) {
    return `<button class="btn" data-nav="review" type="button">${COPY.goReview}</button>`;
  }
  return `<button class="btn" data-nav="review" type="button">${COPY.goReview}</button>
    <button class="btn primary" id="advance" type="button">${p.status === 'PAUSED' ? '现在继续' : '继续推进'}</button>`;
}

function buildHtml() {
  const p = state.project;
  if (!p) {
    return `<div class="eyebrow">02 / 实时进度</div>
      <h1 class="page-title">施工进度</h1>
      <div class="empty" style="margin-top:24px"><b>${COPY.emptyBuild}</b>${COPY.emptyBuildHint}<div style="margin-top:14px"><button class="btn" data-nav="idea" type="button">${COPY.goIdea}</button></div></div>`;
  }
  return `
  <div class="build-head">
    <div class="grow">
      <div class="eyebrow">02 / 实时进度</div>
      <div class="title-row">
        <h1 class="page-title">${esc(p.title)}</h1>
        ${pill(badgeOf(p.status), { PENDING: 'idle', BUILDING: 'run', REVIEWING: 'run', AWAITING_USER: 'wait', REWORKING: 'run', DELIVERED: 'ok', PAUSED: 'fail' }[p.status] || 'idle')}
      </div>
      <div class="meta-row">
        <span>标签 <b>${esc(tagLabel(p.tag))}</b></span>
        <span>轮次 <b>第 ${p.round || 0} 轮</b></span>
        <span>通道 <b>${esc(p.providerName || COPY.channelShort)}</b></span>
        <span>更新 <b data-rel="${p.updatedAt}">${rel(p.updatedAt)}</b></span>
      </div>
    </div>
    <div class="actions">${buildActions(p)}</div>
  </div>
  ${pauseBanner(p)}
  ${stepperHtml(p)}
  <section class="section">
    <div class="log-head">
      <h2>施工日志</h2><span class="count">${state.logs.length} 条</span>
      <span class="spacer" style="flex:1"></span>
      <div class="segmented" role="tablist">
        <button type="button" data-view="timeline" aria-selected="${state.view === 'timeline'}">${COPY.timeline}</button>
        <button type="button" data-view="table" aria-selected="${state.view === 'table'}">${COPY.statusTable}</button>
      </div>
      <button class="autofollow" id="toggle-follow" type="button" aria-label="自动跟随">
        <span class="switch" aria-checked="${state.autofollow}"></span>${COPY.autofollow}
      </button>
    </div>
    ${state.view === 'timeline' ? timelineHtml(p) : statusTableHtml(p)}
    ${p.status === 'AWAITING_USER' ? `<div class="await-bar"><span class="dot"></span><span>${p.awaitReason === 'escalate' ? '同一个问题连续两轮没修好，需要你定方向。' : '产物已通过自检，裁决点等你拍板。'}</span><span class="act"><button class="btn small" data-nav="review" type="button">${COPY.goReview}</button></span></div>` : ''}
  </section>`;
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
  const opt = (o, i) => {
    const key = o?.key || (i === 0 ? 'A' : 'B');
    const bullet = o?.tradeoff ? `<ul class="tradeoff"><li>${esc(Array.isArray(o.tradeoff) ? o.tradeoff.join(' / ') : o.tradeoff)}</li></ul>` : '';
    return `
    <button class="option" type="button" data-choice="${d.id}:${key}" aria-pressed="${d.chosen === key}">
      <span class="key-wrap"><span class="key">${key}</span><span>方案</span></span>
      <span class="pick" aria-hidden="true"></span>
      <h4>${esc(o?.label || '未命名方案')}</h4>
      <span class="body">${esc(o?.body || '')}</span>
      ${bullet}
    </button>`;
  };
  return `<div class="decision-card">
    <div class="decision-head">
      <span class="no">决策点 ${d.index || index} / ${total}</span>
      <h3>${d.topic ? `${esc(d.topic)}：` : ''}${esc(d.title || '待定')}</h3>
      <span class="act">${d.chosen ? pill('已拍板 · ' + d.chosen, 'ok') : pill('等你拍板', 'wait', 'data-breath="1"')}</span>
    </div>
    <div class="decision-context">
      <div class="quote"><span class="q">“</span>${esc(p.prompt)}<span class="q close">”</span></div>
    </div>
    <div class="decision-sub">${esc(tagLabel(p.tag))} · 第 ${p.round} 轮 · 施工队建议在下面两个方案里二选一${d.context ? ` · ${esc(d.context)}` : ''}</div>
    <div class="options" role="group" aria-label="裁决选项">
      ${opt(d.optionA, 0)}${opt(d.optionB, 1)}
    </div>
    <div class="decision-foot">
      <span>${allChosen ? '两个裁决点都已拍板，可以继续施工' : COPY.decisionFoot}</span>
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
        : '施工队连续两轮没有通过同一项检查。'}</div>
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

function previewCard(p) {
  const a = p.artifact;
  if (!a) return '';
  return `<div class="preview-card">
    <div class="preview-head">
      <h3>${COPY.latest}</h3>${pill(COPY.delivered, 'ok')}
      <span class="meta" style="font-size:10.5px;color:var(--text-3)">第 ${a.round} 轮 · ${formatDateTime(a.createdAt)} · ${(a.html.length / 1024).toFixed(1)} KB</span>
      <span class="act"><button class="btn small" id="open-artifact" type="button">${COPY.viewNewTab}</button></span>
    </div>
    <div class="preview-body">
      <div class="preview-frame-wrap">
        <div class="browser-chrome"><span></span><span></span><span></span><span class="url">forgecrew.app/p/${esc(p.id.slice(-6))} · round ${a.round}</span></div>
        <iframe class="preview-frame" id="artifact-frame" sandbox="allow-scripts" title="成品预览"></iframe>
      </div>
      <div class="delight">
        <h4>${COPY.delight}</h4>
        <div class="sub">${COPY.delightSub}</div>
        ${p.delight?.length ? `<ul>${p.delight.map((d) => `<li>
          <span class="check">✓</span>
          <span><b>${esc(d.requirement || d.text || '')}</b>${esc(d.response || '')}<span>${d.kind === 'IMPLICIT' ? '隐性偏好 · 已补' : '显性要求 · 已满足'}</span></span>
        </li>`).join('')}</ul>` : `<div class="empty" style="padding:18px 0;border:0">
          ${p.pleaserFailed ? '取悦声明生成失败。' : '取悦声明正在生成…'}
          ${p.pleaserFailed ? '<div style="margin-top:10px"><button class="btn small" id="retry-delight" type="button">重试取悦</button></div>' : ''}
        </div>`}
      </div>
    </div>
  </div>`;
}

function reviewHtml() {
  const p = state.project;
  if (!p) {
    return `<div class="eyebrow">03 / 关键决策</div>
      <h1 class="page-title">验收台</h1>
      <p class="page-lead">${COPY.lead.review}</p>
      <div class="empty" style="margin-top:24px"><b>${COPY.emptyReview}</b>${COPY.emptyReviewHint}<div style="margin-top:14px"><button class="btn" data-nav="build" type="button">${COPY.seeLog}</button></div></div>`;
  }
  const awaiting = p.status === 'AWAITING_USER';
  return `
  <div class="eyebrow">03 / 关键决策</div>
  <h1 class="page-title">验收台</h1>
  <p class="page-lead">${COPY.lead.review}</p>
  ${awaiting && p.awaitReason === 'escalate' ? escalateCard(p) : ''}
  ${awaiting && p.awaitReason !== 'escalate' ? decisionCard(p) : ''}
  ${!awaiting && p.status !== 'DELIVERED' ? `<div class="await-bar" style="margin-top:20px">
      <span class="dot run"></span><span>施工队正在作业，第 ${p.round} 轮。裁决点会在产物通过自检后出现在这里。</span>
      <span class="act"><button class="btn small" data-nav="build" type="button">${COPY.goBuild}</button></span>
    </div>` : ''}
  ${p.status === 'DELIVERED' && !awaiting ? previewCard(p) : ''}
  ${awaiting && p.artifact ? previewCard(p) : ''}`
  ;
}

// view: profile
function historyRowsHtml() {
  const items = (state.projects || []).slice(0, 5);
  if (!items.length) return `<div class="empty" style="padding:20px;border:0">还没有历史脑洞。</div>`;
  return items.map((item) => `
    <button class="history-row" data-open="${esc(item.id)}" type="button">
      <div class="txt"><b>${esc(item.title)}</b><span>${esc(tagLabel(item.tag))} · 第 ${item.round || 0} 轮 · ${formatDateTime(item.updatedAt)}</span></div>
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
      <div class="panel">
        <h3>外观</h3>
        <div class="desc">跟随系统，或固定使用深色、亮色。</div>
        <div class="seg-full" role="group" aria-label="外观">
          ${[['system', '跟随系统'], ['dark', '深色'], ['light', '亮色']].map(([key, label]) => `<button type="button" data-theme-set="${key}" aria-selected="${state.themeUser === key}">${label}</button>`).join('')}
        </div>
        <div class="panel-sect">
          <div class="setting-row">
            <div class="txt"><b>施工队敬礼</b><span>开工与交付时，5 名成员各敬一个礼</span></div>
            <div class="side"><button class="switch" data-toggle-follow type="button" aria-checked="${state.autofollow}" aria-label="自动跟随"></button></div>
          </div>
          <div class="setting-row">
            <div class="txt"><b>验收通知</b><span>到达裁决点或交付时提醒你</span></div>
            <div class="side"><button class="switch" id="notify-toggle" type="button" aria-checked="false" aria-label="验收通知"></button></div>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>施工通道</h3>
        <div class="desc">服务端统一调度，浏览器不持有密钥。</div>
        <div class="channel-row">
          <span class="dot ${hb.tone === 'fail' ? 'err' : hb.tone === 'wait' ? 'wait' : 'ok'}"></span>
          <div class="txt"><b>${COPY.channel}</b><span>${esc(hb.text)}</span></div>
          <span class="side">${hb.tone === 'fail' ? '离线' : '在线'}</span>
        </div>
        <div class="panel-sect">
          <div class="setting-row">
            <div class="txt"><b>串行作业</b><span>一次只接一个脑洞，保证每一步都做到位</span></div>
            <div class="side"><button class="switch on-locked" type="button" aria-checked="true" disabled aria-label="串行作业"></button></div>
          </div>
          <div class="setting-row">
            <div class="txt"><b>演示模式</b><span>用预置脚本跑通闭环；真实通道在线时关闭</span></div>
            <div class="side"><button class="switch" id="demo-toggle" type="button" aria-checked="false" aria-label="演示模式"></button></div>
          </div>
        </div>
        <div class="channel-foot">
          ${reason ? `上次暂停原因：${esc(reason.long)} · ${next}<br>` : ''}
          今日调用 ${callsToday()} 次 · 单服务串行，同一时间只接一个脑洞<br>
          <span style="color:var(--text-3)">保活每 5 分钟一次，冷启动通常 < 30 秒。</span>
        </div>
      </div>
    </div>

    <div>
      <div class="panel">
        <div class="section-head" style="margin-bottom:10px"><h3>历史脑洞</h3><span class="meta" style="margin-left:auto">${state.projects.length} 个</span></div>
        <div class="history-tabs segmented" role="tablist">
          ${['全部', '施工中', '待验收', '已交付', '已暂停'].map((t, i) => `<button type="button" aria-selected="${i === 0}" style="pointer-events:none">${t}</button>`).join('')}
        </div>
        ${historyRowsHtml()}
        <div class="danger-zone">
          <span class="txt">清空本地数据会删除所有脑洞、日志与成品，无法恢复。</span>
          <span class="side"><button class="btn small ghost-danger" id="clear-start" type="button">清空数据</button></span>
        </div>
        <div id="clear-confirm-wrap"></div>
      </div>

      <div class="panel">
        <div class="about-product">
          <div><b>${BRAND.name} · ${BRAND.version}</b><span>Agent crew · idea to acceptance</span></div>
          <span class="logo-mini">${LOGO_SVG}</span>
        </div>
        <div class="about-row"><span>设计语言</span><span class="side"><span class="chip-mini">DS v1</span> 双主题 · 石墨 / 纸白 · 单一暖色强调</span></div>
        <div class="about-row"><span>推理通道</span><span class="side">${esc(p?.providerName || COPY.channelShort)} · ${API.base() ? '跨域代理' : '同源代理'}</span></div>
      </div>
    </div>
  </div>`;
}

function bindPageEvents() {
  // delegated at document level; page handlers are bound here
}

document.addEventListener('click', (ev) => {
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

  const themeSet = ev.target.closest('[data-theme-set]');
  if (themeSet) {
    setThemeUser(themeSet.dataset.themeSet);
    renderPage();
    toast('外观已切换为' + ({ system: '跟随系统', dark: '深色', light: '亮色' }[themeSet.dataset.themeSet] || ''));
    return;
  }

  if (ev.target.closest('#toggle-theme')) {
    const current = document.documentElement.getAttribute('data-theme');
    setThemeUser(current === 'dark' ? 'light' : 'dark');
    renderPage();
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
      addLog(p, 'USER', `裁决点 ${d.marker} 已选择 ${key} 方案：${key === 'A' ? d.optionA.label : d.optionB.label}`, null);
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
  if (ev.target.closest('#retry-delight')) { retryDelight(); return; }
  if (ev.target.closest('#clear-start')) { renderClearConfirm(); return; }
  if (ev.target.closest('#clear-cancel')) { const w = document.getElementById('clear-confirm-wrap'); if (w) w.innerHTML = ''; return; }
  if (ev.target.closest('#clear-run')) { clearAll(); return; }
  if (ev.target.closest('#notify-toggle')) {
    toast('验收通知需要在浏览器里允许通知权限后才生效');
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
    if (ui.palette) closePalette();
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
  if (!text) { showError('先写一句脑洞：施工队需要一个具体目标。'); return; }
  if (text.length < 6) { showError('太短了，补一句要做什么或给谁用。'); return; }
  if (state.project && ['BUILDING', 'REVIEWING', 'REWORKING', 'PAUSED'].includes(state.project.status)) {
    showError('施工队正在作业，一次只接一个脑洞。等当前项目交付后再进场。');
    return;
  }
  if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
  if (btn) { btn.disabled = true; btn.textContent = COPY.dispatchPending; }
  state.draft = '';
  try { localStorage.removeItem(KEYS.draft); } catch (e) {}
  const project = newProject(text, state.tag);
  project.spec = null;
  project.saluteUntil = Date.now() + 15000;
  project.saluteKind = 'start';
  setRoute('build');
  renderAll();
  workspaceEl.scrollTop = 0;
  runEngine();
}

function continueNow() {
  ui.follow = true;
  const p = state.project;
  if (!p) { setRoute('idea'); renderAll(); return; }
  if (p.status === 'AWAITING_USER') { setRoute('review'); renderAll(); return; }
  if (p.status === 'PAUSED') {
    resumeFromPause(p);
    addLog(p, 'USER', '点击“现在继续”，恢复施工', null);
    saveNow();
    renderAll();
    runEngine();
    return;
  }
  if (ui.running) { toast('施工队正在作业，请稍候'); return; }
  runEngine();
}

function applyPlan() {
  const p = state.project;
  if (!p) return;
  const all = (p.decisions || []).every((d) => d.chosen);
  if (!all) { toast('两个裁决点都要选一个方案', 'err'); return; }
  p.phase = 'apply';
  p.decisionsApplied = true;
  addLog(p, 'USER', '两个裁决点已拍板，施工队按所选方案继续', 'wait');
  saveNow();
  setRoute('build');
  renderAll();
  runEngine();
}

function rejectPlan() {
  const p = state.project;
  if (!p) return;
  p.decisionsApplied = true;
  p.round += 1;
  p.maxRound = Math.max(p.maxRound, p.round);
  p.reworkOrder = '用户要求再试一版：换一种更贴近原话的表达，保留全部验收标准';
  p.phase = 'build';
  p.status = 'REWORKING';
  p.stage = stageOf('REWORKING');
  p.roundStartedAt = Date.now();
  addLog(p, 'USER', '要求施工队再试一版', 'wait');
  saveNow();
  setRoute('build');
  renderAll();
  runEngine();
}

function escalateRetry() {
  const p = state.project;
  if (!p) return;
  p.escalate = false;
  p.round += 1;
  p.maxRound = p.round + 1;
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
  addLog(p, 'USER', '重试取悦声明', null);
  saveNow();
  renderPage();
  runEngine();
}

function openArtifact() {
  const p = state.project;
  if (!p?.artifact?.html) { toast('还没有可打开的成品', 'err'); return; }
  const blob = new Blob([p.artifact.html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
        <h2>施工队</h2>
        <div class="sub">${agents.length} 名成员 · ${workingCount(agents)} 名作业中 · ${p?.providerName || COPY.channelShort}</div>
      </div>
      <button class="sheet-close" id="close-sheet" type="button">收起施工队</button>
    </div>
    <div class="sheet-body">${crewBodyHtml(p, { mini: true })}</div>
    <div class="sheet-foot">
      <span>${p ? `第 ${p.round || 0} 轮 · 最后更新 ${rel(p.updatedAt)}` : '等待第一个脑洞'}</span>
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
  sheet.setAttribute('aria-label', '施工队状态台');
  sheet.innerHTML = sheetHtml();
  overlayRoot.append(scrim, sheet);
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
  // drag to close
  let startY = null;
  const body = sheet.querySelector('.sheet-body');
  body.addEventListener('touchstart', (e) => { startY = body.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) sheet.style.transform = `translateY(${Math.min(dy, 140)}px)`;
  }, { passive: true });
  body.addEventListener('touchend', (e) => {
    if (startY == null) return;
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) close();
    else sheet.style.transform = '';
    startY = null;
  });
  // focus trap
  setTimeout(() => document.getElementById('close-sheet')?.focus(), 60);
}

function closeCrewSheet() {
  document.body.classList.remove('sheet-open');
  if (!ui.sheet) return;
  const { scrim, sheet, opener } = ui.sheet;
  ui.sheet = null;
  sheet.classList.add('closing');
  scrim.style.opacity = '0';
  setTimeout(() => { scrim.remove(); sheet.remove(); }, 220);
  if (opener?.focus) opener.focus({ preventScroll: true });
}

function openDrawer() {
  document.body.classList.add('sheet-open');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', '施工队状态台');
  drawer.innerHTML = `<div class="crew" style="height:100%;border-left:0;display:flex">
      <div class="crew-head"><div class="row"><h2>施工队</h2><span class="live"><span class="dot ok"></span>LIVE</span></div>
      <div class="crew-sub">${deriveAgents(state.project).length} 名成员 · ${workingCount(deriveAgents(state.project))} 名作业中</div></div>
      <div class="crew-body">${crewBodyHtml(state.project, { mini: true })}</div>
      <div class="crew-foot"><span>${state.project ? `第 ${state.project.round} 轮 · ${rel(state.project.updatedAt)}` : '待命'}</span>
        <span class="side"><button class="btn" id="close-drawer" type="button">收起</button></span></div>
    </div>`;
  overlayRoot.append(scrim, drawer);
  requestAnimationFrame(() => drawer.classList.add('open'));
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
  setTimeout(() => { drawer.remove(); if (scrim) scrim.remove(); }, 230);
}

// command palette
function paletteItems() {
  const base = [
    { label: '脑洞 · 把你的脑洞交给施工队', hint: '#/idea', route: 'idea' },
    { label: '施工 · 实时进度与施工日志', hint: '#/build', route: 'build' },
    { label: '验收 · 裁决点与成品', hint: '#/review', route: 'review' },
    { label: '我的 · 外观、通道与历史', hint: '#/profile', route: 'profile' },
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
    const cur = document.documentElement.getAttribute('data-theme');
    setThemeUser(cur === 'dark' ? 'light' : 'dark');
    renderPage();
    toast('主题已切换');
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
    frame.srcdoc = p.artifact.html;
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

// boot
function boot() {
  loadTheme();
  loadState();
  try { state.tag = localStorage.getItem('fc-tag') || '工具'; } catch (e) {}
  const pathRoute = pathToRoute(location.pathname);
  const hashRoute = location.hash.replace('#/', '').replace('#', '');
  if (pathRoute) {
    state.route = pathRoute;
    history.replaceState({ route: pathRoute }, '', '#/' + pathRoute);
  } else if (['idea', 'build', 'review', 'profile'].includes(hashRoute)) {
    state.route = normalizeRoute(hashRoute);
  }
  renderAll();
  updateRouteFromLocation();
  hydrate();

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

  resumeIfNeeded();
}

function pathToRoute(pathname) {
  const clean = decodeURIComponent(pathname || '/').replace(/\/$/, '');
  if (clean === '' || clean === '/' || clean === '/index.html') return null;
  const map = { '/idea': 'idea', '/build': 'build', '/review': 'review', '/profile': 'profile', '/我的': 'profile', '/脑洞': 'idea', '/施工': 'build', '/验收': 'review' };
  return map[clean] || null;
}

function updateRouteFromLocation() {
  const hashRoute = location.hash.replace('#/', '').replace('#', '');
  if (['idea', 'build', 'review', 'profile'].includes(hashRoute) && hashRoute !== state.route) {
    state.route = hashRoute;
    renderAll();
  }
}

boot();
