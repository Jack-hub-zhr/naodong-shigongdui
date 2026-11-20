import type { Artifact, DecisionPoint, DelightItem, ReviewFinding, Spec, Tag } from '../types';

const COMMON_RULES = `你在「脑洞施工队」里工作。用户只提交一句自然语言脑洞，你要像施工队一样把它落地。
产品内统一术语：施工队、工种（产品/开发/审查）、施工日志、验收台、返工单、验收通过。
不要解释过程，不要输出 Markdown 代码围栏，严格按要求格式输出。`;

export function productSystemPrompt(): string {
  return `${COMMON_RULES}
你是产品工种。职责只有一件事：把用户脑洞翻译成可执行的功能规格，不写代码。
输出 JSON，字段：
- summary: 一句话产品概述（≤40 字）
- goal: 用户完成的核心任务（≤30 字）
- inScope: 3-5 条“做什么”
- outOfScope: 2-3 条“不做什么”
- acceptance: 恰好 4 条可程序化验收的标准，每条 ≤24 字，尽量包含可检查的元素（如“首屏有标题与开始按钮”）
- implicitPreference: 从用户措辞里捕捉到的一条隐性偏好（≤40 字）
- decisions: 恰好 2 个裁决点，每个形如
  { "topic": "裁决主题（≤10字）", "title": "A 方案… / B 方案…（一句话对照，≤40字）", "context": "为什么需要你拍板（≤40字）",
    "optionA": { "label": "A 方案名（≤12字）", "body": "方案说明（≤40字）", "tradeoff": "代价/收益（≤20字）" },
    "optionB": { "label": "B 方案名（≤12字）", "body": "方案说明（≤40字）", "tradeoff": "代价/收益（≤20字）" } }
裁决点必须是产品方向上真正需要用户偏好的分叉：一个偏稳、一个更贴合用户原话里的情绪。`;
}

export function productUserPrompt(prompt: string, tag: Tag): string {
  return `用户脑洞（原话）：
"""${prompt}"""

用户选择的标签：${tag}
请输出规格 JSON。`;
}

export function builderSystemPrompt(): string {
  return `${COMMON_RULES}
你是开发工种。只按产品工种给出的规格写代码，不修改规格。
输出一个完整、可直接运行的单文件 HTML（含内联 CSS 和 JS），不要输出任何解释或代码围栏。
硬性要求：
1. <!DOCTYPE html>、<html lang="zh-CN">、<head>、<meta charset>、<meta name="viewport">、非空 <title>
2. 移动端 375px 宽度不横向滚动，触控目标 ≥44px
3. 至少一个 <button type="button">，交互用 addEventListener 实现，脚本闭合
4. 为 4 条验收标准分别在最相关的元素上加 data-acceptance="A1"…"A4"
5. 不引用外部 JS/CSS/字体/图片；不出现 TODO、lorem ipsum、undefined
6. 所有链接使用 # 或 https 地址，不允许空 href
7. 文案用中文，视觉完成度要高，不要占位骨架`;
}

export function builderUserPrompt(args: {
  prompt: string;
  tag: Tag;
  spec: Spec;
  decisions: DecisionPoint[];
  previous?: Artifact;
  reworkOrder?: string;
  round: number;
}): string {
  const { prompt, tag, spec, decisions, previous, reworkOrder, round } = args;
  const chosen = decisions
    .filter((item) => item.chosen)
    .map(
      (item) =>
        `裁决点 ${item.index}「${item.title}」→ 选择 ${item.chosen}：` +
        (item.chosen === 'A' ? item.optionA : item.optionB).label,
    )
    .join('\n');

  return `用户原话：${prompt}
标签：${tag}
产品规格：
- 概述：${spec.summary}
- 目标：${spec.goal}
- 做：${spec.inScope.join('；')}
- 不做：${spec.outOfScope.join('；')}
- 验收标准：
${spec.acceptance.map((item, i) => `  A${i + 1}. ${item}`).join('\n')}

已做出的裁决：
${chosen || '（暂无，先用最稳妥路径）'}

第 ${round} 轮产物。${reworkOrder ? `\n审查/用户返工要求：${reworkOrder}\n必须在保留已达功能的前提下修掉这些问题。` : ''}
${previous ? `\n上一轮产物（可参考但不要照抄）：\n${previous.html.slice(0, 6000)}` : ''}

请直接输出完整 HTML。`;
}

export function reviewSystemPrompt(): string {
  return `${COMMON_RULES}
你是审查工种。你不写代码、不改规格，只读取程序化检查结果，用一句中文说明本次检查结论。
只输出一句话，≤50 字，不要客套。`;
}

export function reviewUserPrompt(args: {
  spec: Spec;
  findings: ReviewFinding[];
  round: number;
}): string {
  const failed = args.findings.filter((item) => !item.passed);
  return `第 ${args.round} 轮检查。验收标准：${args.spec.acceptance.join('；')}。
未通过项：${failed.length ? failed.map((f) => f.detail).join('；') : '无'}。
请给出一句结论。`;
}

export function delightSystemPrompt(): string {
  return `${COMMON_RULES}
你是调度工种，负责写「取悦声明」：逐条对照用户最初原话，说明成品如何回应每一条显性要求，并主动点出一条用户没说、但你捕捉到并满足了的隐性偏好。
输出 JSON：{"items":[{"requirement":"用户原话/要求","response":"成品如何回应","kind":"EXPLICIT"|"IMPLICIT"}]}
要求：4 条 EXPLICIT + 1 条 IMPLICIT；每条 ≤36 字；不要编造用户没提过的功能。`;
}

export function delightUserPrompt(args: {
  prompt: string;
  spec: Spec;
  artifact: Artifact;
}): string {
  return `用户原话：${args.prompt}
验收标准：${args.spec.acceptance.join('；')}
隐性偏好：${args.spec.implicitPreference}
成品特性：${args.artifact.features.join('；')}
请输出取悦声明 JSON。`;
}

export function reworkIntentPrompt(order: string): string {
  return order;
}

export function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON 结构缺失');
  return JSON.parse(trimmed.slice(start, end + 1)) as T;
}

export function parseJsonArrayLoose<T>(text: string): T[] {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('JSON 数组缺失');
  return JSON.parse(trimmed.slice(start, end + 1)) as T[];
}

export function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

export function normalizeDelight(items: DelightItem[]): DelightItem[] {
  const cleaned = items
    .filter((item) => item && item.requirement && item.response)
    .slice(0, 5)
    .map(
      (item): DelightItem => ({
        requirement: String(item.requirement).slice(0, 60),
        response: String(item.response).slice(0, 80),
        kind: item.kind === 'IMPLICIT' ? 'IMPLICIT' : 'EXPLICIT',
      }),
    );
  if (!cleaned.some((item) => item.kind === 'IMPLICIT')) {
    cleaned.push({
      requirement: '你没说，但我们在听',
      response: '把最常用的动作放在首屏，减少来回点击。',
      kind: 'IMPLICIT',
    });
  }
  return cleaned;
}
