# repository/ — 持久层实现

实现 `packages/learner-core` 定义的 Repository 契约，当前后端为 SQLite（Drizzle），
未来可换 PostgreSQL 而不改业务调用方。

| 文件 | 作用 |
|---|---|
| `drizzle-learner-repository.ts` | 全部读写实现：练习计划/运行、题目尝试、收藏、复习、统计等；`getPracticeRunItems` 按 run 聚合题目，供权威判题使用 |
