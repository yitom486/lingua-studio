# services/ — 领域服务

无状态的业务规则层，被 `index.ts` 路由调用，读写经 `repository/`。

> G1 迁移：practice 四个服务（assembly / grading / proposal / summary）已搬至
> `modules/practice/application/`；对应测试归组到 `modules/practice/__tests__/`。
> 旧路径不保留 re-export，引用方均已更新。

| 文件 | 作用 |
|---|---|
| `practice-assembly.ts` | 按练习块语义从既有资产装配题目到 `practice_collections`（关联 runId/blockId/grading_mode） |
| `practice-grading.ts` | 客观题服务端权威判题纯函数 `gradeObjectiveAnswer`：选择/排序精确匹配、填空含可接受变体；题目缺失时返回非权威回退 |
