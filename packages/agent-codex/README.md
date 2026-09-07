# Codex App Server 适配器

本包将 **Codex App Server**（`codex app-server`，stdio JSON-RPC）映射为 `agent-core` 的 `AgentAdapter` / `AgentSession`。

## 本机要求（与 VS Code Codex 插件同源）

1. 安装 [Codex CLI](https://chatgpt.com/codex)（本机需有 `codex` 命令）
2. 已登录：`codex login`（凭证落在 `~/.codex`，Windows 多为 `%USERPROFILE%\.codex`）
3. Lingua Studio **不另建登录**；Gateway 子进程继承 `USERPROFILE` / `HOME`，并设置 `CODEX_HOME` 指向同一目录

## 环境变量（可选）

| 变量 | 含义 | 默认 |
| --- | --- | --- |
| `STUDY_STUDIO_CODEX` | `0` 关闭真实 Codex，强制本地旁路 | `1` |
| `CODEX_BIN` / `CODEX_PATH` | CLI 路径 | 自动探测（含 Windows 安装目录） |
| `CODEX_HOME` | 配置与认证目录 | `~/.codex` |
| `STUDY_STUDIO_CODEX_CWD` | thread cwd | `process.cwd()` |
| `STUDY_STUDIO_CODEX_MODEL` | 默认模型覆盖 | CLI 默认 |
| `STUDY_STUDIO_CODEX_SANDBOX` | `read-only` / `workspace-write` / `danger-full-access` | `read-only` |
| `STUDY_STUDIO_CODEX_APPROVAL` | `never` / `on-request` / `untrusted` | `never` |
| `STUDY_STUDIO_CODEX_EFFORT` | 默认思考等级（`turn/start.effort`） | CLI/模型默认 |

## 审批（on-request）

- 策略 `never`：适配器自动 `accept`
- 策略 `on-request` / `untrusted`：经 Gateway WS `agent.approval.request` 下发；前端可回 `accept` / `acceptForSession` / `decline`
- 120s 未决断：自动 `decline`，并推送 `agent.approval.resolved`（`reason: timeout`）
- `thread/start` 与 `turn/start` 均可带 `approvalPolicy`

## 生成中引导（steer）

- 前端在 Turn 进行中发送 `client.turn.steer` → App Server `turn/steer`
- 需带当前 `expectedTurnId`；无活动 Turn 时返回业务错误

## 会话历史与协作模式

- `thread/list` / `thread/items/list` / `thread/archive` / `thread/name/set`
- `collaborationMode/list`；`turn/start.collaborationMode`（default / plan）
- `thread/start.ephemeral=false` 可落盘；前端可指定 `agentOptions.threadId` 恢复

## Gateway HTTP

- `GET /api/agent/codex/status` — 联动登录态探测（`account/read`）
- `GET /api/agent/codex/models` — 模型列表（`model/list`）
- `GET /api/agent/codex/threads` — 会话列表
- `GET /api/agent/codex/threads/:id/items` — 会话条目
- `POST /api/agent/codex/threads/:id/name` — 重命名
- `POST /api/agent/codex/threads/:id/archive` — 归档
- `POST /api/agent/codex/threads/:id/compact` — 压缩上下文（`thread/compact/start`）
- `POST /api/agent/codex/threads/:id/fork` — 分叉会话（`thread/fork`）
- `GET|POST /api/agent/codex/threads/:id/queue` — 队列列表 / 入队
- `DELETE /api/agent/codex/threads/:id/queue/:queuedId` — 移出队列项
- `POST /api/agent/codex/threads/:id/queue/start` — 启动队列项（HTTP；流式请用 WS `client.queue.start`）
- `GET /api/agent/codex/skills` — Skills 只读列表（`skills/list`）
- `GET /api/agent/codex/rate-limits` — 额度快照（`account/rateLimits/read`）
- `GET /api/agent/codex/mcp-servers` — MCP 状态只读（`mcpServerStatus/list`，非学习域工具总线）
- `GET /api/agent/codex/collaboration-modes` — 协作模式预设

### EXPERIMENTAL realtime（预留，无产品 UI）

> 对应 App Server `thread/realtime/*`。Gateway 只透传 RPC；**未接麦克风/扬声器/WebRTC 管线**，调用不保证成功，勿绑学习闭环。

- `GET /api/agent/codex/realtime/capability` — 探测本机是否响应 voices
- `GET /api/agent/codex/realtime/voices` — `thread/realtime/listVoices`
- `POST /api/agent/codex/realtime/:id/start|stop` — 启停
- `POST /api/agent/codex/realtime/:id/append-text|append-speech|append-audio` — 输入

WebSocket：
- `client.queue.start` → 流式消费队列下一项；turn 完成 payload 含 `queueRemaining`
- `agent.queue.changed` ← `thread/queue/changed`
- `agent.skills.changed` ← `skills/changed`
- `agent.realtime.*` ← `thread/realtime/*` 旁路通知（预留转发）

## 再生协议类型（可选）

```bash
codex app-server generate-ts --experimental -o packages/agent-codex/protocol-gen
```

生成物仅作对照，不进入 `tsc` 编译（体量过大）。

## 架构边界

- 禁止在 `apps/web` 引用本包或任何 Codex SDK
- Dynamic tools → Gateway `ToolRouter` / Registry 进程内执行；Client Tools 经 WS 下发
