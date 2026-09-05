# apps/gateway/src — Agent Gateway 源码总览

客户端（`apps/web`、`apps/desktop`）唯一的后端入口：HTTP + WebSocket 服务。
前端只认识网关；数据库、`learner-core`、Agent 适配器、LLM 都藏在它后面。

| 目录/文件 | 作用 |
|---|---|
| `server.ts` | 兼容 re-export（G3）：`GatewayServer` 已搬至 `runtime/gateway-runtime.js`，G5 删除本文件 |
| `index.ts` | 兼容入口：单例装配（`bootstrap/`）、`app`（`transport/http/create-app.js` 构建）、`GatewayAppType`、`startGatewayServer` |
| `bootstrap/` | 启动装配：`config`（端口/DB 路径）、`create-gateway`（依赖装配根）、`start-gateway`（监听生命周期） |
| `transport/` | 协议适配：`http`（路由组装 + 各域路由入口）、`websocket`（信封收发）、`tools`（跨域 Tool 入口与注册） |
| `runtime/` | Agent 运行时协调：`gateway-runtime`（原 GatewayServer）、会话/上下文/路由（仍在 `session/`、`context/`、`router/`，待收拢）、coach 与 turn 摘要 |
| `modules/` | 领域模块：`practice`、`learning-progress`、`review`、`library`、`curriculum`、`dictionary`（各含 `application`/`http`/`tools`/`persistence`，按需落地） |
| `infrastructure/` | 基础设施：门面（`drizzle/sqlite-learner-repository`）、`persistence`（repo 上下文/工具/语种）、`db`（schema、连接、迁移、seed） |
| `services/` | 仅剩 `learning-language-policy.ts`（混合职责，E 类拆分待定）；其余已归组 |
| `repository/` | 旧位置（已清空，见其 README）：门面与各域 SQL 已分别归位 `infrastructure/` 与 `modules/*/persistence/` |
| `tools/` | 旧位置（已清空，见其 README）：Tool 实现已按域归组到 `modules/*/tools/`，跨域入口与注册在 `transport/tools/` |
| `errors/` | 错误翻译：底层异常 → `BusinessError`（code/category/retryable/userMessage），禁止原始异常外泄 |
| `scripts/` | 运维脚本：一键检查、数据维护等 |
| `__tests__/` | 网关单测：装配、判题、WebSocket、Turn 汇总等 |
