# modules/practice — 练习领域模块（G1 试点）

练习模板、运行、装配、提交、复盘归属本模块。HTTP 路由（G2）与
persistence（G4）暂未搬迁，仍在 `index.ts` / `repository/domains/`。

| 路径 | 内容 |
|---|---|
| `application/practice-assembly.ts` | 按块装配题目（已知依赖：具体 Drizzle 仓储类型 + `learning.content` Tool 输入输出类型，G1 保持原样，后续 E 解耦） |
| `application/practice-grading.ts` | 客观题权威判题纯函数，无内部依赖 |
| `application/practice-proposal.ts` | AI 建议 propose + 用户确认 apply（TTL、一次性消费；依赖 `services/learning-analysis.js` 的 `AnalysisSnapshot` 类型） |
| `application/practice-summary.ts` | 运行复盘（只读 run + attempts，AI/local 双源），仅依赖 packages |
| `__tests__/` | assembly / grading / phase-d 单模块测试；`practice-collect.test.ts` 仍在根 `__tests__`（测 HTTP，需 `app`） |
| `tools/` | learning-practice、learning-assess、grade-subjective-quiz、generate-adaptive-quiz（G3 已归组，公开 name/schema 不变） |
| `http/` | 练习域路由（G2 已抽取） |

依赖说明：`application/practice-assembly.ts` 经结构化 `ContentToolLike`
消费内容生成能力，对 `transport/tools/learning-content-tool.js` 仅为
`import type`（无运行时依赖）；Tool 与 HTTP 是同一用例的两个入口。
