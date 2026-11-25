# 免费 Qwen API 接入调研（2026-11）

结论先说：**没有任何公开、免 Key、还能稳定承载整站调用的 Qwen 接口。** 免 Key 的 OVH 与 Pollinations 都只能当临时兜底；要真正稳定，必须至少配置一个服务商 Key。额度会调整，以下数字以服务商当期页面为准。

## 四条可选路线

| 路线 | 免费额度 | 端点 | 适合 |
| --- | --- | --- | --- |
| 阿里云百炼 DashScope | 实名后通常每个模型独立 100 万 Token、90 天（以控制台为准） | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | 主力。OpenAI 兼容，`qwen-plus` 稳定，地域多限华北2（北京） |
| 魔搭 ModelScope API-Inference | 注册并绑定阿里云、实名；按模型每日免费配额 + 魔粒 | `https://api-inference.modelscope.cn/v1/chat/completions` | 第二顺位。可跑 `Qwen/Qwen3.8-27B`，官方明确不适合高并发和 SLA 线上业务 |
| OpenRouter | 免费模型约 20 RPM；日额度存在 50 / 200 / 1000 的口径差异，以实际 429 为准 | `https://openrouter.ai/api/v1/chat/completions` | 轻量兜底。`qwen/qwen3-coder:free`，免费名单会轮换 |
| Cloudflare Workers AI | 10,000 Neurons / 天 | `https://api.cloudflare.com/client/v4/accounts/<account>/ai/run/...`（非标准 OpenAI 兼容） | 备选。`@cf/qwen/qwen3.8-27b`，有 4006 限额不按 UTC 正常重置的社区反馈 |

## 本项目已接入什么

服务端现在按这个顺序尝试：

1. 用户在「我的 → Qwen 直连」里填的本机 Key（只存在浏览器，不进入账号同步）
2. 服务端环境变量里的 Key：`DASHSCOPE_API_KEY`、`MODELSCOPE_API_KEY`、`OPENROUTER_API_KEY`
3. 原有匿名链：OVH Qwen × 4 → Pollinations `openai-fast`

百炼、魔搭、OpenRouter 都走同一套 OpenAI-compatible 请求与响应解析。某个 Key 失效会冷却 10 分钟，再往下走，不会把整站卡死。

### 服务端配置（推荐，所有访客共享）

在 Render 的 API 服务里加一个环境变量即可：

```text
DASHSCOPE_API_KEY=sk-...
```

可选覆盖：

```text
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
MODELSCOPE_API_KEY=ms-...
OPENROUTER_API_KEY=sk-or-v1-...
```

### 用户自己填 Key

「我的」页有 Qwen 直连面板，支持选择百炼 / 魔搭 / OpenRouter，保存到本机 localStorage。保存后，制作和聊天请求都会带上这个 Key；清掉就回到公共链。请求时 Key 只临时交给本站服务端转发，不持久化，不写进项目 JSON，也不随账号云同步。

## 为什么不直接用免 Key 的公共端点

- OVH 匿名额度实测约每个模型 / IP / 年 2 次，响应头会出现 `x-ratelimit-limit-year: 2`。
- Pollinations 匿名约 1 次 / 45 秒 / IP，免费模型只有 `openai-fast`，不是 Qwen。
- 免 Key 端点没有 SLA，随时可能 402 / 429 / 503；把它们当主力，就会表现成“服务器老是断”。

## 官方资料

- 百炼免费额度：https://platform.qianwenai.com/docs/resources/free-quota
- 百炼兼容模式：https://docs.qwencloud.com/resources/free-quota
- 魔搭 API-Inference 限制：https://www.modelscope.ai/docs/model-service/API-Inference/limits
- OpenRouter 限制：https://openrouter.ai/docs/limits
- Cloudflare Workers AI 定价：https://developers.cloudflare.com/workers-ai/platform/pricing
- Cloudflare Workers AI 限制：https://developers.cloudflare.com/workers-ai/platform/limits
