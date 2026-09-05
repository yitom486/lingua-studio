# Codex App Server 适配器

本包将 **Codex App Server**（`codex app-server`，stdio JSON-RPC）映射为 `agent-core` 的 `AgentAdapter` / `AgentSession`。

## 本机要求

1. 安装 [Codex CLI](https://chatgpt.com/codex)（本机需有 `codex` 命令）
2. 已登录：`codex login`
3. Gateway 环境变量（可选）：

| 变量 | 含义 | 默认 |
| --- | --- | --- |
| `STUDY_STUDIO_CODEX` | `0` 关闭真实 Codex，强制本地旁路 | `1` |
| `CODEX_BIN` / `CODEX_PATH` | CLI 路径 | `codex` |
| `STUDY_STUDIO_CODEX_CWD` | thread cwd | `process.cwd()` |
| `STUDY_STUDIO_CODEX_MODEL` | 模型覆盖 | CLI 默认 |
| `STUDY_STUDIO_CODEX_SANDBOX` | `readOnly` 等 | `readOnly` |
| `STUDY_STUDIO_CODEX_APPROVAL` | `never` 等 | `never` |

## 再生协议类型（可选）

```bash
codex app-server generate-ts --experimental -o packages/agent-codex/protocol-gen
```

生成物仅作对照，不进入 `tsc` 编译（体量过大）。

## 架构边界

- 禁止在 `apps/web` 引用本包或任何 Codex SDK
- Dynamic tools → Gateway `ToolRouter` / Registry 进程内执行
