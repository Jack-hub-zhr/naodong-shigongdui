# AGENTS.md · 脑洞施工队

本文件是施工队内部的「角色合同」。任何改动都必须先满足这里的边界与路由约定。

## 0. 工程约定

- Expo SDK 58 / React Native 0.88 / TypeScript / React Navigation v7（**不使用 Expo Router**，4 个 Tab 在 `src/navigation/RootTabs.tsx`）。
- 所有 UI 文案只能来自 `src/copy.ts`；品牌字段来自 `src/brand.ts`；颜色来自 `src/theme.ts`。禁止在页面里硬编码中文文案或颜色。
- 产品内命名固定：施工队、工种、施工日志、验收台、返工单、验收通过。
- 完成后必须运行：

```bash
npx tsc --noEmit
npx expo export --platform web
```

## 1. 四个工种

| 工种 | 代码入口 | 可以输出 | 绝对禁止 |
|---|---|---|---|
| 调度工种 Orchestrator | `src/state/store.ts` | 状态迁移、队列、日志、通知、暂停/恢复 | 写规格、写代码、做检查 |
| 产品工种 Product | `src/ai/crew.ts` → `runProduct` | `Spec`（目标、范围、验收标准、2—3 个裁决点） | 改代码、改已有产物 |
| 开发工种 Builder | `src/ai/crew.ts` → `runBuilder` | 单文件可交互 HTML 产物 | 改规格、替审查工种下结论 |
| 审查工种 Reviewer | `src/ai/reviewer.ts` + `runReviewNarrative` | findings / passed / 失败原因文案 | 改代码、改规格、用模型投票代替检查 |

审查必须是**程序化检查**（结构、关键元素、链接、事件、占位、长度等 11 项），模型只负责把失败原因说得像人话。检查不通过由调度工种触发返工。

## 2. 模型路由

配置：`src/ai/providers.ts` 的 `ROLE_ROUTES`。

| 工种 | 首选 | 第二 | 兜底 | 说明 |
|---|---|---|---|---|
| ORCHESTRATOR | Gemini 2.5 Flash | Groq Llama 3.3 70B | NVIDIA NIM | 质量优先 |
| PRODUCT | Groq Llama 3.3 70B | Gemini | NIM | 快速迭代 |
| BUILDER | Groq Llama 3.3 70B | Gemini | NIM | 快速迭代 |
| REVIEWER | Gemini 2.5 Flash | NVIDIA Nemotron | — | 必须与 Builder 不同模型家族 |
| PLEASER（取悦声明） | Gemini | Groq | NIM | 只写对照文案 |

规则：

- `routeFor(role, builderFamily)` 会为 REVIEWER 过滤掉与 Builder 同家族的提供商；若过滤后为空才回退。
- Builder 实际使用的家族由 `CompletionResult.family` 记录，并作为下一次审查的路由参数。
- 不允许为了「效果更好」让 Reviewer 使用 Builder 同家族模型。
- 不允许把多个用户的请求并发打到免费层；施工队永远串行（`CrewStore.pump`）。

## 3. 状态机

```
PENDING → BUILDING → REVIEWING → AWAITING_USER → REWORKING → DELIVERED
              ↘ PAUSED（QUOTA / NO_PROVIDER / ERROR）
```

- `AWAITING_USER` 同时承载「裁决点待选」和「最终待验收」，用 `project.pending.kind` 区分 `DECISION` / `FINAL`。
- 每个项目自检最多 3 轮；第 3 轮仍失败则记录已知风险并进入最终验收，不无限返工。
- 「提交返工单」= 回退到最近一个已裁决点 + 自动翻转 A/B 路径 + 重建，不允许推倒全部重来。
- 「让施工队再试一版」= 仅刷新当前裁决点选项文案与尝试次数，不改变状态机。
- 施工日志中带 `decisionMarker` 的条目允许回退；施工进行中回退会被拒绝并提示等这一轮结束。

## 4. 限流与故障转移

见 `src/ai/quota.ts` / `src/ai/client.ts`。

- 每家提供商独立 RPM 滑动窗口 + RPD 自然日计数。
- 429 → 指数退避（1s/2s/4s，上限 30s），单提供商最多 3 次。
- 失败或额度耗尽 → 按路由切下一家，施工不中断。
- 全部 RPD 耗尽 → 任务 `PAUSED`，文案「今日免费额度已用尽，明日自动继续」；次日启动自动恢复。
- 未配置任何 Key → `PAUSED`（NO_PROVIDER），提示打开演示模式或填写 `.env`。

## 5. 数据与持久化

- 项目、日志、裁决点、返工单、演示模式：`AsyncStorage`（`src/state/store.ts`）。
- 额度：`AsyncStorage` + 内存滑动窗口（`src/ai/quota.ts`）。
- 日志最多保留 200 条（`MAX_LOGS`）。
- 恢复时若项目卡在 `BUILDING` / `REVIEWING` / `REWORKING`，改回 `PENDING` 并按 `resumeTask` 续跑。

## 6. 演示模式

- `EXPO_PUBLIC_DEMO_MODE` 或「我的」页开关。
- 无 Key 时默认开启；演示脚本必须能完整走通：提交 → 规格 → 首轮缺失 → 审查失败 → 返工 → 裁决点 → 最终交付 → 返工单。
- 演示产物在 `src/demo/html.ts`，必须保留 `data-acceptance="A1..A4"` 标记供审查工种检查。

## 7. 完成标准

- `npx tsc --noEmit` 无错误。
- `npx expo export --platform web` 成功。
- Web 上可完成一次完整闭环，且 4 个 Tab 均可用。
- 不泄露 API Key 到日志或 UI；「我的」页只显示用量估算。
