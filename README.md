# 脑洞施工队（NaoDong ShiGongDui）

> 一瞬脑洞，Agent 施工队试错到验收。

用户只写一句话，施工队（多 Agent）在后台拆解、生成、程序化审查、返工，只在 2—3 个裁决点停下来让用户点一下。交付时附一份「取悦声明」，逐条对照用户原话。

- 技术栈：React Native 0.88 + Expo SDK 58 + TypeScript
- 支持：iOS / Android / Web 预览
- 包名：`com.naodongshigong.app`

---

## 1. 快速开始

```bash
npm install

# 可选：接入真实免费 API
cp .env.example .env
# 编辑 .env，填入 EXPO_PUBLIC_GROQ_API_KEY 等

npx expo start          # 扫码 / 模拟器
npx expo start --web    # 浏览器预览（App 会被限制在 560px 手机宽度）
npx expo start --android
npx expo start --ios
```

没有填任何 Key 时，App 会自动进入 **DEMO_MODE**，用 5 套预置脚本跑通完整闭环，不消耗任何额度，适合大赛演示。

类型检查与 Web 构建：

```bash
npx tsc --noEmit
npx expo export --platform web   # 产物在 dist/
```

---

## 2. 免费 API 的获取与限额

| 提供商 | 角色定位 | 免费模型 | RPM | RPD | 获取方式 |
|---|---|---|---|---|---|
| Groq | 产品 / 开发（快速试错轮） | Llama 3.3 70B | 30 | 14,400 | [console.groq.com/keys](https://console.groq.com/keys) → 登录 → Create API Key → `gsk_...` |
| Google Gemini | 调度 / 审查（质量轮） | Gemini 2.5 Flash | 5 | 1,500 | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Get API key（无需绑卡） |
| NVIDIA NIM | 故障转移兜底 | Llama 3.3 70B / Nemotron | 40 | 1,000（本项目保守值） | [build.nvidia.com](https://build.nvidia.com) → 注册 → Get API Key |

> Gemini 在中国大陆、港澳不在可用地区列表，需要代理或海外网络环境。
> Expo 客户端只读取 `EXPO_PUBLIC_` 前缀变量，请把 Key 填到 `.env` 的 `EXPO_PUBLIC_*_API_KEY` 中。

### 端点是 OpenAI 兼容还是原生

- Groq：`https://api.groq.com/openai/v1`（OpenAI 兼容）
- NVIDIA NIM：`https://integrate.api.nvidia.com/v1`（OpenAI 兼容）
- Gemini：`https://generativelanguage.googleapis.com/v1beta`（原生 `generateContent`）

---

## 3. 限流、退避与故障转移（代码位置）

核心实现：`src/ai/quota.ts`、`src/ai/client.ts`、`src/ai/providers.ts`。

1. **独立令牌桶**：每家提供商分别维护 RPM 滑动窗口（60 秒，内存）与 RPD 自然日计数（AsyncStorage 持久化）。
2. **429 指数退避**：`1s → 2s → 4s → …`，单次上限 30 秒；每轮最多重试 3 次，不立即失败。
3. **自动故障转移**：当前提供商额度耗尽、持续 429、Key 无效或网络失败时，按路由顺序切到下一家：Groq → Gemini → NVIDIA NIM。施工不中断。
4. **额度耗尽 → PAUSED**：所有提供商当日 RPD 都用完时，任务进入 `PAUSED`，日志写「今日免费额度已用尽，任务暂停，明日自动继续」，不报错。次日启动 App 会自动恢复并继续。
5. **串行施工**：全局只有一个施工队列（`CrewStore.pump`），一次只跑一个脑洞，避免多个请求同时打到同一免费层触发滥用标记。

「我的」页顶部可看到各提供商今日剩余额度估算（只展示用量，不暴露 Key）；还可以打开「模拟额度耗尽」开关，演示 PAUSED 和自动恢复。

---

## 4. 施工队：工种边界与模型路由

| 工种 | 职责 | 允许做 | 禁止做 | 首选 → 兜底 |
|---|---|---|---|---|
| 调度工种 Orchestrator | 拆解、派发、暂停、回退、交付 | 状态机与调度 | 不写规格、不写代码、不做检查 | Gemini → Groq → NIM |
| 产品工种 Product | 把原话翻译成功能规格与裁决点 | 输出 `Spec` | 不改代码 | Groq → Gemini → NIM |
| 开发工种 Builder | 按规格产出单文件 HTML | 写/改产物 | 不改规格 | Groq → Gemini → NIM |
| 审查工种 Reviewer | 程序化检查并报告 | 运行 11 项 regex/结构检查 | 不改代码、不改规格、不以模型投票代替检查 | Gemini → NIM |

同源偏见保护：审查工种会读取开发工种实际使用的模型家族，并跳过同家族提供商。例如 Builder 用 Llama（Groq），Reviewer 就走 Gemini；Gemini 不可用时退到 NVIDIA 的 Nemotron。

状态机（`src/state/store.ts`）：

```
PENDING → BUILDING → REVIEWING → AWAITING_USER → REWORKING → DELIVERED
                             ↘ PAUSED（额度耗尽 / 无 Key / 连续故障）
```

要点：

- 每个脑洞最多自检 3 轮；仍不通过则标注「已知风险」交给用户，不无限循环。
- 裁决点逐个人工确认，选择后继续构建；「让施工队再试一版」只刷新当前裁决点的方案文案，不推倒重来。
- 最终验收点「提交返工单」会回退到最近一个已裁决点，自动翻转到另一条路径重建。
- 施工日志里带决策点 A / B 标记的条目可点击回退（施工进行中会提示等这一轮结束）。

---

## 5. 四个 Tab

| Tab | 内容 |
|---|---|
| 脑洞 | 多行输入、标签（工具 / 小游戏 / 页面 / 自动化 / 其他）、示例、最近脑洞；按钮「施工队进场」 |
| 施工 | 实时施工日志（时间戳 + 工种标签）、状态 Stepper、裁决点回退、PAUSED / 待验收提示 |
| 验收 | 裁决卡（选 A / 选 B / 让施工队再试一版）、最终验收卡（可交互预览 + 取悦声明 + 验收通过 / 提交返工单） |
| 我的 | 三家额度、演示模式开关、额度模拟、历史脑洞筛选、导出 / 分享、重置 |

---

## 6. DEMO_MODE

`EXPO_PUBLIC_DEMO_MODE`：

- `true`：强制预置脚本，不调 API。
- `false`：强制真实 API。
- 留空：没有配置任何 Key 时自动为 `true`，否则 `false`。

演示脚本覆盖 5 种标签的成品，首轮会故意缺失 1—2 个验收标准，触发审查失败与返工，再补齐通过，用来展示「试错」而不是「一次生成」。

---

## 7. 目录结构

```
App.tsx                     App 壳：SafeArea / 导航 / 通知条 / 启动页
src/
  brand.ts                  品牌字段与工种名
  theme.ts                  色板、间距、字号
  copy.ts                   全部 UI 文案
  types.ts                  项目、日志、规格、裁决点等类型
  navigation/RootTabs.tsx   4 个 Tab + 验收角标
  screens/                  脑洞 / 施工 / 验收 / 我的
  state/
    store.ts                施工队状态机、队列、持久化、全部用户动作
    CrewProvider.tsx        useSyncExternalStore 绑定
  ai/
    providers.ts            提供商配置、角色路由、同源偏见过滤
    quota.ts                RPM/RPD 令牌桶
    client.ts               真实请求、退避、故障转移
    prompts.ts              四类提示词与宽松 JSON 解析
    reviewer.ts             程序化审查
    crew.ts                 四个工种的执行封装
  demo/
    content.ts              规格、裁决点、取悦声明等演示数据
    html.ts                 5 套可交互成品 HTML
  services/                 通知、导出 / 分享
  ui/                       组件（裁决卡、最终验收卡、日志、预览等）
```

---

## 8. 安全提示

Expo 的 `EXPO_PUBLIC_*` 变量会被打进客户端包，任何人解包都能看到。本项目按大赛 / 本地演示场景设计，Key 只放免费层。若要上架生产环境，请把 API 调用移到自己的后端代理，客户端只拿短期令牌。

---

## 9. 打包

```bash
npx eas-cli@latest build -p android --profile preview
npx eas-cli@latest build -p ios --profile preview
```

首次使用需 `eas login` 与 `eas init`。`app.json` 已配置包名、图标、启动图、通知权限说明与 splash 背景色。
