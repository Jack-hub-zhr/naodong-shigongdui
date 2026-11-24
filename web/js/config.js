// brand, copy, icons

export const BRAND = {
  name: 'ForgeCrew',
  sub: 'AGENT CREW',
  version: 'v1.0.1',
  slogan: '一句话就够。施工队会自己拆解、试错、返工，只在关键分叉停下来问你。',
};

export const LOGO_SVG = `
<svg viewBox="0 0 32 32" aria-hidden="true">
  <path d="M16 5.5 24.5 10.8V21.2L16 26.5 7.5 21.2V10.8Z" fill="none" stroke="#3B6FE0" stroke-opacity=".5" stroke-width="1.2"/>
  <path d="M12.6 9.2h6.8v3.2h-6.8zM13.8 14.2h4.4v3.2h-4.4zM14.9 19.2h2.2v4h-2.2z" fill="#F0C24B"/>
</svg>`;

export const ICONS = {
  idea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.4 10.9c.5.4.9 1 .9 1.6V16h5v-.5c0-.6.4-1.2.9-1.6A6 6 0 0 0 12 3Z"/></svg>',
  build: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 21V9l6-4 6 4v12"/><path d="M10 21v-6h4v6"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 1.5 1.5M19 5l-1.5 1.5M6.5 17.5 1.5 1.5"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2.2"/><circle cx="15" cy="12" r="2.2"/><circle cx="10" cy="18" r="2.2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 12v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m5 12 4 4L19 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m7 7 10 10M17 7 7 17"/></svg>',
};

export const ROLES = {
  ORCHESTRATOR: { key: 'orch', name: '总监', letter: '总', en: 'ORCHESTRATOR', color: 'run' },
  PRODUCT: { key: 'product', name: '产品', letter: '产', en: 'PRODUCT', color: 'ok' },
  BUILDER: { key: 'builder', name: '开发', letter: '码', en: 'BUILDER · CODER', color: 'run' },
  REVIEWER: { key: 'reviewer', name: '审查', letter: '审', en: 'REVIEWER · QA', color: 'teal' },
  PLEASER: { key: 'pleaser', name: '取悦', letter: '悦', en: 'DELIGHTER', color: 'idle' },
  USER: { key: 'user', name: '你', letter: '你', en: 'YOU', color: 'idle' },
  SYSTEM: { key: 'system', name: '系统', letter: '系', en: 'SYSTEM', color: 'idle' },
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
  nav: { idea: '脑洞', build: '施工', review: '验收', profile: '我的' },
  navHint: { idea: '新想法', build: '实时进度', review: '等你拍板', profile: '偏好与记录' },
  breadcrumb: '工作台',
  title: {
    idea: '把你的脑洞，交给施工队',
    build: '', // 使用项目名
    review: '验收台',
    profile: '我的',
  },
  lead: {
    idea: '一句话就够。施工队会自己拆解、试错、返工，只在关键分叉停下来问你。',
    build: '',
    review: '只看关键分叉做选择，细节交给施工队。到达裁决点或交付时，这里会给出卡片。',
    profile: '管理外观与施工偏好。数据保存在本机，通道密钥不下发浏览器。',
  },
  placeholder: '说出一瞬的脑洞，施工队替你试错到验收',
  dispatch: '派工 · 进场',
  dispatchShort: '进场',
  dispatchPending: '进场中…',
  queueHint: '施工队一次只接一个脑洞，同行会排队',
  recipesTitle: '没想好？抄一个',
  recentTitle: '最近的脑洞',
  recentCount: '共 {n} 个',
  allRecords: '全部记录',
  flow: '总监拆解 → 产品定规格 → 开发施工 → 审查自检 → 取悦对照你的原话。',
  emptyRecent: '还没有脑洞。写一句交给施工队，或先抄上面的一条。',
  emptyReview: '还没有可裁决的成品',
  emptyReviewHint: '到达裁决点或交付后，卡片会出现在这里。',
  seeLog: '去看施工日志',
  emptyBuild: '还没有在施工的脑洞',
  emptyBuildHint: '去脑洞页写一句，施工队进场后会在这里实时汇报。',
  goIdea: '去写一句脑洞',
  backToIdea: '返回脑洞',
  backToBuild: '回到进度',
  goReview: '去验收台',
  goBuild: '看看进度',
  viewNewTab: '在新标签打开',
  retry: '现在继续',
  pausedQuota: '上游额度不足，施工队将在 {s} 秒后自动续跑',
  pausedNoProvider: '当前通道不可用，请到我的页检查通道',
  pausedError: '通道暂时故障，施工队将在 {s} 秒后自动续跑',
  channel: '免费通道 · 服务端代理',
  channelShort: '免费通道',
  serial: '串行作业',
  live: 'LIVE',
  checkpoint: '裁决点',
  checked: '已拍板',
  decisionFoot: '选择会写回施工队，只在关键分叉停一次',
  decisionPending: '还没拍板',
  reject: '让施工队再试一版',
  accept: '就按所选方案继续',
  acceptDone: '已验收，成品已归档',
  delivered: '已交付',
  latest: '最近交付',
  delight: '取悦声明',
  delightSub: '逐条对照你最初的那句话',
  delightMore: '展开 {n} 条',
  statusTable: '状态表',
  timeline: '时间线',
  autofollow: '自动跟随',
  statusTitle: '施工日志',
  deliverTitle: '施工进度',
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
