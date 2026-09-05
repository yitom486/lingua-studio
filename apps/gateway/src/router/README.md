# router/ · context/ · session/ — Agent 调度三件套

| 目录 | 作用 |
|---|---|
| `router/` | AgentRouter：按路由策略选择适配器（`codex` 或未来的 `acp`），把 Turn 交给具体 `AgentAdapter` |
| `context/` | `ContextSnapshot` 组装：前端/Gateway 已知的事实（题干、本次作答、语言等级、错题标签等）打包为不可变快照随 Turn 注入；禁止 Agent 用 Tool 反向索要 |
| `session/` | 会话管理：`AgentSession` 生命周期、流式 `AgentEvent` 转发、`submitToolResult` 回填 |
