# Study Studio

自适应多语种学习工作室（日语 / 英语 / 韩语）：FSRS 闪卡、靶向自适应出题、主观题多维批改、
错题本攻克流转、学情画像雷达。客户端只连接自研 Agent Gateway（HTTP + WebSocket），
学习资产以 SQLite（`learner-core` Repository）为唯一事实源，可整体换模型而不丢失。

顶层协作宪章见 [`AGENTS.md`](./AGENTS.md），所有参与者（人类与 AI Agent）必须遵守。

## 仓库结构

```text
apps/
  web/        React 19 + Vite + Tailwind 学习客户端（dev 端口 3000）
  gateway/    Agent Gateway：唯一后端屏障 + 领域调度中枢（默认端口 8080）
  desktop/    Tauri v2 桌面壳（frontendDist 复用 web/dist，Gateway 以 sidecar 拉起）
packages/
  shared/         Result/BusinessError、ID/时间、logger 门面
  protocol/       WS 信封/事件 + Zod 契约（题目、批改、计划、阅读、词典…）
  learner-core/   纯领域规则：FSRS、日计划、练习计划、画像/错题生命周期
  agent-core/     AgentAdapter / AgentSession / AgentEvent / ContextSnapshot 抽象
  tool-core/      Tool 契约、权限分级、ToolRegistry
  agent-codex/    Codex App Server 原生适配器（主力通路）
  agent-responses/轻量 responses 适配器（灰度/旁路）
docs/           架构、协议、学习者模型、MVP 路线等正式文档
```

## 快速开始

前置：Bun（见 `bun.lock`）、Node 类型；桌面端另需 Rust 工具链（`cargo`）。

```bash
bun install
bun run dev:gateway   # Agent Gateway（http://localhost:8080，/ws）
bun run dev:web       # 学习客户端（http://localhost:3000）
bun run dev:desktop   # Tauri 桌面壳（自动拉起 Gateway sidecar）
```

常用命令：

```bash
bun run typecheck   # 全仓严格类型检查（tsc -b），提交前必须零报错
bun test            # 全量单测（bunfig.toml 已忽略 dist 编译产物，只跑源码）
bun --filter @study-studio/web build   # Web 生产构建
```

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `GATEWAY_PORT` | `8080` | Gateway 监听端口 |
| `STUDY_STUDIO_DB` | 仓库根 `study-studio.db` | SQLite 库路径（桌面端由壳指向应用数据目录） |

## 脚本说明

仓库根 `scripts/` 为空目录，占位用，勿直接加零散脚本。真实脚本收归各包：

| 脚本 | 位置 | 用途 |
| --- | --- | --- |
| `sidecar:build` | `apps/gateway/scripts/build-sidecar.ts` | `Bun.build compile` 产出桌面端 sidecar 二进制到 `apps/desktop/src-tauri/binaries/`（gitignored，约 94MB，含 `bun:sqlite`） |
| `dictionary:import:oewn` | `apps/gateway/src/scripts/import-oewn.ts` | Open English WordNet 离线导入（默认 dry-run，`--apply` 才写库） |

## 文档索引

- 协作铁律：[`AGENTS.md`](./AGENTS.md)（业务↔厂商解耦、Gateway 边界、ContextSnapshot、Result 模式、测试标准）
- 系统架构：[`docs/architecture.md`](./docs/architecture.md)
- 通信协议：[`docs/protocol.md`](./docs/protocol.md)
- Agent 运行时：[`docs/agent-runtime.md`](./docs/agent-runtime.md)
- 学习者模型：[`docs/learner-model.md`](./docs/learner-model.md)
- 产品章程与路线：[`docs/project-charter.md`](./docs/project-charter.md)、[`docs/mvp-roadmap.md`](./docs/mvp-roadmap.md)
- Gateway 领域迁移基线：[`docs/gateway-g0-baseline.md`](./docs/gateway-g0-baseline.md)

`.studio-internal/`（gitignored，不进公开仓库）为实现期内部沉淀：静态数据登记、
AI Native 运行时设计、目标语种 UI 壳层、词典选型与各阶段计划。

## 词典数据与署名

离线词典均为按需安装、不预装进 Git 或前端 bundle：

- 英语 Open English WordNet（CC BY 4.0，Princeton WordNet 署名保留）
- 日语 JMdict（EDRDG，CC BY-SA 4.0；OJAD 仅允许用户主动打开深链，禁止爬取）
- 韩语 Kengdic（CC BY-SA 3.0 / LGPL 2.0）

新增静态数据、演示数据或规则时，必须登记到
`.studio-internal/STATIC-DATA-INVENTORY.md`（AGENTS.md §5）。
