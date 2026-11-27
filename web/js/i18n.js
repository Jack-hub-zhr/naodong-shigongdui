// UI language: zh / en. Translation is applied after render, so async task state is untouched.

let current = 'zh';

export const EN = {
  // chrome
  '工作台': 'Workspace',
  '新建项目': 'New project',
  '我的': 'Profile',
  '项目': 'Projects',
  '当前项目': 'Current project',
  '导航': 'Nav',
  '搜索': 'Search',
  '团队': 'Team',
  '项目历史': 'Projects',
  '服务在线': 'Online',
  '服务连接中': 'Connecting',
  '0 名成员在忙': 'No one working',
  '等待第一个想法': 'Waiting for an idea',
  '等待新项目': 'Waiting',
  '当前任务': 'Current task',
  '现在 · 交付': 'Now · Ship',
  '现在 · 检查': 'Now · Check',
  '现在 · 制作': 'Now · Build',
  '现在 · 理解': 'Now · Plan',
  '阶段完成': 'stages done',
  '已交付，等你打开或再做一版': 'Delivered. Open or request a new version.',
  '待命中': 'Standby',
  '团队待命中。': 'Team on standby.',
  '写一句想法，5 名成员会立刻进场。': 'One line starts the crew.',
  '5 名成员 · 0 名作业中 · 待命中': '5 members · idle',
  '5 名成员 · 0 名作业中 · 服务在线': '5 members · online',
  '还没有项目。写一句想法，团队会把它做出来。': 'No projects yet.',

  // home
  '说一句，': 'Say it.',
  '五个人把它做出来。': 'Five build it.',
  '一句话说做什么、给谁。团队拆解、试跑、修正，关键处只问一次。': 'One line: what, and for whom. The crew plans, builds, checks—asks once.',
  '预计 2–5 分钟': '2–5 min',
  '最多 3 轮': '3 rounds max',
  '只会问你 1 次': '1 decision',
  '结构优先，视觉克制。': 'Structure first. Visuals restrained.',
  '想做什么？给谁用？': 'What, and for whom?',
  '高级选项': 'Options',
  '产品风 · 工具': 'Product · Tool',
  '回车开始 · 可暂停': 'Enter to start · pause anytime',
  '开始制作': 'Start',
  '拆解 → 定标准 → 制作 → 检查 → 打磨。': 'Plan · spec · build · check · polish.',
  '没想好？试一句': 'Try one',
  '统筹者拆解 · 策划者定标准 · 编程者制作 · 检查者检查 · 打磨者打磨。服务在线。': 'Plan · spec · build · check · polish. Online.',
  '统筹者拆解 · 策划者定标准 · 编程者制作 · 检查者检查 · 打磨者打磨。服务连接中。': 'Plan · spec · build · check · polish. Connecting.',
  '交给你：成品 + 做了什么': 'To you: result + notes',
  '交给编程者：4 条验收标准 + 1 个关键分叉': 'To Builder: 4 criteria + 1 decision',
  '这五个人怎么接': 'How it flows',
  '拆成 4 个场景，定 3 轮上限': '4 scenes, 3 rounds',
  '写下什么算完成': 'Defines done',
  '先跑一遍再交出去': 'Tests before handoff',
  '只认检查结果，不靠感觉': 'Checks, not vibes',
  '收字、收色、收动效': 'Words, color, motion',
  '做一个 60 秒内能玩一局的节奏小游戏': 'A 60-second rhythm game',
  '把我每天要写的日报，变成一个自动整理的工具': 'Turn daily notes into a report',
  '给独立咖啡店做一个能直接发朋友圈的单页': 'A shareable cafe page',
  '编辑风': 'Editorial',
  '瑞士网格': 'Swiss grid',
  '产品风': 'Product',
  '衬线标题 · 纸白 · 大留白': 'Serif · paper · space',
  '无衬线 · 强对齐 · 单一强调': 'Sans · strict grid',
  '克制圆角 · 微阴影 · 动效轻': 'Soft radius · light motion',
  '工具': 'Tool',
  '小游戏': 'Game',
  '页面': 'Page',
  '自动化': 'Automation',
  '其他': 'Other',

  // status / roles / stages
  '准备中': 'Queued',
  '制作中': 'Building',
  '检查中': 'Checking',
  '需要你确认': 'Needs you',
  '修正中': 'Fixing',
  '已交付': 'Delivered',
  '稍后继续': 'Paused',
  '统筹者': 'Lead',
  '策划者': 'Planner',
  '编程者': 'Builder',
  '检查者': 'Checker',
  '打磨者': 'Polisher',
  '系统': 'System',
  '你': 'You',
  '同步': 'Sync',
  '更多记录': 'More',
  '最后更新': 'Updated',
  '理解': 'Understand',
  '制作': 'Build',
  '检查': 'Check',
  '交付': 'Ship',
  '在线': 'LIVE',
  '现在': 'Now',
  '还没有登录': 'Not signed in',
  '登录后项目跟着账号走。': 'Sign in to sync projects.',
  '未登录 · 只存在这台浏览器。': 'Not signed in · local only.',
  '心跳连接中': 'Checking connection',
  '全部': 'All',
  '进行中': 'Active',
  '展示': 'Showcase',
  '游戏': 'Game',
  '视觉 v3': 'Visual v3',
  '亮暗双态 · 石墨 / 纸白 · iOS 26 手感': 'Light/dark · graphite / paper · iOS 26 feel',
  '自动选择可用连接 · 同源代理': 'Picks a live route · same-origin proxy',
  '右上角 ? 也可以': 'or ? top right',
  '做好了，已按你的选择交付 · 点开就能用。': 'Done. Delivered as chosen · open it.',
  '做好了，12 项检查全部通过 · 点开就能用。': 'Done. All 12 checks passed · open it.',
  'Round 2 / 最多 3 轮': 'Round 2 / max 3 rounds',
  '最多 3 轮': 'max 3 rounds',
  '协调': 'Coord.',
  '规格': 'Spec',
  '实现': 'Build',
  '复核': 'Check',
  '收尾': 'Polish',
  '已完成': 'Done',
  '作业中': 'Working',
  '等待你确认': 'Needs you',

  // project
  '← 项目': '← Projects',
  '当前项目 · 产品风': 'Current project · Product',
  '暂停任务': 'Pause',
  '删除任务': 'Delete',
  '打开预览 ↗': 'Preview ↗',
  '打开成品': 'Open',
  '导出': 'Export',
  '分享': 'Share',
  '再做一版': 'Redo',
  '撤回确认': 'Undo',
  '现在轮到你': 'Your turn',
  '团队已停在这里，选完就继续': 'Pick one to continue',
  '需要你决定': 'Decision',
  '已拍板': 'Chosen',
  '还没拍板': 'Not chosen',
  '选择会写回团队，只在关键分叉停一次': 'Choices go to the team',
  '就按所选方案继续': 'Continue',
  '让团队再试一版': 'Try again',
  '已确认，成品已归档': 'Confirmed and archived',
  '团队交接': 'Handoffs',
  '谁把什么交给谁 · 最新在上 · 最近 6 次': 'Who gave what to whom · latest first',
  '过程记录': 'Log',
  '按轮分组 · 默认只看结论，需要时展开': 'By round · key results first',
  '状态表': 'Status',
  '时间线': 'Timeline',
  '团队聊天': 'Team chat',
  '说一句，团队会真的回复': 'Messages reach the team',
  '对团队说点什么…': 'Message the team…',
  '发送': 'Send',
  '按新要求再做一版': 'Apply new request',
  '打开': 'Open',
  '当前版本': 'Version',
  '更新': 'Updated',
  '本轮': 'Round',
  '角色': 'Roles',
  '耗时': 'Time',
  '操作记录': 'Activity',
  '第 1 轮': 'Round 1',

  // profile
  '04 / 偏好与记录': '04 / PREFERENCES',
  '账号、外观、历史。项目跟账号走。': 'Account, theme, history. Projects follow you.',
  '账号': 'Account',
  '退出': 'Sign out',
  '登录 / 注册': 'Sign in / Join',
  '项目自动同步': 'Auto-sync',
  '等待首次同步': 'Waiting for first sync',
  '正在同步…': 'Syncing…',
  '外观': 'Theme',
  '跟随系统，或固定亮/暗。': 'System, or fixed light/dark.',
  '跟随系统': 'System',
  '亮色': 'Light',
  '深色': 'Dark',
  '团队敬礼': 'Team salute',
  '开工与交付时敬礼': 'Salute on start and delivery',
  '确认通知': 'Alerts',
  '需要你时提醒': 'Alert when needed',
  '制作服务连接': 'Service',
  '自动选通道，服务端转发。': 'Auto route · server proxy.',
  '公共模型链 · 服务端代理': 'Public model chain',
  '在线': 'Online',
  '离线': 'Offline',
  '串行作业': 'One at a time',
  '一次一个想法，每步做到位': 'One idea at a time',
  '今日调用': 'Calls today',
  '同一时间只接一个想法': 'One at a time',
  '每 15 分钟保活，冷启动 < 30 秒。': 'Keepalive 15 min · cold start <30s.',
  '历史已移到左栏；手机看这里。': 'Left rail on desktop; here on mobile.',
  '清空想法、日志与成品，不能恢复。': 'Clears all. Cannot undo.',
  '清空数据': 'Clear data',
  '使用说明': 'Guide',
  '打开两分钟说明': 'Open 2-min guide',
  '设计语言': 'Design',
  '生成服务': 'Service',
  '视觉 v3 亮暗双态 · 石墨 / 纸白 · iOS 26 手感': 'v3 · light/dark · iOS feel',
  '自动选择可用连接': 'Auto route',
  '跨域代理': 'Proxy',
  '同源代理': 'Same-origin',

  // toasts / misc
  '任务已删除': 'Task deleted',
  '已复制分享链接': 'Share link copied',
  '已导出 HTML': 'HTML exported',
  '已暂停': 'Paused',
  '已继续': 'Resumed',
  '数据已清空': 'Data cleared',
  '已回到项目': 'Project opened',
  '外观': 'Theme',
};

const PATTERNS = [
  [/^第 (\d+) 轮 \/ 最多 (\d+) 轮$/, 'Round $1 / max $2'],
  [/^第 (\d+) 轮 \/ 最多 (\d+) 轮 · 更新/, 'Round $1 / max $2'],
  [/^第 (\d+) 轮$/i, 'Round $1'],
  [/^最多 (\d+) 轮$/, 'Max $1 rounds'],
  [/^Round (\d+) \/ 最多 (\d+) 轮$/, 'Round $1 / max $2 rounds'],
  [/^今日调用 (\d+) 次 · 同一时间只接一个想法$/, '$1 calls today · one idea at a time'],
  [/^今日 (\d+) 次 · 一次一个$/, '$1 calls today · one at a time'],
  [/^(\d+) 个$/, '$1'],
  [/^(\d+) 条$/, '$1'],
  [/^(\d+) 名成员$/, '$1 members'],
  [/^(\d+) 名作业中$/, '$1 working'],
  [/^(\d+) 名成员在忙$/, '$1 working'],
  [/^(\d+) 名成员$/, '$1 members'],
  [/^更新 (.+)$/, 'Updated $1'],
  [/^当前版本 (.+)$/, 'Version $1'],
  [/^(\d+) 条记录$/, '$1 entries'],
  [/^最近 (\d+) 次$/, 'Last $1'],
  [/^(\d+) \/ (\d+) 阶段完成$/, '$1 / $2 stages done'],
  [/^交付给 (.+)$/, 'To $1'],
  [/^(.+) 已交来$/, 'From $1'],
  [/^交给检查者：第 (\d+) 轮 HTML$/, 'To Checker: Round $1 HTML'],
  [/^交给统筹者：(\d+) 项未通过$/, 'To Lead: $1 failed'],
  [/^交给统筹者：12 项全通过$/, 'To Lead: all 12 passed'],
  [/^最后更新 (.+)$/, 'Updated $1'],
  [/^(.+) · 最后更新 (.+)$/, '$1 · Updated $2'],
  [/^(.+) · 稍后继续$/, '$1 · Paused'],
];

function core(text) {
  if (text == null) return text;
  if (current !== 'en') return text;
  if (EN[text] != null) return EN[text];
  for (const [re, to] of PATTERNS) {
    if (re.test(text)) return text.replace(re, to);
  }
  const rounds = text.replace(/^\/ 最多 (\d+) 轮$/, '/ max $1 rounds');
  if (rounds !== text) return rounds;
  const tag = text.replace(/^(工具|展示|游戏|文档|网页) · /, (m, k) => ({ 工具: 'Tool', 展示: 'Showcase', 游戏: 'Game', 文档: 'Doc', 网页: 'Page' }[k] + ' · '));
  if (tag !== text) return tag;
  return text;
}

let observer = null;
let observedRoot = null;

export function startI18n(root = document.body) {
  observedRoot = root;
  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver((mutations) => {
      if (current !== 'en') return;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) translateDOM(node);
        }
      }
    });
  }
  syncObserver();
  if (typeof window !== 'undefined') window.__fcI18n = () => ({ lang: current, observer: !!observer, root: !!observedRoot });
}

function syncObserver() {
  if (!observer || !observedRoot) return;
  observer.disconnect();
  if (current === 'en') observer.observe(observedRoot, { childList: true, subtree: true });
}

export function setLang(lang) {
  current = lang === 'en' ? 'en' : 'zh';
  if (typeof document !== 'undefined') document.documentElement.lang = current === 'en' ? 'en' : 'zh-CN';
  syncObserver();
}

export function getLang() {
  return current;
}

export function tr(zh, en) {
  return current === 'en' ? en : zh;
}

export function translateText(text) {
  const raw = String(text == null ? '' : text);
  const lead = raw.match(/^\s*/)?.[0] || '';
  const trail = raw.match(/\s*$/)?.[0] || '';
  const body = raw.trim();
  if (!body) return raw;
  const out = core(body);
  return out === body ? raw : lead + out + trail;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
const ATTRS = ['placeholder', 'aria-label', 'title'];

export function translateDOM(root = document.body) {
  if (!root || current !== 'en') return;
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || SKIP.has(parent.tagName) || parent.closest('[data-no-i18n]')) continue;
    node.nodeValue = translateText(node.nodeValue);
  }
  const els = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const el of els) {
    if (['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(el.tagName) || el.closest('[data-no-i18n]')) continue;
    for (const attr of ATTRS) {
      const v = el.getAttribute?.(attr);
      if (v) el.setAttribute(attr, translateText(v).trim());
    }
  }
}
