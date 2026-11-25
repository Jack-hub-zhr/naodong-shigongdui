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
| `DATA_FILE` | 账号库路径，默认 `data/accounts.json` |

模型按顺序降级：`Qwen3.8-27B → Qwen3.6-27B → Qwen3.5-9B → Qwen3.5-397B-A17B → Pollinations openai-fast`。OVH 匿名额度约每个模型/IP/年 2 次；服务端额度用尽后，前端会自动改为浏览器直连，匿名额度按访问者 IP 重新计算。需要稳定额度时配置 `OVH_API_KEY`。

密钥只在服务端读取，浏览器不保存、不转发。账号密码用 `scrypt` 哈希，登录态是 30 天 Bearer token，数据库只存 token 的 SHA-256。

Render 免费实例没有持久磁盘：重新部署或实例重启后，`data/accounts.json` 会回到空库。需要长期保留账号时，挂载持久磁盘并设置 `DATA_FILE` 到该目录，或替换 `server/db.mjs` 为外部数据库。

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
