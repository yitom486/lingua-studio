# tools/（旧位置，已清空）

G3 迁移：全部 Tool 已归组，**本目录不再放实现文件**：

| 新位置 | 内容 |
|---|---|
| `modules/practice/tools/` | learning-practice、learning-assess、grade-subjective-quiz、generate-adaptive-quiz |
| `modules/learning-progress/tools/` | learning-progress |
| `modules/library/tools/` | learning-library |
| `modules/curriculum/tools/` | learning-curriculum |
| `modules/dictionary/tools/` | dictionary-lookup |
| `transport/tools/` | 跨域兼容入口 learning-plan、learning-content、ui-command-tools + `register-tools.ts`（装配根调用） |

学习闭环工具的一等公民：注册为 Server/Client Tool，由 Adapter 以原生
tool_call 注入运行时，经 ToolRouter 进程内调度，结果经 `submitToolResult` 回填。

约束：MCP 仅作外部异构系统（Anki/Notion 等）桥接，不得重写本已可原生调用的学习域工具。
