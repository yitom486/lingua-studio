# tools/ — Agent 工具定义与执行

学习闭环工具的一等公民：注册为 Server/Client Tool，由 Adapter 以原生
tool_call 注入运行时，经 ToolRouter 进程内调度，结果经 `submitToolResult` 回填。

| 文件 | 作用 |
|---|---|
| `learning-content-tool.ts` | 教材/阅读/练习内容工具：生成题目并可持久化到 `practice_collections` / `practice_items` |

约束：MCP 仅作外部异构系统（Anki/Notion 等）桥接，不得重写本已可原生调用的学习域工具。
