# runtime/ — 通用 Agent 运行时协调（非学习领域）

| 文件 | 作用 |
|---|---|
| `gateway-runtime.ts` | `GatewayServer`：会话/流式事件编排、Tool 调度、Adapter 接线（原 `src/server.ts`，G3 搬入；`src/server.ts` 兼容 stub 已在 G5 删除） |
| `responses-lite-coach.ts` | 轻量旁路教练（快问快答），学习闭环默认走 Codex |
| `turn-summary-builder.ts` | Turn 执行摘要与失败回退文案 |
| `session-manager.ts`（在 `session/`）、`context-builder.ts`（在 `context/`）、`agent-router.ts`/`tool-router.ts`（在 `router/`） | 会话、上下文快照、路由/工具分发，待收拢进本目录 |

约束：领域模块不得（值）引用运行时协调器；`module-boundaries.test.ts` 强制执行。
