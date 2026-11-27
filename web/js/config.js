// brand, copy, icons

export const BRAND = {
  name: 'ForgeCrew',
  sub: 'AGENT CREW',
  version: 'v1.1.0',
  slogan: '一句话就够。团队会自己拆解、试错、修正，只在关键分叉停下来问你。',
};

export const LOGO_SVG = `
<svg viewBox="0 0 32 32" aria-hidden="true">
  <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="#F6B84A"/>
  <path d="M10 8.5h13v4.2H15v3.2h6.4V20H15v6h-5z" fill="#1A1917"/>
</svg>`;

export const ICONS = {
  idea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.4 10.9c.5.4.9 1 .9 1.6V16h5v-.5c0-.6.4-1.2.9-1.6A6 6 0 0 0 12 3Z"/></svg>',
  newProject: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.8 18h6"/><path d="M9.8 21h4"/><path d="M11.8 3a5.8 5.8 0 0 0-3.3 10.5c.5.4.8 1 .8 1.6V16h5v-.9c0-.6.3-1.2.8-1.6A5.8 5.8 0 0 0 11.8 3Z"/><path d="M20.2 2.8v5.4M17.5 5.5h5.4" stroke-width="2"/></svg>',
  build: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 21V9l6-4 6 4v12"/><path d="M10 21v-6h4v6"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M19 5l-1.5 1.5M5 19l1.5-1.5M19 19l-1.5-1.5"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M20.5 14.5A9 9 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z"/></svg>',
  panelLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9 4.5v15"/><path d="m6 10-1.5 2 1.5 2" stroke-width="1.4"/></svg>',
  panelRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M15 4.5v15"/><path d="m18 10 1.5 2-1.5 2" stroke-width="1.4"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2.2"/><circle cx="15" cy="12" r="2.2"/><circle cx="10" cy="18" r="2.2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 12v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m5 12 4 4L19 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m7 7 10 10M17 7 7 17"/></svg>',
  tint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" fill-opacity=".18" stroke="none"/><path d="M12 6v6l4 2"/></svg>',
};

// 五个成员统一 1.5px 单线图标；汉字只用于名字。
export const ROLE_ICONS = {
  orch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/></svg>',
  product: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4.5"/></svg>',
  builder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 7-4 5 4 5M15 7l4 5-4 5M13 5l-2 14"/></svg>',
  reviewer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.2 2.5 2.5 4.9-5.2"/></svg>',
  pleaser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.8l2.1 5.1 5.4 2.1-5.4 2.1-2.1 5.1-2.1-5.1L4.5 11l5.4-2.1z"/><path d="M19 16.5v3M17.5 18h3"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>',
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M8 19v2h8v-2M8.5 10.5h.1M12 10.5h.1M15.5 10.5h.1"/></svg>',
};

export const ROLES = {
  ORCHESTRATOR: { key: 'orch', name: '统筹者', letter: '统', en: '协调', color: 'run' },
  PRODUCT: { key: 'product', name: '策划者', letter: '策', en: '规格', color: 'ok' },
  BUILDER: { key: 'builder', name: '编程者', letter: '编', en: '实现', color: 'run' },
  REVIEWER: { key: 'reviewer', name: '检查者', letter: '检', en: '复核', color: 'teal' },
  PLEASER: { key: 'pleaser', name: '打磨者', letter: '打', en: '收尾', color: 'idle' },
  USER: { key: 'user', name: '你', letter: '你', en: '你', color: 'idle' },
  SYSTEM: { key: 'system', name: '系统', letter: '系', en: '系统', color: 'idle' },
};

export const STYLES = [
  { key: 'editorial', label: '编辑风', note: '衬线标题 · 纸白 · 大留白' },
  { key: 'swiss', label: '瑞士网格', note: '无衬线 · 强对齐 · 单一强调' },
  { key: 'product', label: '产品风', note: '克制圆角 · 微阴影 · 动效轻' },
];

export const STYLE_TOKENS = {
  editorial: {
    bg: '#F7F4EE', surface: '#FFFDF8', ink: '#1A1916', sub: '#6B665C',
    accent: '#9A3412', line: '#DED8CC', radius: '8px', font: 'Georgia, "Songti SC", "Noto Serif SC", serif',
    shadow: 'none', heading: 'clamp(34px, 7vw, 56px)',
  },
  swiss: {
    bg: '#F2F2F0', surface: '#FFFFFF', ink: '#0B0B0B', sub: '#606060',
    accent: '#D7261E', line: '#D6D6D2', radius: '0px', font: '"Helvetica Neue", Arial, "PingFang SC", sans-serif',
    shadow: 'none', heading: 'clamp(30px, 6vw, 48px)',
  },
  product: {
    bg: '#0B0B0C', surface: '#141416', ink: '#F2F0EA', sub: '#9A978F',
    accent: '#E8B33B', line: '#2A2A2D', radius: '10px', font: '-apple-system, "PingFang SC", "Segoe UI", sans-serif',
    shadow: '0 8px 24px rgba(0,0,0,.28)', heading: 'clamp(28px, 6vw, 44px)',
  },
};

export const TAGS = [
  { key: '工具', label: '工具' },
  { key: '小游戏', label: '小游戏' },
  { key: '页面', label: '页面' },
  { key: '自动化', label: '自动化' },
  { key: '其他', label: '其他' },
];

export const RECIPES = [
  '做一个 60 秒内能玩一局的节奏小游戏',
  '把我每天要写的日报，变成一个自动整理的工具',
  '给独立咖啡店做一个能直接发朋友圈的单页',
];

export const COPY = {
  nav: { idea: '新建项目', build: '项目', review: '项目', profile: '我的' },
  navHint: { idea: '新建项目与最近记录', build: '当前项目', review: '需要你确认', profile: '设置与记录' },
  breadcrumb: '工作台',
  title: {
    idea: '说一句，五个人把它做出来',
    build: '', // 使用项目名
    review: '当前项目',
    profile: '我的',
  },
  lead: {
    idea: '一句话说做什么、给谁。团队拆解、试跑、修正，关键处只问一次。',
    build: '',
    review: '一个项目一页到底：正在做、要不要你、成品都在这里。',
    profile: '账号、外观、历史。项目跟账号走。',
  },
  placeholder: '想做什么？给谁用？',
  dispatch: '开始制作',
  dispatchShort: '开始制作',
  dispatchPending: '正在开始…',
  queueHint: '回车开始 · 可暂停',
  budgetNote: '结构优先，视觉克制。',
  recipesTitle: '没想好？试一句',
  recentTitle: '项目',
  recentCount: '共 {n} 个',
  allRecords: '全部记录',
  flow: '拆解 → 定标准 → 制作 → 检查 → 打磨。',
  emptyRecent: '还没有项目。写一句，五个人开始做。',
  emptyReview: '还没有等你确认的成品',
  emptyReviewHint: '需要你决定或交付时出现。',
  seeLog: '去看过程记录',
  emptyBuild: '还没有打开的项目',
  emptyBuildHint: '从左侧打开，或新建一句。',
  goIdea: '新建一个项目',
  backToIdea: '返回项目',
  backToBuild: '回到进度',
  goReview: '需要你确认',
  goBuild: '看看进度',
  viewNewTab: '打开',
  retry: '现在继续',
  pausedQuota: '额度不足，{s} 秒后续跑',
  pausedNoProvider: '服务不可用，请检查连接',
  pausedError: '连接故障，{s} 秒后续跑',
  channel: '公共模型链 · 服务端代理',
  channelShort: '默认服务',
  serial: '串行作业',
  live: '在线',
  checkpoint: '需要你决定',
  checked: '已拍板',
  decisionFoot: '选择会写回团队，只在关键分叉停一次',
  decisionPending: '还没拍板',
  reject: '让团队再试一版',
  accept: '就按所选方案继续',
  acceptDone: '已确认，成品已归档',
  delivered: '已交付',
  latest: '最近交付',
  delight: '做了什么',
  delightSub: '对照原话，含一条隐性偏好',
  delightMore: '展开 {n} 条',
  statusTable: '状态表',
  timeline: '时间线',
  autofollow: '自动跟随',
  statusTitle: '过程记录',
  deliverTitle: '制作进度',
  rawCount: '{n} 条',
};

export const API = {
  base() {
    try {
      const override = localStorage.getItem('fc-api-base');
      if (override) return override.replace(/\/$/, '');
    } catch (e) {}
    const host = location.hostname;
    if (host === 'forgecrew-studio.onrender.com') return 'https://naodong-shigongdui.onrender.com';
    if (host.endsWith('onrender.com')) return '';
    if (host === 'localhost' || host === '127.0.0.1' || host === '') return '';
    return 'https://naodong-shigongdui.onrender.com';
  },
  endpoint(path) {
    return this.base() + path;
  },
};
