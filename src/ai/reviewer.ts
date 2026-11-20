import type { ReviewFinding, ReviewReport, Spec } from '../types';

const STOP_WORDS = new Set([
  '一个',
  '一下',
  '可以',
  '我们',
  '我的',
  '想要',
  '需要',
  '能够',
  '这个',
  '那个',
  '然后',
  '就是',
  '还是',
  '把我',
  '做成',
  '做个',
  '帮我',
]);

function keywordsFromPrompt(prompt: string): string[] {
  const cleaned = prompt.replace(/[，。！？、；：“”‘’（）【】\s]/g, ' ');
  const chunks = cleaned.split(' ').filter(Boolean);
  const words: string[] = [];
  for (const chunk of chunks) {
    if (/^[\u4e00-\u9fa5]+$/.test(chunk)) {
      for (let size = 2; size <= 4; size += 1) {
        for (let i = 0; i + size <= chunk.length; i += 1) {
          const token = chunk.slice(i, i + size);
          if (!STOP_WORDS.has(token)) words.push(token);
        }
      }
    } else if (chunk.length >= 2) {
      words.push(chunk);
    }
  }
  return Array.from(new Set(words)).slice(0, 24);
}

function getAttrValues(html: string, attr: 'href' | 'src'): string[] {
  const regex = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, 'gi');
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    values.push(match[1]);
  }
  return values;
}

/**
 * 审查工种：程序化检查（不靠模型投票）。
 * 返回的 passed 完全由本地规则决定，模型只负责把结论翻译成人话。
 */
export function inspectArtifact(
  html: string,
  spec: Spec,
  prompt: string,
  round: number,
): ReviewReport {
  const findings: ReviewFinding[] = [];
  const lower = html.toLowerCase();

  const push = (id: string, check: string, passed: boolean, detail: string) => {
    findings.push({ id, check, passed, detail });
  };

  const structurallyValid =
    lower.includes('<!doctype html') &&
    lower.includes('<html') &&
    lower.includes('</html>') &&
    lower.includes('<body') &&
    lower.includes('</body>') &&
    lower.includes('<head') &&
    lower.includes('</head>');
  push(
    'structure',
    '结构完整',
    structurallyValid,
    structurallyValid ? 'HTML 文档结构完整' : 'HTML 结构不完整（缺少 doctype/html/head/body 闭合）',
  );

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? '';
  push('title', '页面标题', title.length >= 2, title.length >= 2 ? `标题：${title}` : '缺少非空 <title>');

  const viewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html);
  push(
    'viewport',
    '移动端视口',
    viewport,
    viewport ? '已声明 viewport' : '缺少 viewport meta，375px 下会横向滚动',
  );

  const missingMarkers: string[] = [];
  spec.acceptance.forEach((item, index) => {
    const marker = `data-acceptance="a${index + 1}"`;
    const markerSingle = `data-acceptance='a${index + 1}'`;
    if (!lower.includes(marker) && !lower.includes(markerSingle)) {
      missingMarkers.push(`A${index + 1}（${item}）`);
    }
  });
  push(
    'acceptance',
    '验收标准落点',
    missingMarkers.length === 0,
    missingMarkers.length === 0
      ? `${spec.acceptance.length} 条验收标准均有对应落点`
      : `关键元素缺失：${missingMarkers.join('、')}`,
  );

  const buttonCount = (html.match(/<button/gi) ?? []).length;
  const hasListener = lower.includes('addeventlistener') || /\son\w+\s*=/i.test(html);
  push(
    'interaction',
    '基础交互',
    buttonCount > 0 && hasListener,
    buttonCount > 0 && hasListener
      ? `发现 ${buttonCount} 个按钮与事件监听`
      : buttonCount === 0
        ? '没有任何按钮，用户无法交互'
        : '缺少事件监听，按钮点了不会有反应',
  );

  const placeholderHits = ['TODO', 'lorem ipsum', '[object Object]'].filter((token) =>
    lower.includes(token.toLowerCase()),
  );
  const undefinedHit = /\bundefined\b/.test(html);
  if (undefinedHit) placeholderHits.push('undefined');
  push(
    'placeholder',
    '占位内容',
    placeholderHits.length === 0,
    placeholderHits.length === 0 ? '没有占位内容残留' : `残留占位内容：${placeholderHits.join('、')}`,
  );

  const brokenLinks: string[] = [];
  const allLinks = [...getAttrValues(html, 'href'), ...getAttrValues(html, 'src')];
  for (const link of allLinks) {
    const value = link.trim();
    if (!value) brokenLinks.push('空 href/src');
    else if (/^javascript:/i.test(value)) brokenLinks.push('javascript: 链接');
    else if (!/^(#|https?:\/\/|data:|mailto:|tel:)/i.test(value)) brokenLinks.push(value);
  }
  push(
    'links',
    '链接可达性',
    brokenLinks.length === 0,
    brokenLinks.length === 0
      ? `检查 ${allLinks.length} 个链接，均为可解析地址`
      : `发现 ${brokenLinks.length} 个不可用链接：${Array.from(new Set(brokenLinks)).slice(0, 3).join('、')}`,
  );

  const keywords = keywordsFromPrompt(prompt);
  const hit = keywords.filter((word) => html.includes(word));
  push(
    'voice',
    '原话回填',
    hit.length >= 1,
    hit.length >= 1
      ? `成品保留了你原话里的「${hit.slice(0, 3).join('、')}」`
      : '成品里找不到你原话的关键词，容易做成通用模板',
  );

  const scriptOpen = (lower.match(/<script\b/g) ?? []).length;
  const scriptClose = (lower.match(/<\/script>/g) ?? []).length;
  push(
    'script',
    '脚本闭合',
    scriptOpen === scriptClose,
    scriptOpen === scriptClose ? `脚本块 ${scriptOpen} 个，均已闭合` : '脚本标签未闭合',
  );

  push(
    'size',
    '产物完整度',
    html.length >= 1200,
    html.length >= 1200 ? `产物 ${Math.round(html.length / 1024)}KB，可独立运行` : '产物过短，疑似未完成',
  );

  return {
    round,
    at: Date.now(),
    findings,
    passed: findings.every((finding) => finding.passed),
  };
}

export function failedFindings(report: ReviewReport): ReviewFinding[] {
  return report.findings.filter((finding) => !finding.passed);
}

export function failureSummary(report: ReviewReport): string {
  const failed = failedFindings(report);
  if (failed.length === 0) return '全部通过';
  return failed.map((finding) => finding.detail).join('；');
}
