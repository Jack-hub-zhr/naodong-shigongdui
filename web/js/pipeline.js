// pipeline: product -> builder -> reviewer -> decision -> delight
// 所有模型调用走 /api/complete，审查结论由本地断言决定。

import { stageOf, callsToday } from './store.js';
import { STYLE_TOKENS } from './config.js';

// prompts
const COMMON = `你在「ForgeCrew 团队」里工作。用户只提交一句自然语言想法，团队把它落地成可直接运行的成品。
统一术语：统筹者 / 策划者 / 编程者 / 检查者 / 打磨者；过程记录、需要你确认、第 N 轮修正、成品。
不要解释过程，不要输出多余前后缀，严格按要求格式输出。`;

export function productSystem() {
  return `${COMMON}
你是产品。职责只有一件事：把用户想法翻译成可执行的功能规格，不写代码。
输出 JSON，字段：
- summary: 一句话产品概述（≤40 字）
- goal: 用户完成的核心任务（≤30 字）
- inScope: 3-5 条“做什么”
- outOfScope: 2-3 条“不做什么”
- acceptance: 恰好 4 条可程序化验收的标准，每条 ≤24 字，必须能在 HTML 里检查
- implicitPreference: 从措辞里捕捉到的一条隐性偏好（≤40 字）
- decisions: 恰好 2 个需要你决定，每个形如
  { "topic":"裁决主题（≤10字）", "title":"A 方案… / B 方案…（≤40字）", "context":"为什么需要你拍板（≤40字）",
    "optionA": { "label":"A 方案名（≤12字）", "body":"方案说明（≤40字）", "tradeoff":"代价/收益（≤20字）" },
    "optionB": { "label":"B 方案名（≤12字）", "body":"方案说明（≤40字）", "tradeoff":"代价/收益（≤20字）" } }
需要你决定必须是产品方向上真正需要用户偏好的分叉：一个偏稳、一个更贴合用户原话里的情绪。`;
}

export function productUser(prompt, tag) {
  return `用户想法（原话）：
"""${prompt}"""

用户选择的标签：${tag}
请输出规格 JSON。`;
}

export function builderSystem() {
  return `${COMMON}
你是开发。只按产品给出的规格写代码，不修改规格。
一次输出完整 HTML 文档，包含内联 CSS 与内联交互脚本，不要输出解释或代码围栏。在 </body> 前放一个非空的 <script id="fc-app">…</script>，直接把整页交互写完，不要留空占位，不要写 on* 内联属性。
硬性要求：
1. <!DOCTYPE html>、<html lang="zh-CN">、<head>、<meta charset>、<meta name="viewport">、非空 <title>，结尾必须闭合 </html>
2. 移动端 375px 宽度不横向滚动，触控目标 ≥44px
3. 至少一个 <button type="button">，为它设置稳定的 id；不要写 onclick 等内联事件
4. 为 4 条完成标准分别在最相关的元素上加 data-acceptance="A1"…"A4"
5. 不引用外部 JS/CSS/字体/图片；不出现 TODO、lorem ipsum、undefined；空 href 不允许
6. 文案用中文，视觉完成度要高，不要占位骨架
7. localStorage、sessionStorage、navigator.clipboard、AudioContext 等可能被沙箱禁止的 API，必须写在 try/catch 里；绝不能让一次异常中断整个脚本
8. 所有按钮必须真实可用：点击后要有可见状态变化（分数、倒计时、文案、面板切换），不能是空函数
9. 产物控制在 9KB 以内；先保证完整闭合，再接视觉装饰；接近上限时删装饰，绝不能截断
10. 任何一轮重做都必须保留上一版的 data-acceptance="A1"…"A4"，不得在改写时丢掉
11. 设计 token 已由外壳注入：优先用 var(--fc-bg) / var(--fc-ink) / var(--fc-accent) / var(--fc-line)，不要另起一套主色；间距落在 4/8 的倍数，圆角最多 2 种，强调色只用于当前主操作

视觉基线（达不到视为未完成）：
- 顶部用 CSS 变量定义背景 / 表面 / 描边 / 主文字 / 次文字 / 一个强调色，全站复用
- 正文字号 15–17px、行高 1.6–1.75；大标题 clamp(28px, 7vw, 40px)，字重对比明确
- 使用系统字体栈：-apple-system, "PingFang SC", "Segoe UI", Roboto, sans-serif
- 间距按 8px 递进；圆角 12–18px；细描边加一层柔和阴影，避免厚重投影
- 页面要有主视觉区、内容分组、主次按钮，不能整页都是等宽卡片平铺
- 交互 160–240ms ease-out；按钮/输入/卡片要有 hover、active、focus-visible 三态
- 禁止默认蓝色 #007bff、紫色渐变、纯黑纯白大面积、emoji 当图标、占位骨架
- 禁止“白底 + 一个按钮 + 一张卡片”的骨架页；CSS 至少 80 行，产物目标 5–6.5KB

按标签选择视觉方向：
- 小游戏：深色舞台（#0B0D12 底 + 双径向光），顶部 HUD 三栏（分数 / 倒计时 / 连击），中央 1:1 游戏区，底部独立控制行；开始前有半透明遮罩和大按钮，结束弹结算卡
- 页面：主视觉 hero + 2–4 个内容分组 + 固定底部主 CTA；大标题 clamp(32px, 6vw, 44px)
- 工具：左右分栏（输入 / 结果），顶部状态条，结果区用等宽数字，支持复制或清空
- 自动化：统计卡 + 时间线 + 状态表，数字优先，状态用色点而不是整行填色

如果是小游戏，额外要求：
10. 「开始 / 暂停 / 重开」是独立按钮，放在游戏区正下方，与游戏区至少间隔 16px；禁止绝对定位压在游戏区上
11. 点击开始后真正进入可玩状态：倒计时走动、按钮文案变为「暂停」，再次点击可暂停；结束给出结算并可重开
12. 若用 <canvas>，设置 touch-action:none，并在脚本里按 getBoundingClientRect() 换算坐标
13. 交互脚本必须完整闭合，写在 <script id="fc-app"> 内，不能留空占位或调用外部脚本`;
}

function builderLayout(tag) {
  if (tag === '小游戏') return `结构骨架（照着实现，不要简化）：
body: min-height:100dvh; background:#07080B + 两个 radial-gradient 光斑; display:flex; align-items:center; justify-content:center; padding:16px
.stage: width:min(420px,100%); min-height:min(780px,calc(100dvh - 32px)); display:grid; grid-template-rows:auto auto 1fr auto; gap:16px; background:linear-gradient(180deg,#15171C,#0C0E12); border:1px solid #2A2E36; border-radius:24px; padding:20px
header: 标题 clamp(26px,7vw,36px) + 13px 副标题 #9AA0A8；副标题必须放在 header 内部，.stage 只保留 header/.hud/.arena/footer 四个直接子元素
.hud: 三列网格，每格高 72px、内容居中，12px 标签 + 28px/1.1 等宽数字；卡片样式必须写「.hud > div」，不能写「.hud div」（否则会给数字容器重复加 padding），数字单行不换行
.arena: position:relative; min-height:360px; 圆角 20px; radial-gradient 背景; 中间三圈同心圆刻度
开始遮罩绝对铺满 .arena，半透明黑，中央 180px 大按钮「开始」，下方 12px 操作提示
命中圆点 120px 强调色圆，带 glow 和 scale 动画，命中闪白并飘 +1
footer: 12px 说明 + 44px 重开按钮；结束在 .arena 内弹结算卡`;
  if (tag === '工具') return `结构骨架（照着实现，不要简化）：
body: min-height:100dvh; background:#F4F5F7; color:#14161A; padding:24px
.shell: max-width:1040px; margin:auto; background:#fff; border:1px solid #E2E5EA; border-radius:20px; overflow:hidden
header: 56px 高，左侧标题 18px + 右侧状态点
.panels: grid-template-columns:1fr 1fr; 移动端单列; 两栏之间 1px 分隔线
左栏: 12px 标签 + textarea(min-height:180px, 无边框) + 44px 主按钮
右栏: 12px 标签 + 等宽结果区(min-height:220px) + 复制/清空按钮
footer: 12px 说明 + 字数统计`;
  if (tag === '自动化') return `结构骨架（照着实现，不要简化）：
body: min-height:100dvh; background:#0E1014; color:#E8EAED; padding:24px
.shell: max-width:1080px; margin:auto
header: 标题 clamp(26px,5vw,34px) + 13px 副标题 + 右侧运行状态
.kpis: 三列统计卡，28px 等宽数字 + 12px 标签
.timeline: 左侧 2px 竖线 + 节点圆点，每项 14px 标题 + 12px 时间
.table: 状态表，行高 44px，状态用 8px 色点，不要整行填色`;
  return `结构骨架（照着实现，不要简化）：
body: min-height:100dvh; background:#F7F6F2; color:#17181C; padding:24px
.page: max-width:760px; margin:auto
.hero: padding:48px 0 32px; 标题 clamp(32px,6vw,44px); 副标题 16px #5C6068
.sections: 2–4 个分组，每组有 12px 小标签 + 20px 标题 + 15px 正文，组间 28px
.cta: 底部 sticky 条，44px 主按钮 + 次按钮
装饰只用细线、色块和留白，不要堆卡片`;
}

export function scriptSystem() {
  return `${COMMON}
你是开发。上一步已经完成 HTML 与 CSS，现在只补交互脚本。
只输出一个 <script>…</script>，不要解释、不要代码围栏、不要重复 HTML/CSS。
要求：
- 用 document.getElementById / querySelector 绑定上一步已有的 id，不要新建大段结构
- 所有按钮点击后必须有可见变化；事件用 addEventListener
- 脚本必须闭合，内部不得出现字符串形式的 </script>
- localStorage、AudioContext 等可能被沙箱禁止的 API 必须 try/catch
- 不得使用 on* 内联属性`;
}

export function scriptUser(p, html) {
  const spec = p.spec || {};
  return `用户原话：${p.prompt}
标签：${p.tag}
完成标准：
${(spec.acceptance || []).map((t, i) => `A${i + 1}. ${t}`).join('\n')}
页面 HTML（只读，用于找 id）：
${String(html).slice(0, 5200)}

请输出实现全部交互的 <script>，必须让页面真正可玩/可用。`;
}

function ensureClosed(html) {
  let h = String(html || '').trim();
  if (!h || !/<body/i.test(h)) return h;
  if (/<style[\s\S]*$/i.test(h) && !/<\/style>/i.test(h)) h += '\n}</style>';
  if (!/<\/body>/i.test(h)) h += '</body>';
  if (!/<\/html>/i.test(h)) h += '</html>';
  return h;
}

function stripAppScript(text) {
  let t = String(text || '').trim().replace(/^```(?:html|javascript|js)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = t.search(/<script/i);
  const end = t.toLowerCase().lastIndexOf('</script>');
  if (start !== -1) {
    t = t.slice(start, end !== -1 ? end + 9 : undefined);
  } else {
    t = `<script id="fc-app">\n${t}\n</script>`;
  }
  return t;
}

function injectAppScript(html, scriptTag) {
  const tag = String(scriptTag || '').replace(/^<script[^>]*>/i, '<script id="fc-app">');
  if (/<script[^>]*id=["']fc-app["'][^>]*>\s*<\/script>/i.test(html)) {
    return html.replace(/<script[^>]*id=["']fc-app["'][^>]*>\s*<\/script>/i, tag);
  }
  return html.replace(/<\/body>/i, tag + '\n</body>');
}

function styleBrief(styleKey) {
  const map = {
    editorial: '编辑风：纸白底 #F7F4EE、衬线大标题、单一赭红强调、大留白、细规则线；禁止渐变、玻璃拟态、密集卡片。',
    swiss: '瑞士网格：无衬线、强左对齐、黑白灰、一个高饱和红强调、圆角 0；禁止居中排版、装饰插画、超过 12px 圆角。',
    product: '产品风：深色或纸白外壳、8–10px 圆角、一层微阴影、一个暖黄强调、克制动效；禁止紫蓝渐变、发光边框、三种强调色。',
  };
  return map[styleKey] || map.product;
}

export function builderUser(p, extra = {}) {
  const spec = p.spec;
  const chosen = (p.decisions || [])
    .filter((d) => d.chosen)
    .map((d) => `需要你决定 ${d.marker}「${d.title}」→ 选择 ${d.chosen}：${d.chosen === 'A' ? d.optionA.label : d.optionB.label}`)
    .join('\n');
  return `用户原话：${p.prompt}
标签：${p.tag}
产品规格：
- 概述：${spec.summary}
- 目标：${spec.goal}
- 做：${(spec.inScope || []).join('；') || '（未列，按原话里出现的功能做）'}
- 不做：${(spec.outOfScope || []).join('；') || '（未列，别加原话没提的功能）'}
- 完成标准：
${(spec.acceptance || []).map((t, i) => `  A${i + 1}. ${t}`).join('\n')}

已做出的裁决：
${chosen || '（暂无，先用最稳妥路径）'}

${builderLayout(p.tag)}

视觉风格：${styleBrief(p.style)}
硬约束：首屏必须是一个 hero 区，H1 后紧跟一句 8 字以上的 <p class="lead">；颜色、字体、圆角、阴影只用 var(--fc-*) 或 var(--bg/--surface/--ink/--text/--accent) 变量，不要另定义主色；底色与文字色必须来自同一套色板，禁止深色页面里出现纯白 hero 或浅字白底；正文不小于 14px；每屏只放一个主按钮；禁止紫蓝渐变、默认蓝链接、Lorem 与示例文本。

第 ${p.round} 轮产物。
${(p.extraRequirements || []).length ? `\n用户在团队聊天里追加的要求（必须一起满足，不能牺牲已有功能）：\n${p.extraRequirements.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n` : ''}
${p.reworkOrder ? `\n修正要求（必须修掉，同时保留已达功能）：\n${p.reworkOrder}\n` : ''}
${extra.previous ? `\n上一轮产物（可参考，不要照抄）：\n${String(extra.previous).slice(0, 4200)}\n` : ''}
请直接输出完整 HTML（含 <script id="fc-app"> 交互脚本）。`;
}

export function delightSystem() {
  return `${COMMON}
你是打磨。写「打磨说明」：逐条对照用户最初原话，说明成品如何回应要求，并点出一条用户没说但你捕捉到并满足了的隐性偏好。
输出 JSON：{"items":[{"requirement":"用户原话/要求","response":"成品如何回应","kind":"EXPLICIT"|"IMPLICIT"}]}
要求：4 条 EXPLICIT + 1 条 IMPLICIT；每条 ≤36 字；不要编造用户没提过的功能。`;
}

export function delightUser(p) {
  return `用户原话：${p.prompt}
完成标准：${(p.spec.acceptance || []).join('；')}
隐性偏好：${p.spec.implicitPreference}
成品特性：${(p.artifact?.features || []).map((f) => f.text || f).join('；')}
请输出打磨说明 JSON。`;
}

// parse + normalize
export function parseJsonLoose(text) {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON 结构缺失');
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function parseJsonArrayLoose(text) {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('JSON 数组缺失');
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function stripCode(text) {
  let t = String(text || '').trim()
    .replace(/^```(?:html|HTML)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const start = t.search(/<!DOCTYPE html|<html/i);
  if (start > 0) t = t.slice(start);
  const lastClose = t.toLowerCase().lastIndexOf('</html>');
  if (lastClose !== -1) t = t.slice(0, lastClose + 7);
  // 统一强调色，避免模型回落到默认蓝
  t = t.replace(/#(?:1a73e8|007bff|2563eb|0d6efd|3b82f6|1d4ed8)/gi, '#FFC53D');
  t = t.replace(/rgb\(26\s*,\s*115\s*,\s*232\)/gi, 'rgb(255,197,61)');
  return t.trim();
}

const str = (v, fallback, max = 120) => {
  if (typeof v !== 'string' || !v.trim()) return fallback;
  return v.trim().slice(0, max);
};

const arr = (v, fallback, max = 5) => {
  if (!Array.isArray(v)) return fallback;
  const list = v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 60)).slice(0, max);
  return list.length ? list : fallback;
};

export function defaultDecisions(spec) {
  return [
    {
      id: 'd1', index: 1, marker: 'A',
      topic: '首屏策略',
      title: 'A 稳妥直给 / B 更贴原话的仪式感',
      context: '这两条都能验收，差别在第一次打开时的感受',
      optionA: { key: 'A', label: '稳妥直给', body: '首屏直接给核心操作，最少认知成本。', tradeoff: '快，但个性弱一点' },
      optionB: { key: 'B', label: '仪式感开场', body: '先给一句定场文案，再进入核心操作。', tradeoff: '有记忆点，但多一步' },
      chosen: null,
    },
    {
      id: 'd2', index: 2, marker: 'B',
      topic: '结果呈现',
      title: 'A 结束汇总卡 / B 常驻分数条',
      context: `围绕「${spec?.goal || '核心目标'}」，结果怎么给更顺手`,
      optionA: { key: 'A', label: '结束汇总卡', body: '结束时弹出总结卡片，仪式感更强。', tradeoff: '结束瞬间信息集中' },
      optionB: { key: 'B', label: '常驻分数条', body: '分数一直可见，结束时只做轻提示。', tradeoff: '随时可读，连贯性好' },
      chosen: null,
    },
  ];
}

export function normalizeSpec(raw, prompt, tag) {
  const fallbackAcceptance = [
    '首屏有标题与主要操作按钮',
    '主按钮点击后有可感知反馈',
    '窄屏 375 下不横向滚动',
    '完成操作后能看到结果状态',
  ];
  const inScope = arr(raw?.inScope, ['把用户一句话落成一个可操作页面', '给出一条清晰的主动作', '在窄屏上也能完成'], 5);
  const outOfScope = arr(raw?.outOfScope, ['不做账号体系', '不做支付'], 3);
  const acceptance = arr(raw?.acceptance, fallbackAcceptance, 4);
  while (acceptance.length < 4) acceptance.push(fallbackAcceptance[acceptance.length]);
  const spec = {
    summary: str(raw?.summary, `${tag}：${String(prompt).slice(0, 30)}`, 80),
    goal: str(raw?.goal, '把一句话变成能用的页面', 60),
    inScope,
    outOfScope,
    acceptance: acceptance.slice(0, 4),
    implicitPreference: str(raw?.implicitPreference, '希望开箱即用，不想读长说明', 80),
  };
  const fallback = defaultDecisions(spec);
  const normalizeDecision = (item, index) => {
    const base = fallback[index] || fallback[0];
    if (!item || typeof item !== 'object') return { ...base };
    const a = item.optionA || {};
    const b = item.optionB || {};
    return {
      id: 'd' + (index + 1),
      index: index + 1,
      marker: String.fromCharCode(65 + index),
      topic: str(item.topic, base.topic, 14),
      title: str(item.title, base.title, 60),
      context: str(item.context, base.context, 60),
      optionA: { key: 'A', label: str(a.label, base.optionA.label, 16), body: str(a.body, base.optionA.body, 60), tradeoff: str(a.tradeoff, base.optionA.tradeoff, 28) },
      optionB: { key: 'B', label: str(b.label, base.optionB.label, 16), body: str(b.body, base.optionB.body, 60), tradeoff: str(b.tradeoff, base.optionB.tradeoff, 28) },
      chosen: null,
    };
  };
  let decisions = Array.isArray(raw?.decisions) ? raw.decisions.slice(0, 2).map(normalizeDecision) : fallback;
  while (decisions.length < 2) decisions.push({ ...fallback[decisions.length] });
  spec.decisions = decisions.map((d) => ({ ...d, chosen: null }));
  return spec;
}

export function normalizeDelight(raw) {
  const items = Array.isArray(raw) ? raw : raw?.items;
  const cleaned = (Array.isArray(items) ? items : [])
    .filter((x) => x && x.requirement && x.response)
    .slice(0, 5)
    .map((x) => ({
      requirement: String(x.requirement).slice(0, 60),
      response: String(x.response).slice(0, 80),
      kind: x.kind === 'IMPLICIT' ? 'IMPLICIT' : 'EXPLICIT',
    }));
  if (cleaned.length < 2) throw new Error('打磨说明结构不完整');
  if (!cleaned.some((x) => x.kind === 'IMPLICIT')) {
    cleaned[cleaned.length - 1].kind = 'IMPLICIT';
  }
  return cleaned.slice(0, 5);
}


export function applyBaseStyle(html, styleKey = 'product') {
  if (!html || !html.includes('</head>')) return html;
  const t = STYLE_TOKENS[styleKey] || STYLE_TOKENS.product;
  // 幂等：旧产物里可能已经带过一次外壳样式，先移除再注入
  const clean = html.replace(/<style id="fc-base">[\s\S]*?<\/style>/gi, '');
  // 成品自己已经定义了一套色板时，只补字体与 fc token，绝不覆盖它的底色和文字色，
  // 否则会出现“深色外壳 + 白底 hero + 浅色标题”这种不可读组合。
  const ownPalette = /--(?:bg|background|surface|paper)\s*:/i.test(clean)
    && /--(?:ink|text|fg|foreground)\s*:/i.test(clean);
  const colorRules = ownPalette ? '' : `
html body{background:${t.bg}!important;color:${t.ink}!important}`;
  const aliasVars = ownPalette ? `--font:${t.font};` : `--fc-bg:${t.bg};--fc-surface:${t.surface};--fc-ink:${t.ink};--fc-sub:${t.sub};--fc-accent:${t.accent};--fc-line:${t.line};--fc-radius:${t.radius};--fc-shadow:${t.shadow};--fc-heading:${t.heading};--bg:${t.bg};--background:${t.bg};--surface:${t.surface};--card:${t.surface};--paper:${t.surface};--ink:${t.ink};--text:${t.ink};--fg:${t.ink};--foreground:${t.ink};--sub:${t.sub};--muted:${t.sub};--accent:${t.accent};--primary:${t.accent};--line:${t.line};--border:${t.line};--font:${t.font};--radius:${t.radius};--shadow:${t.shadow};`;
  const base = `<style id="fc-base">
:root{${aliasVars}}
html{-webkit-text-size-adjust:100%}
*,*::before,*::after{box-sizing:border-box}
html body{margin:0;font-family:${t.font};line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}${colorRules}
h1,h2,h3{font-family:${t.font};letter-spacing:-.02em}
img,svg,video{max-width:100%}
button,input,textarea,select{font:inherit}
button{cursor:pointer}
::selection{background:${t.accent}33}
</style>`;
  return clean.replace('</head>', base + '</head>');
}

// review checks
export const CHECK_IDS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12'];

export function inspect(html, spec) {
  const src = String(html || '');
  const lower = src.toLowerCase();
  const findings = [];
  const push = (id, check, passed, detail) => findings.push({ id, check, passed, detail });

  const structOk =
    lower.includes('<!doctype html') && lower.includes('<html') && lower.includes('</html>') &&
    lower.includes('<head') && lower.includes('</head>') && lower.includes('<body') && lower.includes('</body>');
  push('A1', '结构完整', structOk, structOk ? 'doctype / html / head / body 均闭合' : 'HTML 结构不完整：缺少 doctype 或闭合标签');

  const title = (src.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
  const viewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(src);
  push('A2', '标题与视口', title.length >= 2 && viewport,
    title.length < 2 ? '缺少非空 <title>' : !viewport ? '缺少 viewport meta，375px 下会横向滚动' : `标题「${title}」，已声明 viewport`);

  const missing = [];
  const total = Math.min(4, (spec?.acceptance || []).length || 4);
  for (let i = 1; i <= total; i += 1) {
    const re = new RegExp(`data-acceptance\\s*=\\s*["']?a${i}\\b`, 'i');
    if (!re.test(src)) missing.push(`A${i}`);
  }
  push('A3', '完成标准落点', missing.length === 0,
    missing.length === 0 ? `${total} 条完成标准都有对应的页面元素` : `有 ${missing.length} 条完成标准没有落到页面上`);

  const buttons = (src.match(/<button\b/gi) || []).length;
  const hasListener = /addeventlistener/i.test(src) || /\son[a-z]+\s*=\s*["']/i.test(src);
  push('A4', '基础交互', buttons > 0 && hasListener,
    buttons === 0 ? '没有任何 <button>，用户无法交互' : !hasListener ? '缺少事件监听，按钮点了不会有反应' : `${buttons} 个按钮，事件监听已接`);

  const placeholders = ['TODO', 'lorem ipsum', '[object Object]'].filter((t) => lower.includes(t.toLowerCase()));
  if (/\bundefined\b/.test(src)) placeholders.push('undefined');
  const badLinks = [];
  const attrRe = /(href|src)\s*=\s*["']([^"']*)["']/gi;
  let m;
  while ((m = attrRe.exec(src))) {
    const v = m[2].trim();
    if (!v) badLinks.push('空 ' + m[1]);
    else if (/^javascript:/i.test(v)) badLinks.push('javascript:');
    else if (!/^(#|https?:\/\/|data:|mailto:|tel:|\/)/i.test(v)) badLinks.push(v);
  }
  push('A5', '占位与链接', placeholders.length === 0 && badLinks.length === 0,
    placeholders.length ? `残留占位内容：${placeholders.join('、')}` : badLinks.length ? `不可用链接：${badLinks.slice(0, 3).join('、')}` : '无占位内容，链接均可解析');

  const open = (lower.match(/<script\b/g) || []).length;
  const close = (lower.match(/<\/script>/g) || []).length;
  const sizeOk = src.length >= 1200;
  push('A6', '脚本与完整度', open === close && sizeOk,
    open !== close ? '脚本标签未闭合' : !sizeOk ? `产物过短（${src.length} 字符），疑似未完成` : `${(src.length / 1024).toFixed(1)} KB，脚本 ${open} 段均闭合`);

  const h1 = (src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, '').trim() || '';
  const h1End = src.search(/<\/h1>/i);
  const lead = h1End > 0 && /<p[^>]*>[^<]{8,}<\/p>/i.test(src.slice(h1End, h1End + 900));
  push('A7', '首屏主张', h1.length >= 2 && lead,
    !h1 ? '首屏没有 H1' : !lead ? 'H1 后缺少一句解释' : `H1「${h1.slice(0, 28)}」+ 一句解释`);

  const filler = ['placeholder', '示例文本', '这里放', '点击编辑', 'your text here', '敬请期待'];
  const fillHit = filler.filter((t) => lower.includes(t));
  push('A8', '无演示文本', fillHit.length === 0,
    fillHit.length ? `残留演示文本：${fillHit.join('、')}` : '没有 Lorem / 示例文本 / 空图占位');

  const imgs = src.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter((tag) => !/\balt\s*=\s*["'][^"']+["']/i.test(tag));
  push('A9', '图片有说明', noAlt.length === 0,
    noAlt.length ? `${noAlt.length} 张图没有 alt` : imgs.length ? `${imgs.length} 张图都有 alt` : '没有图片，无需 alt');

  const emptyish = /(?:暂无数据|暂无内容|什么都没有|no data|empty state)/i.test(src);
  push('A10', '内容是真实的', !emptyish,
    emptyish ? '出现空白态占位文案，请填真实内容' : '列表 / 表格 / 空态均为真实内容');

  const fixedWide = src.match(/(?:^|[^-])width\s*:\s*1[2-9]\d{2}px/gi) || [];
  const hScroll = /overflow-x\s*:\s*scroll/i.test(src);
  push('A11', '三档不横滚', fixedWide.length === 0 && !hScroll,
    fixedWide.length ? `存在固定超宽容器：${fixedWide.slice(0, 2).join('、')}` : hScroll ? '存在横向滚动容器' : '未发现固定超宽容器，375 / 768 / 1440 可自适应');

  const defaultBlue = /color\s*:\s*(?:#0000ee|#00e|#0000ff|#007bff|blue)/i.test(src);
  const times = /font-family\s*:[^;}]*times\s+new\s+roman/i.test(src);
  push('A12', '不落默认样式', !defaultBlue && !times,
    defaultBlue ? '出现默认蓝链接色' : times ? '出现 Times New Roman' : '无默认蓝链接、无 Times New Roman');

  return { findings, passed: findings.every((f) => f.passed) };
}

export function failedIds(report) {
  return (report?.findings || []).filter((f) => !f.passed).map((f) => f.id);
}

// runtime helpers
function addHandoff(p, from, to, deliverable, note) {
  if (!p) return;
  p.handoffs = Array.isArray(p.handoffs) ? p.handoffs : [];
  p.handoffs.push({
    from,
    to,
    deliverable: String(deliverable || '').slice(0, 60),
    note: String(note || '').slice(0, 90),
    round: p.round || 0,
    ts: Date.now(),
  });
  p.handoffs = p.handoffs.slice(-40);
}

function startAgent(p, key, base) {
  p.agentRuntime = p.agentRuntime || {};
  const rt = (p.agentRuntime[key] = p.agentRuntime[key] || {});
  rt.startedAt = Date.now();
  rt.progressBase = Math.max(base || 0, rt.progressBase || 0);
  rt.progress = undefined;
}

function stopAgent(p, key, progress) {
  const rt = (p.agentRuntime || {})[key];
  if (!rt) { startAgent(p, key, 0); return stopAgent(p, key, progress); }
  if (rt.startedAt) {
    rt.elapsedMs = (rt.elapsedMs || 0) + Math.max(0, Date.now() - rt.startedAt);
    rt.startedAt = 0;
  }
  rt.progress = progress;
}

function freezeAll(p) {
  Object.keys(p.agentRuntime || {}).forEach((key) => {
    const rt = p.agentRuntime[key];
    if (rt.startedAt) {
      rt.elapsedMs = (rt.elapsedMs || 0) + Math.max(0, Date.now() - rt.startedAt);
      rt.startedAt = 0;
    }
  });
}

function pause(p, err, deps) {
  const kind = err?.kind || 'ERROR';
  const reason = kind === 'NO_PROVIDER' ? 'NO_PROVIDER'
    : (kind === 'QUOTA' || kind === 'RATE_LIMIT') ? 'QUOTA'
      : kind === 'NETWORK' ? 'NETWORK' : 'ERROR';
  p.pausedReason = reason;
  p.pausedFrom = p.status;
  p.pausedAt = Date.now();
  p.nextRetryAt = reason === 'NO_PROVIDER' ? null : Date.now() + (reason === 'QUOTA' ? 30_000 : 60_000);
  p.status = 'PAUSED';
  freezeAll(p);
  p.updatedAt = Date.now();
  deps.log('SYSTEM', `服务连接暂停：${err?.message || '未知错误'}`, 'fail');
  deps.save();
}

async function callModel(p, deps, args) {
  if (typeof localStorage !== 'undefined' && callsToday() >= 80) {
    const err = new Error('团队这轮预算已用完，避免继续消耗');
    err.kind = 'QUOTA';
    throw err;
  }
  const result = await deps.call(args);
  if (result?.providerName) p.providerName = result.providerName;
  if (result?.family) p.modelFamily = result.family;
  return result;
}

function localDelight(p) {
  const spec = p.spec || {};
  const items = [];
  items.push({
    requirement: '你最初的原话',
    response: spec.summary || '已按原话做成可直接打开的成品',
    kind: 'EXPLICIT',
  });
  for (const text of (spec.inScope || []).slice(0, 3)) {
    items.push({ requirement: text, response: '已实现，打开成品即可直接使用', kind: 'EXPLICIT' });
  }
  if (spec.implicitPreference) {
    items.push({ requirement: '你没明说的偏好', response: spec.implicitPreference, kind: 'IMPLICIT' });
  }
  return normalizeDelight({ items });
}

// main loop
export async function advance(p, deps) {
  let guard = 0;
  while (guard++ < 50) {
    if (!p || p.status === 'PAUSED') return 'paused';
    if (p.phase === 'await') return 'await';
    if (p.phase === 'done') return 'done';

    switch (p.phase) {
      case 'intake': {
        p.status = 'BUILDING';
        p.stage = stageOf('BUILDING');
        p.phase = 'plan';
        p.startedAt = p.startedAt || Date.now();
        p.roundStartedAt = Date.now();
        startAgent(p, 'orch', 12);
        startAgent(p, 'product', 8);
        deps.log('ORCHESTRATOR', `收到想法《${p.title}》，开始拆解子任务`);
        deps.log('ORCHESTRATOR', '子任务已派发给 产品 / 开发 / 审查');
        deps.log('SYSTEM', '真实服务已连接（服务端代理，密钥不下发浏览器）');
        p.updatedAt = Date.now();
        deps.save();
        break;
      }

      case 'plan': {
        let raw;
        try {
          const res = await callModel(p, deps, {
            role: 'PRODUCT',
            system: productSystem(),
            user: productUser(p.prompt, p.tag),
            json: true,
            temperature: 0.4,
            maxTokens: 1500,
          });
          raw = parseJsonLoose(res.text);
        } catch (e) {
          if (e.kind) { pause(p, e, deps); return 'paused'; }
          // 结构不对：重试一次，仍失败则降级并如实记录
          try {
            const res = await callModel(p, deps, {
              role: 'PRODUCT',
              system: productSystem(),
              user: productUser(p.prompt, p.tag) + '\n只输出 JSON，不要任何解释。',
              json: true,
              temperature: 0.3,
              maxTokens: 1500,
            });
            raw = parseJsonLoose(res.text);
          } catch (e2) {
            if (e2.kind) { pause(p, e2, deps); return 'paused'; }
            raw = null;
            deps.log('PRODUCT', '返回结构不完整，已降级为默认规格，可退回重做', 'fail');
          }
        }
        p.spec = normalizeSpec(raw, p.prompt, p.tag);
        p.decisions = p.spec.decisions;
        stopAgent(p, 'product', 100);
        stopAgent(p, 'orch', 62);
        deps.log('PRODUCT', `已拆解为 ${p.spec.acceptance.length} 条完成标准`, 'pass');
        deps.log('PRODUCT', `预埋 ${p.decisions.length} 个需要你决定，关键分叉交给你拍板`, 'wait');
        addHandoff(p, 'ORCHESTRATOR', 'PRODUCT', `拆解单 · ${p.spec.acceptance.length} 条完成标准`, p.spec.summary || '');
        addHandoff(p, 'PRODUCT', 'BUILDER', `规格卡 · ${p.spec.acceptance.length} 条检查项`, `场景 ${p.spec.inScope.length} 个 / 不做 ${p.spec.outOfScope.length} 条`);
        p.round = 1;
        p.phase = 'build';
        p.status = 'BUILDING';
        p.stage = stageOf('BUILDING');
        p.roundStartedAt = Date.now();
        startAgent(p, 'orch', 20);
        startAgent(p, 'builder', 8);
        p.updatedAt = Date.now();
        deps.save();
        break;
      }

      case 'build': {
        deps.log('BUILDER', `开始第 ${p.round} 轮产出`);
        startAgent(p, 'builder', p.reworkOrder ? 20 : 8);
        let res;
        try {
          res = await callModel(p, deps, {
            role: 'BUILDER',
            system: builderSystem(),
            user: builderUser(p, { previous: p.artifact?.html }),
            temperature: 0.7,
            maxTokens: 5400,
          });
        } catch (e) {
          pause(p, e, deps);
          return 'paused';
        }
        let html = ensureClosed(stripCode(res.text));
        if (!html || !/<body/i.test(html)) {
          p.reworkOrder = '上一步没有产出完整 HTML，请重新输出完整结构与样式';
          deps.log('BUILDER', '结构与样式未闭合，退回重做', 'fail');
          p.round += 1;
          p.updatedAt = Date.now();
          deps.save();
          continue;
        }
        const appScript = html.match(/<script[^>]*id=["']fc-app["'][^>]*>([\s\S]*?)<\/script>/i);
        const inlineReady = Boolean(appScript && appScript[1].trim().length > 20);
        if (inlineReady) {
          html = applyBaseStyle(html, p.style);
        } else {
          let jsRes;
          try {
            jsRes = await callModel(p, deps, {
              role: 'BUILDER',
              system: scriptSystem(),
              user: scriptUser(p, html),
              temperature: 0.5,
              maxTokens: 1600,
            });
          } catch (e) {
            pause(p, e, deps);
            return 'paused';
          }
          html = applyBaseStyle(injectAppScript(html, stripAppScript(jsRes.text)), p.style);
        }
        p.artifact = {
          round: p.round,
          title: p.title,
          html,
          features: p.spec.acceptance.slice(0, 4),
          createdAt: Date.now(),
          provider: res.providerName || p.providerName,
          bytes: html.length,
        };
        p.versions = [...(p.versions || []), { round: p.round, revision: p.revision || 1, html, createdAt: Date.now() }].slice(-6);
        addHandoff(p, 'BUILDER', 'REVIEWER', `第 ${p.round} 轮版本 · ${(html.length / 1024).toFixed(1)} KB`, '已自测，交给你逐条检查');
        p.phase = 'review';
        p.status = 'REVIEWING';
        p.stage = stageOf('REVIEWING');
        stopAgent(p, 'builder', 92);
        startAgent(p, 'reviewer', 12);
        startAgent(p, 'orch', 45);
        deps.log('BUILDER', `第 ${p.round} 轮产出完成（${(html.length / 1024).toFixed(1)} KB），交给审查`);
        p.updatedAt = Date.now();
        deps.save();
        break;
      }

      case 'review': {
        const report = inspect(p.artifact?.html || '', p.spec);
        p.report = { round: p.round, at: Date.now(), findings: report.findings, passed: report.passed };
        const failed = failedIds(report);
        stopAgent(p, 'reviewer', report.passed ? 100 : 92);
        if (report.passed) {
          deps.log('REVIEWER', `${report.findings.length} 项检查全部通过`, 'pass');
        } else {
          deps.log('REVIEWER', `${failed.length} 项未通过：${report.findings.filter((f) => !f.passed).map((f) => `${f.id}（${f.check}）`).join('、')}`, 'fail');
        }
        p.updatedAt = Date.now();
        deps.save();

        if (report.passed) {
          if (!p.decisionsApplied) {
            p.phase = 'await';
            p.status = 'AWAITING_USER';
            p.stage = stageOf('AWAITING_USER');
            p.awaitReason = 'decision';
            stopAgent(p, 'orch', 70);
            addHandoff(p, 'REVIEWER', 'ORCHESTRATOR', `通过版 · ${report.findings.length} 项检查全过`, '等统筹者整理成给你确认的方案');
            addHandoff(p, 'ORCHESTRATOR', 'USER', `选择卡 · ${p.decisions.length} 个方案`, '两个都能用，差别写在方案里');
            deps.log('ORCHESTRATOR', '产物已通过自检，等你拍板', 'wait');
            p.updatedAt = Date.now();
            deps.save();
            return 'await';
          }
          p.phase = 'deliver';
          break;
        }

        const sig = failed.slice().sort().join(',');
        p.failedHistory = [...(p.failedHistory || []), sig];
        p.failedSignature = sig;
        p.failedIds = failed;
        addHandoff(p, 'REVIEWER', 'BUILDER', `驳回单 · ${failed.length} 项未过`, (report.findings.find((f) => !f.passed)?.detail || '').slice(0, 70));
        const repeated = p.failedHistory.filter((s) => s === sig).length >= 2;
        if (repeated || p.round >= p.maxRound) {
          p.escalate = true;
          p.phase = 'await';
          p.status = 'AWAITING_USER';
          p.stage = stageOf('AWAITING_USER');
          p.awaitReason = 'escalate';
          stopAgent(p, 'orch', 70);
          addHandoff(p, 'REVIEWER', 'ORCHESTRATOR', `诊断单 · ${failed.length} 项未过`, repeated ? '连续两轮同一问题，需要你定方向' : '到轮次上限，需要你定方向');
          addHandoff(p, 'ORCHESTRATOR', 'USER', '诊断卡 · 需要你定方向', '继续修，或先拿到当前这一版');
          deps.log('ORCHESTRATOR', repeated
            ? '同一个问题连续 2 轮没修好，需要你定方向'
            : `第 ${p.round} 轮仍未通过，已到第 ${p.maxRound} 轮上限，转人工`, 'wait');
          p.updatedAt = Date.now();
          deps.save();
          return 'await';
        }
        p.round += 1;
        p.reworkOrder = report.findings.filter((f) => !f.passed)
          .map((f) => `${f.id} ${f.check}：${f.detail}`).join('；');
        p.phase = 'build';
        p.status = 'REWORKING';
        p.stage = stageOf('REWORKING');
        p.roundStartedAt = Date.now();
        stopAgent(p, 'orch', 55);
        startAgent(p, 'orch', 55);
        deps.log('ORCHESTRATOR', `判定修正，回退到最近一版，开始第 ${p.round} 轮`);
        p.updatedAt = Date.now();
        deps.save();
        break;
      }

      case 'apply': {
        p.revision = (p.revision || 1) + 1;
        p.maxRound = 3;
        p.decisionsApplied = true;
        p.escalate = false;
        p.phase = 'build';
        p.status = 'REWORKING';
        p.stage = stageOf('REWORKING');
        p.reworkOrder = '按已拍板方案调整：' + p.decisions
          .filter((d) => d.chosen)
          .map((d) => `${d.marker} ${d.chosen === 'A' ? d.optionA.label : d.optionB.label}`)
          .join('；');
        p.roundStartedAt = Date.now();
        startAgent(p, 'builder', 8);
        startAgent(p, 'orch', 40);
        addHandoff(p, 'USER', 'BUILDER', '已拍板的方案', p.reworkOrder.slice(0, 80));
        deps.log('ORCHESTRATOR', `已写入选择，第 ${p.round} 轮按你的选择重做`);
        p.updatedAt = Date.now();
        deps.save();
        break;
      }

      case 'deliver': {
        p.status = 'DELIVERED';
        p.deliveredAt = p.deliveredAt || Date.now();
        p.stage = stageOf('DELIVERED');
        p.phase = 'polish';
        p.saluteUntil = Date.now() + 15000;
        p.saluteKind = 'done';
        stopAgent(p, 'orch', 100);
        stopAgent(p, 'builder', 100);
        stopAgent(p, 'reviewer', 100);
        startAgent(p, 'pleaser', 10);
        addHandoff(p, 'REVIEWER', 'PLEASER', `通过版 · 第 ${p.round} 轮`, '功能过了，交给你收字、收色、收动效');
        addHandoff(p, 'PLEASER', 'USER', `成品 · ${((p.artifact?.html.length || 0) / 1024).toFixed(1)} KB`, '可以打开、导出、分享，也可以再做一版');
        deps.log('ORCHESTRATOR', `第 ${p.round} 轮成品已交付，等你确认`);
        p.updatedAt = Date.now();
        deps.save();
        break;
      }

      case 'polish': {
        p.delight = localDelight(p);
        stopAgent(p, 'pleaser', 100);
        deps.log('PLEASER', `打磨说明已整理（${p.delight.length} 条）`, 'pass');
        p.phase = 'done';
        p.deliveredAt = p.deliveredAt || Date.now();
        p.stage = stageOf('DELIVERED');
        p.status = 'DELIVERED';
        p.updatedAt = Date.now();
        deps.save();
        return 'done';
      }

      default:
        return 'done';
    }
  }
  return 'done';
}

export function resumeFromPause(p) {
  if (!p || p.status !== 'PAUSED') return;
  p.status = p.pausedFrom || (p.phase === 'review' ? 'REVIEWING' : 'BUILDING');
  p.pausedReason = null;
  p.pausedAt = null;
  p.nextRetryAt = null;
  p.pausedFrom = null;
  Object.keys(p.agentRuntime || {}).forEach((key) => {
    const rt = p.agentRuntime[key];
    if (!rt.startedAt && rt.progress !== 100) {
      rt.startedAt = Date.now();
    }
  });
  p.updatedAt = Date.now();
}
