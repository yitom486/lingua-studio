# db/ — SQLite 表结构与迁移

| 文件 | 作用 |
|---|---|
| `schema.ts` | 表定义：`practice_collections` / `practice_items`、文档、批注、复习卡、统计等 |
| `index.ts` | 建表语句与增量迁移（如 `plan_run_id`、`block_id`、`grading_mode` 列）；`:memory:` 用于单测 |
