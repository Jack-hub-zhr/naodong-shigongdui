// app entry: routing, views, crew panel, sheet, command palette

import {
  BRAND, COPY, ICONS, LOGO_SVG, ROLES, TAGS, RECIPES, API, STYLES,
} from './config.js';
import {
  state, KEYS, STAGES, STATUS, loadTheme, loadState, saveNow, scheduleSave,
  setRoute, setThemeUser, newProject, touch, addLog, deriveAgents, workingCount,
  badgeOf, stageOf, projectPct, stageProgress, formatClock, formatRelative,
  formatMmSs, formatDateTime, totalElapsed, pauseReasonText, callsToday, summarize,
  normalizeRoute, setCloudSaver, applyAccountState, clearAccountData, accountPayload, removeProject,
} from './store.js';
import {
  complete, heartbeat, ApiError, authMe, registerAccount, loginAccount, logoutAccount,
  loadCloudState, saveCloudState,
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
  cleared: false,
  decisionIndex: 0,
  follow: false,
  advanced: false,
  logsOpen: false,
  authMode: 'login',
  authBusy: false,
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

setCloudSaver(saveCloudState);

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
  const recent = (state.projects || []).slice(0, 6);
  const activeProjectId = state.route === 'build' ? p?.id : null;
  railEl.innerHTML = `
    <div class="brand" data-nav="idea" role="button" tabindex="0">
      <div class="brand-mark">${LOGO_SVG}</div>
      <div class="brand-text"><b>${BRAND.name}</b><span>${BRAND.sub}</span></div>
    </div>
    <div class="rail-label">工作台</div>
    <div class="nav">
      <button class="nav-item ${state.route === 'idea' ? 'active' : ''}" data-nav="idea" type="button" aria-current="${state.route === 'idea' ? 'page' : 'false'}">
        ${ICONS.idea}<span>项目</span>${state.projects.length ? `<span class="count">${state.projects.length}</span>` : ''}
      </button>
      <button class="nav-item" data-new="1" type="button">
        <span class="plus">＋</span><span>新建</span>
      </button>
      <button class="nav-item ${state.route === 'profile' ? 'active' : ''}" data-nav="profile" type="button" aria-current="${state.route === 'profile' ? 'page' : 'false'}">
        ${ICONS.profile}<span>我的</span>
      </button>
    </div>
    <div class="rail-recent">
      <div class="head"><span>项目</span><b>${state.projects.length}</b></div>
      ${recent.length ? recent.map((item) => `
        <button class="item ${item.id === activeProjectId ? 'active' : ''}" data-open="${esc(item.id)}" type="button">
          <span class="bullet ${item.status === 'DELIVERED' ? 'ok' : item.status === 'AWAITING_USER' ? 'wait' : ['BUILDING', 'REVIEWING', 'REWORKING'].includes(item.status) ? 'run' : ''}"></span>
          <span>${esc(item.title)}</span>
        </button>`).join('') : '<div class="crew-empty" style="padding:6px 0;text-align:left">还没有项目</div>'}
    </div>
    <div class="rail-foot">
      <div class="row"><span class="dot ${agents.some((a) => ['working', 'thinking', 'reviewing'].includes(a.state)) ? 'run' : 'ok'}"></span>${COPY.channelShort}<span class="ver">${BRAND.version}</span></div>
      <div class="row"><span>${workingCount(agents)} 名成员在忙</span></div>
    </div>`;
}

function crumbsHtml() {
  const p = state.project;
  if ((state.route === 'build' || state.route === 'review') && p) {
    return `<button class="crumb-link" data-nav="idea" type="button">项目</button><span class="sep">/</span><span class="current">${esc(p.title)}</span>`;
  }
  return `<button class="crumb-link" data-nav="idea" type="button">项目</button><span class="sep">/</span><span class="current">${state.route === 'profile' ? '我的' : '新建'}</span>`;
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
      <button class="crew-trigger" id="open-crew" type="button" aria-label="打开团队状态台">
        ${ICONS.sliders}<span class="label">团队</span>
        <span class="badge">${workingCount(agents)}</span>
      </button>
      <button class="icon-btn" id="toggle-theme" type="button" aria-label="切换主题" title="切换暗色 / 亮色">
        ${ICONS.sun}
      </button>
      <button class="account-btn" data-account type="button" aria-label="${state.user ? '账号' : '登录或注册'}">
        <span class="avatar">${state.user ? esc((state.user.name || state.user.email || '你').slice(0, 1)) : ICONS.profile}</span>
        <span class="account-name">${state.user ? esc(state.user.name || state.user.email.split('@')[0]) : '登录'}</span>
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
  const saluting = a.key === ROLES.ORCHESTRATOR.key;
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
  return `<div class="crew-empty">团队待命中。<br>写一句想法，5 名成员会立刻进场。</div>`
    + agents.map((a) => agentCard(a, { mini })).join('');
}

function renderCrew() {
  const p = state.project;
  const agents = deriveAgents(p);
  const header = `
    <div class="crew-head">
      <div class="row"><h2>团队</h2><span class="live"><span class="dot ${p && ['BUILDING', 'REVIEWING', 'REWORKING'].includes(p.status) ? 'run' : 'ok'}"></span>${COPY.live}</span></div>
      <div class="crew-sub"><span>${agents.length} 名成员</span><span>·</span><span>${workingCount(agents)} 名作业中</span><span>·</span><span>${p?.providerName || COPY.channelShort}</span></div>
    </div>`;
  const scrollTop = crewEl.querySelector('.crew-body')?.scrollTop || 0;
  crewEl.innerHTML = `${header}
    <div class="crew-body">${crewBodyHtml(p)}</div>
    <div class="crew-foot">
      <span>${p ? `第 ${p.round || 0} 轮 · 最后更新 ${rel(p.updatedAt)}` : '等待第一个想法'}</span>
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

  const scrollTop = workspaceEl.scrollTop;
  let html = '';
  if (state.route === 'idea') html = ideaHtml();
  else if (state.route === 'build') html = buildHtml();
  else if (state.route === 'review') html = buildHtml();
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
  ensureAuthGate();
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
      <td class="del-cell"><button class="task-del-x" data-del="${esc(item.id)}" type="button" aria-label="删除任务" title="删除任务">${ICONS.close}</button></td>
      <td class="go">→</td>
    </tr>`).join('');
  const mobileRows = projects.map((item) => `
    <div class="recent-row" data-open="${esc(item.id)}" role="button" tabindex="0">
      <div class="txt"><b>${esc(item.title)}</b><span>${statusPillOf(item)}<span>第 ${item.round || 0} 轮</span><span>${rel(item.updatedAt)}</span></span></div>
      <button class="task-del-x" data-del="${esc(item.id)}" type="button" aria-label="删除任务" title="删除任务">${ICONS.close}</button>
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
        <div class="flow-avatars">${agents.map((a) => `<span>${a.letter}</span>`).join('')}</div>
        <div class="txt">统筹者拆解 · 策划者定标准 · 编程者制作 · 检查者检查 · 打磨者打磨。当前 <b>${COPY.channelShort}</b> ${online ? '在线' : '连接中'}。</div>
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
        <thead><tr><th>名称</th><th>风格</th><th>状态</th><th>更新</th><th></th><th></th></tr></thead>
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
  if (p.pausedReason === 'USER') {
    return `<div class="pause-banner">
      <span class="dot wait"></span>
      <span><b>任务已暂停</b>，进度和已生成的版本都保留着。</span>
      <span class="act"><button class="btn small primary" id="resume-task" type="button">继续任务</button></span>
    </div>`;
  }
  if (isQuotaPause(p)) {
    return `<div class="pause-banner">
      <span class="dot err"></span>
      <span><b>团队这轮预算用完了</b> ${secs != null ? `，${secs} 秒后自动重试，无需操作` : '，正在自动重试'}</span>
    </div>`;
  }
  return `<div class="pause-banner">
    <span class="dot err"></span>
    <span><b>${reason.long}</b> ${secs != null ? `，团队将在 ${secs} 秒后自动续跑` : '，请到我的页检查服务连接'}</span>
    <span class="act"><button class="btn small" id="resume-now" type="button">${COPY.retry}</button></span>
  </div>`;
}

function humanStatus(p) {
  const next = p.nextRetryAt ? formatClock(p.nextRetryAt) : '';
  if (p.status === 'PAUSED') {
    if (p.pausedReason === 'USER') return '任务已暂停，进度已保存，随时可以继续。';
    if (isQuotaPause(p)) return `团队这轮预算用完了，${next ? next + ' ' : ''}自动继续，不用你点。`;
    return `连接暂时断了，${next ? next + ' ' : ''}自动再试一次，不用你点。`;
  }
  if (p.status === 'AWAITING_USER') {
    if (p.awaitReason === 'escalate') return '同一个问题连续两轮没修好，需要你定个方向。';
    return `需要你选一个版本 · 两个都能用，差别在${p.decisions?.[0]?.topic || '节奏'}。`;
  }
  if (p.status === 'DELIVERED') {
    const pass = p.report?.passed;
    return `做好了，${pass ? '12 项检查全部通过' : '已按你的选择交付'} · 点开就能用。`;
  }
  if (p.status === 'REVIEWING') return `检查者在检查第 ${p.round} 轮：逐条看检查结果，不靠感觉 · 约 30 秒出结果。`;
  if (p.status === 'REWORKING') {
    const why = (p.failedIds || []).slice(0, 2).map((id) => {
      const f = (p.report?.findings || []).find((x) => x.id === id);
      return f ? `${id} ${f.check}` : id;
    }).join('、');
    return `第 ${p.round} 轮修正：编程者在改${why ? '「' + why + '」' : '上一轮没过的项'} · 约 40 秒后复检。`;
  }
  if (p.status === 'BUILDING') return `编程者在第 ${p.round || 1} 轮制作 · 先自己跑一遍，约 40–60 秒后交给检查者。`;
  return '统筹者在拆这句话：先定 3 轮上限，再交给策划者写完成标准 · 约 20 秒。';
}

function stageDetailHtml(p) {
  if (!p || p.status === 'DELIVERED' || p.status === 'AWAITING_USER') return '';
  const idx = stageOf(p.status);
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
    <button class="btn small task-delete" id="delete-task" type="button">删除任务</button>
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
    </div>` : ''}
  </section>`;
}

const CREW_ORDER = ['ORCHESTRATOR', 'PRODUCT', 'BUILDER', 'REVIEWER', 'PLEASER'];

function accountDisplayName() {
  return state.user?.name || '访客';
}

function ensureTeamChat(p) {
  const name = accountDisplayName();
  if (Array.isArray(p.chat) && p.chatName === name) return;
  const ts = Date.now();
  p.chatName = name;
  p.chat = CREW_ORDER.map((role, i) => ({
    id: 'c_' + (ts.toString(36)) + '_' + i,
    role,
    text: `向${name}敬礼！`,
    ts: ts + i * 180,
    salute: true,
  }));
  saveNow();
}

function chatMessageHtml(m) {
  const role = ROLES[m.role] || ROLES.SYSTEM;
  const me = m.role === 'USER';
  return `<div class="chat-msg ${me ? 'me' : ''}">
    <span class="chat-avatar">${esc(role.letter)}</span>
    <div class="chat-bubble"><b>${esc(role.name)}</b><p>${esc(m.text)}</p></div>
  </div>`;
}

function teamChatHtml(p) {
  ensureTeamChat(p);
  const list = (p.chat || []).slice(-30);
  return `<section class="section team-chat" id="team-chat">
    <div class="section-head">
      <h2>团队聊天</h2>
      <span class="meta">5 位成员在线 · 说一句，全队都会回应</span>
    </div>
    <div class="chat-log" id="team-chat-log">${list.map(chatMessageHtml).join('')}</div>
    <form class="chat-form" id="team-chat-form">
      <input id="team-chat-input" name="message" type="text" maxlength="120" placeholder="对团队说点什么…" autocomplete="off" aria-label="团队聊天输入">
      <button class="btn primary" type="submit">发送</button>
    </form>
  </section>`;
}

function sendTeamChat(text) {
  const p = state.project;
  const clean = String(text || '').trim().slice(0, 120);
  if (!p || !clean) return;
  ensureTeamChat(p);
  const name = accountDisplayName();
  const now = Date.now();
  p.chat = p.chat || [];
  p.chat.push({ id: 'c_' + now.toString(36) + '_u', role: 'USER', text: clean, ts: now });
  CREW_ORDER.forEach((role, i) => {
    p.chat.push({
      id: 'c_' + now.toString(36) + '_' + i,
      role,
      text: `向${name}敬礼！`,
      ts: now + 120 + i * 120,
      salute: true,
    });
  });
  p.chat = p.chat.slice(-60);
  saveNow();
  renderPage();
  hydrate();
  requestAnimationFrame(() => {
    const input = document.getElementById('team-chat-input');
    if (input) input.focus({ preventScroll: true });
  });
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
  <div class="project-head">
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
      <span>第 <b>${p.round || 0} 轮</b> / 最多 ${p.maxRound || 3} 轮</span>
      <span>更新 <b data-rel="${p.updatedAt}">${rel(p.updatedAt)}</b></span>
      ${p.artifact ? `<span>成品 <b>${(p.artifact.html.length / 1024).toFixed(1)} KB</b></span>` : ''}
    </div>
    ${deliverActions(p)}
    ${taskControls(p)}
  </div>
  ${pauseBanner(p)}
  ${stepperHtml(p)}
  ${handoffsHtml(p)}
  ${stageDetailHtml(p)}
  ${awaiting ? `<section class="section act-section">
    <div class="act-label">需要你确认</div>
    <div class="act-note">这一步只问你一次；选完就继续，不用再回来点。</div>
    ${p.awaitReason === 'escalate' ? escalateCard(p) : decisionCard(p)}
    ${p.artifact ? previewCard(p, { compact: true }) : ''}
  </section>` : ''}
  ${p.status === 'DELIVERED' ? `<section class="section act-section">
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
      <span class="no">第 ${d.index || index} 个选择 / ${total}</span>
      <h3>${d.topic ? `${esc(d.topic)}：` : ''}${esc(d.title || '待定')}</h3>
      <span class="act">${d.chosen ? pill('已拍板 · ' + d.chosen, 'ok') : pill('等你拍板', 'wait', 'data-breath="1"')}</span>
    </div>
    <div class="decision-context">
      <div class="quote"><span class="q">“</span>${esc(p.prompt)}<span class="q close">”</span></div>
    </div>
    <div class="decision-sub">${esc(tagLabel(p.tag))} · 第 ${p.round} 轮 · 团队建议在下面两个方案里二选一${d.context ? ` · ${esc(d.context)}` : ''}</div>
    <div class="options" role="group" aria-label="方案选项">
      ${opt(d.optionA, 0)}${opt(d.optionB, 1)}
    </div>
    <div class="decision-foot">
      <span>${allChosen ? '两个选择都已拍板，可以继续制作' : COPY.decisionFoot}</span>
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
      <span class="dot run"></span><span>团队正在作业，第 ${p.round} 轮。需要你决定会在产物通过自检后出现在这里。</span>
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
            : '当前是访客模式，数据只保存在这台浏览器里。'}
        </div>
      </div>

      <div class="panel">
        <h3>外观</h3>
        <div class="desc">跟随系统，或固定使用深色、亮色。</div>
        <div class="seg-full" role="group" aria-label="外观">
          ${[['system', '跟随系统'], ['dark', '深色'], ['light', '亮色']].map(([key, label]) => `<button type="button" data-theme-set="${key}" aria-selected="${state.themeUser === key}">${label}</button>`).join('')}
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
        <div class="desc">服务端统一调度，浏览器不持有密钥。</div>
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
        <div class="about-row"><span>设计语言</span><span class="side"><span class="chip-mini">视觉 v2</span> 双主题 · 石墨 / 纸白 · 单一暖色强调</span></div>
        <div class="about-row"><span>生成服务</span><span class="side">${esc(p?.providerName || COPY.channelShort)} · ${API.base() ? '跨域代理' : '同源代理'}</span></div>
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
    renderPage();
    toast('外观已切换为' + ({ system: '跟随系统', dark: '深色', light: '亮色' }[themeSet.dataset.themeSet] || ''));
    return;
  }

  if (ev.target.closest('#toggle-theme')) {
    const order = { system: 'dark', dark: 'light', light: 'system' };
    setThemeUser(order[state.themeUser] || 'system');
    renderPage();
    toast('外观：' + ({ system: '跟随系统', dark: '深色', light: '亮色' }[state.themeUser] || ''));
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
        <div class="sub">${agents.length} 名成员 · ${workingCount(agents)} 名作业中 · ${p?.providerName || COPY.channelShort}</div>
      </div>
      <button class="sheet-close" id="close-sheet" type="button">收起团队</button>
    </div>
    <div class="sheet-body">${crewBodyHtml(p, { mini: true })}</div>
    <div class="sheet-foot">
      <span>${p ? `第 ${p.round || 0} 轮 · 最后更新 ${rel(p.updatedAt)}` : '等待第一个想法'}</span>
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
  drawer.setAttribute('aria-label', '团队状态台');
  drawer.innerHTML = `<div class="crew" style="height:100%;border-left:0;display:flex">
      <div class="crew-head"><div class="row"><h2>团队</h2><span class="live"><span class="dot ok"></span>LIVE</span></div>
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
    const order = { system: 'dark', dark: 'light', light: 'system' };
    setThemeUser(order[state.themeUser] || 'system');
    renderPage();
    toast('外观：' + ({ system: '跟随系统', dark: '深色', light: '亮色' }[state.themeUser] || ''));
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
  const forced = !state.user;
  return `
  <div class="scrim auth-scrim" ${forced ? '' : 'data-auth-close'}></div>
  <section class="auth-modal ${forced ? 'auth-forced' : ''}" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    ${forced ? '' : `<button class="icon-btn auth-close" data-auth-close type="button" aria-label="关闭">${ICONS.close}</button>`}
    <div class="eyebrow">ACCOUNT</div>
    <h2 id="auth-title">${register ? '创建你的账号' : '登录 ForgeCrew'}</h2>
    <p class="auth-lead">${register
      ? '项目会跟着账号保存，换设备、换浏览器都能接着做。'
      : '登录或注册后开始使用。项目会跟着账号云端保存，换设备也能接着做。'}</p>
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

function closeAuth(force = false) {
  if (!force && !state.user) return;
  overlayRoot.querySelector('.auth-root')?.remove();
}

function ensureAuthGate() {
  if (state.user) {
    overlayRoot.querySelector('.auth-root')?.remove();
    return;
  }
  if (overlayRoot.querySelector('.auth-root')) return;
  const wrap = document.createElement('div');
  wrap.className = 'auth-root auth-gate';
  wrap.innerHTML = authModalHtml();
  overlayRoot.appendChild(wrap);
  requestAnimationFrame(() => {
    wrap.querySelector('input[name="email"]')?.focus({ preventScroll: true });
  });
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
  const map = { '/idea': 'idea', '/build': 'build', '/review': 'review', '/profile': 'profile', '/我的': 'profile', '/想法': 'idea', '/制作': 'build', '/验收': 'review' };
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
