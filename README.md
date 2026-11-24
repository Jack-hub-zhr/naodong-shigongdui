# ForgeCrew

一句话脑洞进，施工队拆解、开发、自检、返工，只在关键分叉停下来问一次。

线上：https://forgecrew-studio.onrender.com

## 技术栈

- 前端：原生 HTML / CSS / JS，无构建框架
- 后端：Node.js（`server/index.mjs`），只暴露 `POST /api/complete`
- 部署：Render 静态站 + Web 服务，GitHub Actions 定时保活

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
| `DEEPSEEK_API_KEY` | 可选，配置后优先走 DeepSeek |
| `DEEPSEEK_BASE_URL` | 可选，默认官方地址 |
| `FREE_BASE_URL` / `FREE_MODEL` | 可选，覆盖默认免费通道 |
| `PORT` | 服务端口，默认 3000 |

密钥只在服务端读取，浏览器不保存、不转发。

## 路由

`/`、`/idea`、`/build`、`/review`、`/profile`

中文别名：`/脑洞`、`/施工`、`/验收`、`/我的`

`scripts/build-web.mjs` 会为每个路由生成独立 `index.html`，托管端没有 rewrite 时深链接也能直接打开。

## 目录

```
web/
  index.html          入口
  css/app.css         设计 token + 双主题
  js/main.js          路由、页面渲染、状态台、抽屉
  js/store.js         项目状态机与 localStorage 持久化
  js/pipeline.js      五角色编排、审查断言、暂停/续跑
  js/api.js           /api/complete 客户端
  js/config.js        品牌、文案、标签
server/index.mjs      API、静态资源、健康检查
scripts/build-web.mjs 静态构建
.github/workflows/    keepalive
```

## 接口

`POST /api/complete`

```json
{
  "role": "BUILDER",
  "system": "...",
  "user": "...",
  "json": false,
  "temperature": 0.7,
  "maxTokens": 3800
}
```

返回 `{ text, provider, model, family }`；错误按 `AUTH / QUOTA / RATE_LIMIT / NETWORK / PARSE` 分类。

`GET /healthz` 返回当前通道与运行时长，用于保活和排障。

## 部署

- 静态站发布 `dist/`，构建命令 `npm ci && npm run build:web`
- Web 服务启动命令 `node server/index.mjs`，健康检查 `/healthz`
- `.github/workflows/keepalive.yml` 每 10 分钟 ping 一次，避开免费实例冷却
