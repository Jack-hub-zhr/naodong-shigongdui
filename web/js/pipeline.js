/* 真实施工队编排：产品 → 开发 → 审查 → (返工) → 裁决 → 取悦
   所有模型调用走 /api/complete；审查结论由本地断言决定，不靠模型投票。 */

import { stageOf, callsToday } from './store.js';

/* ---------------- 提示词 ---------------- */
const COMMON = `你在「ForgeCrew 脑洞施工队」里工作。用户只提交一句自然语言脑洞，施工队把它落地成可直接运行的成品。
统一术语：总监 / 产品 / 开发 / 审查 / 取悦；施工日志、验收台、裁决点、返工、成品。
不要解释过程，不要输出多余前后缀，严格按要求格式输出。`;

export function productSystem() {
  return `${COMMON}
你是产品。职责只有一件事：把用户脑洞翻译成可执行的功能规格，不写代码。
输出 JSON，字段：
- summary: 一句话产品概述（≤40 字）
- goal: 用户完成的核心任务（≤30 字）
- inScope: 3-5 条“做什么”
- outOfScope: 2-3 条“不做什么”
- acceptance: 恰好 4 条可程序化验收的标准，每条 ≤24 字，必须能在 HTML 里检查
- implicitPreference: 从措辞里捕捉到的一条隐性偏好（≤40 字）
- decisions: 恰好 2 个裁决点，每个形如
  { "topic":"裁决主题（≤10字）", "title":"A 方案… / B 方案…（≤40字）", "context":"为什么需要你拍板（≤40字）",
    "optionA": { "label":"A 方案名（≤12字）", "body":"方案说明（≤40字）", "tradeoff":"代价/收益（≤20字）" },
    "optionB": { "label":"B 方案名（≤12字）", "body":"方案说明（≤40字）", "tradeoff":"代价/收益（≤20字）" } }
裁决点必须是产品方向上真正需要用户偏好的分叉：一个偏稳、一个更贴合用户原话里的情绪。`;
}

export function productUser(prompt, tag) {
  return `用户脑洞（原话）：
"""${prompt}"""

用户选择的标签：${tag}
请输出规格 JSON。`;
}

export function builderSystem() {
  return `${COMMON}
你是开发。只按产品给出的规格写代码，不修改规格。
输出一个完整、可直接运行的单文件 HTML（含内联 CSS 和 JS），不要输出解释或代码围栏。
硬性要求：
1. <!DOCTYPE html>、<html lang="zh-CN">、<head>、<meta charset>、<meta name="viewport">、非空 <title>，结尾必须闭合 </html>
2. 移动端 375px 宽度不横向滚动，触控目标 ≥44px
3. 至少一个 <button type="button">，交互用 addEventListener 实现，脚本闭合
4. 为 4 条验收标准分别在最相关的元素上加 data-acceptance="A1"…"A4"
5. 不引用外部 JS/CSS/字体/图片；不出现 TODO、lorem ipsum、undefined；空 href 不允许
6. 文案用中文，视觉完成度要高，不要占位骨架
7. localStorage、sessionStorage、navigator.clipboard、AudioContext 等可能被沙箱禁止的 API，必须写在 try/catch 里；绝不能让一次异常中断整个脚本
8. 所有按钮必须真实可用：点击后要有可见状态变化（分数、倒计时、文案、面板切换），不能是空函数
9. 产物控制在 9KB 以内，优先保证完整闭合与可运行

如果是小游戏，额外要求：
10. 「开始 / 暂停 / 重开」是独立按钮，放在游戏区正下方，与游戏区至少间隔 16px；禁止绝对定位压在游戏区上
11. 点击开始后真正进入可玩状态：倒计时走动、按钮文案变为「暂停」，再次点击可暂停；结束给出结算并可重开
12. 若用 <canvas>，点击坐标按 getBoundingClientRect() 实际尺寸换算，并设置 touch-action:none`;
}

export function builderUser(p, extra = {}) {
  const spec = p.spec;
  const chosen = (p.decisions || [])
    .filter((d) => d.chosen)
    .map((d) => `裁决点 ${d.marker}「${d.title}」→ 选择 ${d.chosen}：${d.chosen === 'A' ? d.optionA.label : d.optionB.label}`)
    .join('\n');
  return `用户原话：${p.prompt}
标签：${p.tag}
产品规格：
- 概述：${spec.summary}
- 目标：${spec.goal}
- 做：${(spec.inScope || []).join('；') || '（未列，按原话里出现的功能做）'}
- 不做：${(spec.outOfScope || []).join('；') || '（未列，别加原话没提的功能）'}
- 验收标准：
${(spec.acceptance || []).map((t, i) => `  A${i + 1}. ${t}`).join('\n')}

已做出的裁决：
${chosen || '（暂无，先用最稳妥路径）'}

第 ${p.round} 轮产物。
${p.reworkOrder ? `\n返工要求（必须修掉，同时保留已达功能）：\n${p.reworkOrder}\n` : ''}
${extra.previous ? `\n上一轮产物（可参考，不要照抄）：\n${String(extra.previous).slice(0, 4200)}\n` : ''}
请直接输出完整 HTML。`;
}

export function delightSystem() {
  return `${COMMON}
你是取悦。写「取悦声明」：逐条对照用户最初原话，说明成品如何回应要求，并点出一条用户没说但你捕捉到并满足了的隐性偏好。
输出 JSON：{"items":[{"requirement":"用户原话/要求","response":"成品如何回应","kind":"EXPLICIT"|"IMPLICIT"}]}
要求：4 条 EXPLICIT + 1 条 IMPLICIT；每条 ≤36 字；不要编造用户没提过的功能。`;
}

export function delightUser(p) {
  return `用户原话：${p.prompt}
验收标准：${(p.spec.acceptance || []).join('；')}
隐性偏好：${p.spec.implicitPreference}
成品特性：${(p.artifact?.features || []).map((f) => f.text || f).join('；')}
请输出取悦声明 JSON。`;
}

/* ---------------- 解析与规整 ---------------- */
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
  if (cleaned.length < 2) throw new Error('取悦声明结构不完整');
  if (!cleaned.some((x) => x.kind === 'IMPLICIT')) {
    cleaned[cleaned.length - 1].kind = 'IMPLICIT';
  }
  return cleaned.slice(0, 5);
}

/* ---------------- 审查断言（唯一判定） ---------------- */
export const CHECK_IDS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];

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
  push('A3', '验收落点', missing.length === 0,
    missing.length === 0 ? `${total} 条验收标准都有 data-acceptance 落点` : `缺少 ${missing.join('、')} 落点（期望 data-acceptance="A1"…）`);

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

  return { findings, passed: findings.every((f) => f.passed) };
}

export function failedIds(report) {
  return (report?.findings || []).filter((f) => !f.passed).map((f) => f.id);
}

/* ---------------- 运行期小工具 ---------------- */
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
  deps.log('SYSTEM', `通道暂停：${err?.message || '未知错误'}`, 'fail');
  deps.save();
}

async function callModel(p, deps, args) {
  if (typeof localStorage !== 'undefined' && callsToday() >= 80) {
    const err = new Error('今日免费额度已用完，避免继续消耗');
    err.kind = 'QUOTA';
    throw err;
  }
  const result = await deps.call(args);
  if (result?.providerName) p.providerName = result.providerName;
  if (result?.family) p.modelFamily = result.family;
  return result;
}

/* ---------------- 主流程 ---------------- */
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
        deps.log('ORCHESTRATOR', `收到脑洞《${p.title}》，开始拆解子任务`);
        deps.log('ORCHESTRATOR', '子任务已派发给 产品 / 开发 / 审查');
        deps.log('SYSTEM', `真实通道 · ${p.providerName || '免费通道'}（服务端代理，密钥不下发浏览器）`);
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
        deps.log('PRODUCT', `已拆解为 ${p.spec.acceptance.length} 条验收标准`, 'pass');
        deps.log('PRODUCT', `预埋 ${p.decisions.length} 个裁决点，关键分叉交给你拍板`, 'wait');
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
            maxTokens: 3800,
          });
        } catch (e) {
          pause(p, e, deps);
          return 'paused';
        }
        const html = stripCode(res.text);
        p.artifact = {
          round: p.round,
          title: p.title,
          html,
          features: p.spec.acceptance.slice(0, 4),
          createdAt: Date.now(),
          provider: res.providerName || p.providerName,
          bytes: html.length,
        };
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
            deps.log('ORCHESTRATOR', '产物已通过自检，裁决点等你拍板', 'wait');
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
        const repeated = p.failedHistory.filter((s) => s === sig).length >= 2;
        if (repeated || p.round >= p.maxRound) {
          p.escalate = true;
          p.phase = 'await';
          p.status = 'AWAITING_USER';
          p.stage = stageOf('AWAITING_USER');
          p.awaitReason = 'escalate';
          stopAgent(p, 'orch', 70);
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
        deps.log('ORCHESTRATOR', `判定返工，回退到最近裁决点，开始第 ${p.round} 轮`);
        p.updatedAt = Date.now();
        deps.save();
        break;
      }

      case 'apply': {
        p.round += 1;
        p.maxRound = Math.max(p.maxRound, p.round + 1);
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
        deps.log('ORCHESTRATOR', `已写入裁决，第 ${p.round} 轮按你的选择重做`);
        p.updatedAt = Date.now();
        deps.save();
        break;
      }

      case 'deliver': {
        p.status = 'DELIVERED';
        p.stage = stageOf('DELIVERED');
        p.phase = 'polish';
        stopAgent(p, 'orch', 100);
        stopAgent(p, 'builder', 100);
        stopAgent(p, 'reviewer', 100);
        startAgent(p, 'pleaser', 10);
        deps.log('ORCHESTRATOR', `第 ${p.round} 轮成品已交付，等你验收`);
        p.updatedAt = Date.now();
        deps.save();
        break;
      }

      case 'polish': {
        try {
          const res = await callModel(p, deps, {
            role: 'PLEASER',
            system: delightSystem(),
            user: delightUser(p),
            json: true,
            temperature: 0.5,
            maxTokens: 900,
          });
          p.delight = normalizeDelight(parseJsonLoose(res.text));
          stopAgent(p, 'pleaser', 100);
          deps.log('PLEASER', `取悦声明已生成（${p.delight.length} 条）`, 'pass');
        } catch (e) {
          if (e.kind === 'QUOTA' || e.kind === 'RATE_LIMIT') {
            pause(p, e, deps);
            return 'paused';
          }
          p.delight = [];
          p.pleaserFailed = true;
          stopAgent(p, 'pleaser', 0);
          deps.log('PLEASER', `取悦声明生成失败：${e.message || '结构不完整'}，可重试`, 'fail');
        }
        p.phase = 'done';
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
