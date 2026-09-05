# apps/gateway/src — Agent Gateway 源码总览

客户端（`apps/web`、`apps/desktop`）唯一的后端入口：HTTP + WebSocket 服务。
前端只认识网关；数据库、`learner-core`、Agent 适配器、LLM 都藏在它后面。

| 目录/文件 | 作用 |
|---|---|
| `server.ts` | Agent 运行时协调器（`GatewayServer`）：注册 Tools、构造 Adapter、管理会话/流式事件并编排业务；不是监听入口 |
| `index.ts` | Hono 应用主体：路由注册、请求校验、调 `repository`/`services`、统一错误返回；也是启动入口（`Bun.serve`，端口 `GATEWAY_PORT`，默认 8080） |
| `router/` | Agent Turn 路由：按策略选择适配器（codex 等），转发 Turn |
| `context/` | `ContextSnapshot` 组装：把已知事实（题干、作答、语言等级等）打包随 Turn 注入 |
| `session/` | Agent 会话管理：会话生命周期、事件与 `submitToolResult` 回填 |
| `services/` | 领域服务（practice 四个服务 G1 已搬至 `modules/practice/application/`，见其 README） |
| `repository/` | 持久层实现：`drizzle-learner-repository.ts` 对接 SQLite（`learner-core` 契约的实现方） |
| `db/` | SQLite 表结构（`schema.ts`）、建表与迁移（`index.ts`） |
| `tools/` | Server/Client Tool 定义与执行：出题、批改、错题入库等，经 ToolRouter 调度 |
| `errors/` | 错误翻译：底层异常 → `BusinessError`（code/category/retryable/userMessage），禁止原始异常外泄 |
| `scripts/` | 运维脚本：一键检查、数据维护等 |
| `__tests__/` | 网关单测：装配、判题、WebSocket、Turn 汇总等 |
