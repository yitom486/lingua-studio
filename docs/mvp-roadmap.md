# Study Studio - 渐进式里程碑路线图 (MVP Roadmap)

> **文档版本**：v1.0  
> **维护责任人**：首席架构师 / 技术负责人  
> **迭代策略**：以学习能力（卡片/做题/AI出题批改/错题本）为第一核心，小步快跑，层层验证，逐步拓展教材与多媒体。

---

## 里程碑全景一览

```
[ M0: 架构骨架与基座 ] ──► [ M1: Agent 通信闭环 ] ──► [ M2: 学习者模型与错题本 ]
                                                              │
┌─────────────────────────────────────────────────────────────┘
▼
[ M3: 卡片与做题界面 ] ──► [ M4: AI 靶向出题与深度批改 ] ──► [ M5: 教材导入/多媒体/多端 ]
```

---

## M0: Bun Monorepo 架构骨架与类型基座 (当前阶段)

- **核心目标**：建立严格类型安全、单向依赖分明、开发运行极速的工程底座。
- **交付物 (Deliverables)**：
  - `package.json`（配置 `bun workspaces`）与严格模式 `tsconfig.base.json`。
  - 核心 Packages：`packages/protocol`, `packages/shared`, `packages/learner-core`, `packages/agent-core`, `packages/tool-core`, `packages/agent-codex`。
  - 核心 Apps 骨架：`apps/gateway`, `apps/web`。
  - 单元测试与类型检查命令链。
- **验收标准 (Acceptance Criteria)**：
  - `bun install` 秒级链接无任何报错。
  - `bun run typecheck`（`tsc -b`）跨包类型推断 100% 通过，无 `any` 警告。
  - `bun test` 基础单测全部绿灯。

---

## M1: Gateway 双向通信与 Codex 原生 Agent 运行时

- **核心目标**：打通客户端与 Agent Gateway 之间的 WebSocket 双向流式通信，完成 `CodexAdapter` 对 Codex App Server 的深度原生集成。
- **交付物 (Deliverables)**：
  - Gateway WebSocket Server（支持 `WsEnvelope` 编解码、会话维护与心跳保活）。
  - `CodexAdapter` 原生实现（Thread 创建、Turn 启动、Item 流式转发）。
  - Context Snapshot 动态装配器（`ContextBuilder`）。
  - 动态工具 (Dynamic Tools) 注入与结果回传闭环。
- **验收标准 (Acceptance Criteria)**：
  - 客户端通过 WebSocket 发送消息，能实时收到 `agent.text.delta` 逐字流式返回。
  - Agent 能正确发起 `tool_call` 并成功接收网关返回的 `tool_result`。
  - 异常断线能基于 `sessionId` 恢复状态。

---

## M2: 学习者画像引擎、错题本与 FSRS 算法

- **核心目标**：在 Gateway 与领域核心中落地学习者多维画像计算、错题本归因体系与 FSRS 记忆衰减算法。
- **交付物 (Deliverables)**：
  - `packages/learner-core` 中的 FSRS 调度算法实现。
  - 优势与薄弱项量化评估器（识别高频出错知识点并打上 Weakness 标签）。
  - 错题本领域逻辑（错因分类、订正重练、彻底攻克状态流转）。
  - 基于 SQLite / 内存的 `LearnerRepository` 持久化实现。
- **验收标准 (Acceptance Criteria)**：
  - 单测覆盖 FSRS 算法在各种评级 (`AGAIN`/`HARD`/`GOOD`/`EASY`) 下的间隔计算。
  - 用户连续 2 次做错同一考点后，该考点自动晋级为 `WEAKNESS` 标签。
  - 错题重做连续正确 2 次后，状态自动更新为 `isResolved: true`。

---

## M3: 现代 Web 学习客户端 (卡片复习与做题练习)

- **核心目标**：基于 React 19 + Tailwind + shadcn/ui 打造响应迅捷、高颜值的 Web 学习界面。
- **交付物 (Deliverables)**：
  - **学习卡片模块**：生词卡与语法卡翻转交互、FSRS 评级快捷键（1/2/3/4）。
  - **交互做题模块**：单选题、完形填空题答题卡，支持 0ms 本地秒级比对判定。
  - **能力雷达图模块**：展示学习者在词汇、语法、听力等维度的优势与缺陷。
  - **错题本复盘界面**：按错因分类筛选、一键发起错题重练。
- **验收标准 (Acceptance Criteria)**：
  - Web 端在 Chrome / Edge 中流畅运行，首屏加载小于 1 秒。
  - 客观题作答无需等待网络大模型往返，就地反馈正误。

---

## M4: AI 靶向自适应出题与智能批改闭环

- **核心目标**：将学习者薄弱画像与 AI Agent 闭环打通，实现“测出弱点 -> 定向出题 -> 智能批改 -> 沉淀错题”的全自动化教学。
- **交付物 (Deliverables)**：
  - 服务端工具 `quiz.generateAdaptive`：基于当前 Top 弱项生成针对性练习。
  - 服务端工具 `quiz.gradeSubmission`：针对主观翻译/造句的多维深度诊断。
  - 自动沉淀流水线：批改完成后无缝触发错题入库与画像指标更新。
- **验收标准 (Acceptance Criteria)**：
  - AI 生成的试题 100% 符合 Zod Schema，绝不出现格式错乱或超纲。
  - 主观题批改能准确指出语法错误、母语负迁移原因并给出地道润色。

---

## M5: 教材导入、PDF 交互阅读、多媒体扩展与多端发布

- **核心目标**：支持《标日》、《大家的日语》等教材结构化抽取、按需加载交互式 PDF 阅读器、音视频辅助播放器与 Tauri 桌面端封装。
- **交付物 (Deliverables)**：
  - 教材结构化知识树（Textbook AST）解析与卡片一键导入。
  - 基于 `pdfjs-dist` 的动态懒加载 PDF 阅读器（透明 Text Layer 划词即查与 Context 提问）。
  - 多媒体播放器组件（支持音频短句切片、听力跟读与字幕点选）。
  - `apps/desktop` Tauri v2 打包配置，产出 Windows / macOS 安装包。
- **验收标准 (Acceptance Criteria)**：
  - 导入教材章节后可直接生成该课生词卡；
  - 桌面客户端包体积小于 20MB，离线本地秒开。
