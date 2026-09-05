# Codex App Server 适配器

本包将 **Codex App Server**（`codex app-server`，stdio JSON-RPC）映射为 `agent-core` 的 `AgentAdapter` / `AgentSession`。

## 本机要求（与 VS Code Codex 插件同源）

1. 安装 [Codex CLI](https://chatgpt.com/codex)（本机需有 `codex` 命令）
2. 已登录：`codex login`（凭证落在 `~/.codex`，Windows 多为 `%USERPROFILE%\.codex`）
3. Study Studio **不另建登录**；Gateway 子进程继承 `USERPROFILE` / `HOME`，并设置 `CODEX_HOME` 指向同一目录

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

## Gateway HTTP

- `GET /api/agent/codex/status` — 联动登录态探测（`account/read`）
- `GET /api/agent/codex/models` — 模型列表（`model/list`）

## 再生协议类型（可选）

```bash
codex app-server generate-ts --experimental -o packages/agent-codex/protocol-gen
```

生成物仅作对照，不进入 `tsc` 编译（体量过大）。

## 架构边界

- 禁止在 `apps/web` 引用本包或任何 Codex SDK
- Dynamic tools → Gateway `ToolRouter` / Registry 进程内执行；Client Tools 经 WS 下发
