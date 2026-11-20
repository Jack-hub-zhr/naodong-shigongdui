import type {
  Artifact,
  DecisionPoint,
  DelightItem,
  Project,
  Spec,
  Tag,
} from '../types';
import { inspectArtifact } from '../ai/reviewer';

export function shortTitle(prompt: string): string {
  const cleaned = prompt
    .replace(/\s+/g, '')
    .replace(/^(帮我|请帮我|请|我想|我想要|想要|做一个|做个|来个|给我|能不能|可以)/, '')
    .replace(/[。！？!?].*$/, '');
  const title = cleaned.slice(0, 18);
  return title.length > 0 ? title : '无名脑洞';
}

/** 用户没手动贴标签时，按原话猜一个最接近的 */
export function inferTag(prompt: string): Tag {
  if (/游戏|小游戏|玩一局|关卡|节奏|得分|连击|贪吃蛇|消消乐/.test(prompt)) return '小游戏';
  if (/落地页|官网|页面|网页|单页|landing|介绍页/.test(prompt)) return '页面';
  if (/自动|定时|批量|脚本|整理|抓取|提醒/.test(prompt)) return '自动化';
  if (/工具|计时|清单|待办|to-?do|计算器|记录|打卡/.test(prompt)) return '工具';
  return '其他';
}

export function quotePrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  return cleaned.length > 26 ? `${cleaned.slice(0, 26)}…` : cleaned;
}

interface DecisionSeed {
  topic: string;
  title: string;
  context: string;
  a: { label: string; body: string; tradeoff: string };
  b: { label: string; body: string; tradeoff: string };
}

interface Blueprint {
  goal: string;
  summary: string;
  acceptance: string[];
  inScope: string[];
  outOfScope: string[];
  decisions: [DecisionSeed, DecisionSeed];
}

const BLUEPRINTS: Record<Tag, Blueprint> = {
  小游戏: {
    goal: '60 秒内玩一局，越点越上瘾',
    summary: '一个打开就能玩的节奏打点小游戏',
    acceptance: [
      '首屏有标题、开始按钮与得分区',
      '一局结束后可一键重开',
      '支持键盘空格开始 / 暂停',
      '60 秒倒计时结束自动结算',
    ],
    inScope: ['点击得分与连击', '60 秒倒计时', '最高分本地保存', '移动端单屏可玩'],
    outOfScope: ['账号体系', '排行榜联机', '内购与广告'],
    decisions: [
      {
        topic: '玩法主循环',
        title: 'A 更稳但普通 / B 有风险但更贴合你原话的兴奋感',
        context: '这决定第一分钟是“会玩”，还是“想再来一局”。',
        a: {
          label: '稳：点击得分',
          body: '60 秒内点中目标就加分，规则一句话讲完。',
          tradeoff: '稳妥，但记忆点偏弱',
        },
        b: {
          label: '险：节奏连击',
          body: '连续命中叠倍率，失误扣时间，爽感更足。',
          tradeoff: '更刺激，手残会挫败',
        },
      },
      {
        topic: '视觉与反馈',
        title: 'A 清爽克制 / B 更闹腾、更“爽”',
        context: '这套视觉会一路沿用到交付，先定基调。',
        a: {
          label: '干净扁平',
          body: '深灰底 + 施工黄点缀，信息优先。',
          tradeoff: '耐看，不出错',
        },
        b: {
          label: '街机霓虹',
          body: '高饱和描边、闪光与震动反馈。',
          tradeoff: '更抓眼，但容易吵',
        },
      },
    ],
  },
  工具: {
    goal: '一个 25 分钟专注计时 + 任务清单',
    summary: '打开即用的专注工具，记录都留在本机',
    acceptance: [
      '首屏有计时器与开始按钮',
      '可一键重置到 25:00',
      '可一键清除已完成任务',
      '任务与设置刷新后仍保留',
    ],
    inScope: ['25 分钟专注计时', '任务添加与勾选', '本地持久化', '移动端单手操作'],
    outOfScope: ['团队共享', '账号登录', '复杂统计报表'],
    decisions: [
      {
        topic: '交互形态',
        title: 'A 打开即用更稳 / B 数据面板更像专业工具',
        context: '你原话里既要“简单”，又提到“每天用”，得取舍。',
        a: {
          label: '单栏极简',
          body: '一屏就一个计时器 + 一份清单。',
          tradeoff: '上手零成本',
        },
        b: {
          label: '多面板数据感',
          body: '加完成数、连续天数、趋势面板。',
          tradeoff: '更专业，也更重',
        },
      },
      {
        topic: '记录方式',
        title: 'A 只存本机 / B 预留云同步',
        context: '免费层没有后端，云同步只能先留结构。',
        a: {
          label: '本地即用',
          body: 'localStorage 保存，断网也能用。',
          tradeoff: '换设备会丢',
        },
        b: {
          label: '云同步预留',
          body: '留出同步入口，后续接账号。',
          tradeoff: '当前版本会增加设置项',
        },
      },
    ],
  },
  页面: {
    goal: '一句话讲清价值，并让人愿意点进去',
    summary: '一个可直接发朋友圈的单页，信息与转化路径都在首屏',
    acceptance: [
      '首屏有一句价值主张与主按钮',
      '主按钮可跳转到功能区',
      '375px 宽度下单栏不横向滚动',
      '页脚链接均为可用地址',
    ],
    inScope: ['首屏价值主张', '功能区卡片', '主 CTA', '移动端单栏'],
    outOfScope: ['后台 CMS', '多语言', '复杂动效库'],
    decisions: [
      {
        topic: '首屏叙事',
        title: 'A 一句话讲清 / B 强视觉大字更抓眼',
        context: '决定访客第一眼是“懂了”，还是“被击中”。',
        a: {
          label: '一句话价值主张',
          body: '标题 + 一句解释 + 主按钮。',
          tradeoff: '清楚，但不惊艳',
        },
        b: {
          label: '强视觉冲击',
          body: '超大字 + 高对比背景 + 一个大按钮。',
          tradeoff: '抓眼，信息量变少',
        },
      },
      {
        topic: '转化路径',
        title: 'A 顶部就能点 / B 滚动后再出现',
        context: '你原话里的兴奋感，可能来自“马上能试”。',
        a: {
          label: '顶部 CTA',
          body: '首屏直接给出主按钮。',
          tradeoff: '转化快，但略急',
        },
        b: {
          label: '滚动后 CTA',
          body: '先讲完三个卖点再请人点击。',
          tradeoff: '更完整，路径更长',
        },
      },
    ],
  },
  自动化: {
    goal: '把一段乱糟糟的文案，一键整理成清单',
    summary: '纯本地运行的文案整理器，粘进来就能用',
    acceptance: [
      '首屏有输入框与执行按钮',
      '结果可一键复制',
      '可清空输入重来',
      '内置示例可一键载入',
    ],
    inScope: ['文本粘贴', '按句切分与编号', '一键复制', '示例载入'],
    outOfScope: ['定时任务', '云端存储', '多人协作'],
    decisions: [
      {
        topic: '触发方式',
        title: 'A 一键执行更稳 / B 定时自动跑更省心',
        context: '免费层没有常驻进程，定时只能做成本地提醒。',
        a: {
          label: '一键执行',
          body: '粘贴后点一下，立刻出结果。',
          tradeoff: '可控，但要手动',
        },
        b: {
          label: '定时提醒',
          body: '每天固定时间提醒你来跑一次。',
          tradeoff: '更像自动化，但非全自动',
        },
      },
      {
        topic: '结果出口',
        title: 'A 复制结果 / B 导出文件',
        context: '你打算把结果发群里，还是存成文件？',
        a: {
          label: '复制到剪贴板',
          body: '一键复制，直接粘到聊天框。',
          tradeoff: '轻，适合即时分享',
        },
        b: {
          label: '导出为文件',
          body: '下载 .txt，方便归档。',
          tradeoff: '更适合留档',
        },
      },
    ],
  },
  其他: {
    goal: '把散落的脑洞钉成一块看板',
    summary: '一个轻量脑洞看板，随手记、随手删',
    acceptance: [
      '首屏有输入框与新增按钮',
      '卡片可删除',
      '刷新后卡片仍在',
      '空列表时有引导文案',
    ],
    inScope: ['快速新增', '卡片列表', '本地保存', '空状态引导'],
    outOfScope: ['多人协作', '拖拽排序', '提醒推送'],
    decisions: [
      {
        topic: '组织方式',
        title: 'A 清单更稳 / B 画布更自由',
        context: '脑洞是线性的，还是发散的？',
        a: {
          label: '清单式',
          body: '一条一条往下排，扫一眼就看完。',
          tradeoff: '清楚，但不够自由',
        },
        b: {
          label: '画布式',
          body: '卡片散落摆放，更接近脑暴现场。',
          tradeoff: '自由，但手机上容易乱',
        },
      },
      {
        topic: '气质',
        title: 'A 克制 / B 张扬',
        context: '这块看板会长期出现在你手机里。',
        a: {
          label: '克制',
          body: '低饱和 + 细边框，安静地待着。',
          tradeoff: '耐看',
        },
        b: {
          label: '张扬',
          body: '高对比色块 + 粗描边，像施工现场。',
          tradeoff: '有记忆点',
        },
      },
    ],
  },
};

function implicitPreference(prompt: string): string {
  if (/快|秒|马上|立刻|立刻|时间/.test(prompt)) {
    return '你反复提到“快”，所以首屏直接可操作，3 秒内能上手。';
  }
  if (/简单|轻|别太|不用|一键/.test(prompt)) {
    return '你说“简单”，于是砍掉了设置项，默认值就能直接跑。';
  }
  if (/好看|精致|颜值|风格/.test(prompt)) {
    return '你更在意“好不好看”，所以配色与排版优先于功能堆叠。';
  }
  return '一瞬脑洞意味着耐心有限，所以核心动作全部放在首屏。';
}

export function demoSpec(prompt: string, tag: Tag): Spec {
  const blueprint = BLUEPRINTS[tag];
  const title = shortTitle(prompt);
  return {
    summary: `${title}：${blueprint.summary}`,
    goal: blueprint.goal,
    inScope: blueprint.inScope,
    outOfScope: blueprint.outOfScope,
    acceptance: blueprint.acceptance,
    implicitPreference: implicitPreference(prompt),
    decisions: blueprint.decisions.map((seed, index) => ({
      id: `d${index + 1}`,
      index: index + 1,
      marker: index === 0 ? 'A' : 'B',
      title: seed.title,
      context: seed.context,
      optionA: { key: 'A', label: seed.a.label, body: seed.a.body, tradeoff: seed.a.tradeoff },
      optionB: { key: 'B', label: seed.b.label, body: seed.b.body, tradeoff: seed.b.tradeoff },
      status: 'OPEN',
      attempts: 0,
    })),
  };
}

/** “让施工队再试一版”时刷新裁决点文案，模拟换路径 */
export function retryDecision(decision: DecisionPoint, attempt: number): DecisionPoint {
  const suffix = attempt > 1 ? `（第 ${attempt} 次换路径）` : '';
  return {
    ...decision,
    attempts: attempt,
    title: `${decision.title}${suffix}`,
    optionA: {
      ...decision.optionA,
      body: `${decision.optionA.body} 这一版把风险再压低一点。`,
    },
    optionB: {
      ...decision.optionB,
      body: `${decision.optionB.body} 这一版更贴近你原话里的兴奋感。`,
    },
    status: 'OPEN',
    chosen: undefined,
  };
}

export function demoDelight(prompt: string, spec: Spec, artifact: Artifact): DelightItem[] {
  const explicit: DelightItem[] = [
    {
      requirement: `你原话：「${quotePrompt(prompt)}」`,
      response: `${artifact.title} 已按这段话落地，并做成可直接交互的成品。`,
      kind: 'EXPLICIT',
    },
    ...spec.acceptance.slice(0, 3).map((item) => ({
      requirement: item,
      response: '已完成，并在验收台逐项对照。',
      kind: 'EXPLICIT' as const,
    })),
  ];
  return [
    ...explicit,
    {
      requirement: '你没说，但我们在听',
      response: spec.implicitPreference,
      kind: 'IMPLICIT',
    },
  ];
}

export function demoReview(prompt: string, spec: Spec, artifact: Artifact) {
  return inspectArtifact(artifact.html, spec, prompt, artifact.round);
}

export function countAwaiting(projects: Project[]): number {
  return projects.filter((p) => p.status === 'AWAITING_USER' || p.status === 'PAUSED').length;
}
