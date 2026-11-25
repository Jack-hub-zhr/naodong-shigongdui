# ForgeCrew

一句话说想法，五个人把它做出来：统筹者拆解、策划者定标准、编程者制作、检查者检查、打磨者打磨。只在需要你决定时停一次。

线上：https://forgecrew-studio.onrender.com

## 结构

- 项目列表：新建一句话，或打开最近的项目
- 项目页：理解 / 制作 / 检查 / 交付四段纵向推进，当前阶段展开，其余折叠
- 交付：打开、导出、分享、再做一版；10 分钟内可撤回验收
- 我的：外观、服务连接、历史项目与本地数据

## 技术栈

- 前端：原生 HTML / CSS / JS，无构建框架
- 后端：Node.js（`server/index.mjs`），只暴露 `POST /api/complete`
- 部署：Render 静态站 + Web 服务，GitHub Actions 按时段保活 API

## 本地运行

```bash
npm run build:web
node server/index.mjs
# http://localhost:3000
```

只调接口、不启前端：

```bash
PORT=3001 node server/index.mjs
curl localhost:3001/healthz
```

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `PORT` | 服务端口，默认 3000 |
| `OVH_API_KEY` | 可选。OVHcloud AI Endpoints 的 Key；不配也能匿名调用，但匿名额度极小 |
| `GROQ_API_KEY` | 推荐。Groq 免费层 Key，服务端优先走 `qwen/qwen3.8-27b`（约 30 RPM、1000 次/天） |
| `DASHSCOPE_API_KEY` | 推荐。阿里云百炼 Key，服务端优先走 `qwen-plus` |
| `MODELSCOPE_API_KEY` | 可选。魔搭 SDK Token，备用 `Qwen/Qwen3.8-27B` |
| `OPENROUTER_API_KEY` | 可选。OpenRouter Key，备用 `qwen/qwen3-coder:free` |
| `DASHSCOPE_BASE_URL` | 可选。覆盖百炼兼容端点，默认北京地域 |
| `DATA_FILE` | 账号库路径，默认 `data/accounts.json` |

模型按顺序降级：用户自带 Key → 服务端 `GROQ_API_KEY` / `DASHSCOPE_API_KEY` / `MODELSCOPE_API_KEY` / `OPENROUTER_API_KEY` → 匿名 `Qwen3.8-27B → Qwen3.6-27B → Qwen3.5-9B → Qwen3.5-397B-A17B → LLM7 gpt-oss:20b → Pollinations openai-fast`。OVH 匿名额度实测约每个模型/IP/年 1 次；LLM7 匿名约 30 RPM，可作为无 Key 兜底。要彻底稳定，至少配置一个 Groq 或百炼 Key；调研见 `docs/qwen-free-api.md`。

服务端 Key 只在进程内读取；用户自己填的 Key 存在本机 localStorage，请求时临时转发给本站服务端调用上游，不持久化、不随账号云同步、不写进项目。账号密码用 `scrypt` 哈希，登录态是 30 天 Bearer token，数据库只存 token 的 SHA-256。

Render 免费实例没有持久磁盘：重新部署或实例重启后，`data/accounts.json` 会回到空库。需要长期保留账号时，挂载持久磁盘并设置 `DATA_FILE` 到该目录，或替换 `server/db.mjs` 为外部数据库。

## 使用流程

- 打开页面后必须先注册或登录，账号是进入工作台的前置条件。
- 项目页支持随时暂停 / 继续；暂停会保留当前轮次、成品版本和聊天记录。
- 项目页和项目列表都支持删除任务；删除会同时移除本地与云端记录。
- 退出登录会立即回到登录门禁，未完成的任务会先转为暂停状态再保存。
- 项目页展示真实的团队交接记录：谁把拆解单、规格卡、版本、驳回单交给了谁，每个角色都有可见交付物。
- 成品的历史版本可打开预览，也可一键回到某一版；回退不会删除其他版本。
- 成品外壳样式只在成品没有自己的色板时兜底，避免深色外壳覆盖浅色页面造成浅底浅字。
- 团队聊天会真实调用统筹者模型回复；用户在聊天里提的新要求会记入 `extraRequirements`，下一轮制作自动带上，已交付项目可一键“按新要求再做一版”。
- 首次登录自动弹出两分钟使用说明，带当前界面截图，可随时关闭；右上角 `?` 和「我的」页也能重新打开。

## 路由

`/`、`/idea`、`/build`、`/review`、`/profile`、`/我的`

旧路由 `/review` 与中文别名 `/脑洞`、`/施工`、`/验收`、`/我的` 仍可直接打开。

`scripts/build-web.mjs` 会为每个路由生成独立 `index.html`，托管端没有 rewrite 时深链接也能直接打开。

## 产物约定

- 风格在开工前锁定：编辑风 / 瑞士网格 / 产品风
- 色、字、距、角、影来自 `tokens.json` 同源变量，不硬编码
- 12 项检查：结构、交互、首屏主张、占位文本、图片说明、三档宽度、默认样式等
- 成品是一个独立 HTML，可直接下载带走

## 目录

```
web/
  index.html          入口
  css/app.css         设计 token + 双主题
  js/main.js          路由、页面渲染、状态台、抽屉
  js/store.js         项目状态机与 localStorage 持久化
  js/pipeline.js      五角色编排、风格注入、检查、暂停/续跑
  js/api.js           /api/complete 客户端
  js/config.js        品牌、文案、角色、风格 token
server/index.mjs      API、静态资源、健康检查
scripts/build-web.mjs 静态构建
.github/workflows/    keepalive
```
