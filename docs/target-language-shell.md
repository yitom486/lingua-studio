# 目标语种 UI 壳层（已验收，G1–G4）

> 由 `.studio-internal/TARGET-LANGUAGE-UI-SHELL.md`（2026-09-06 全波次验收通过）毕业沉淀。
> 原文已归档删除；本文件只保留 durable 契约，过程性讨论不保留。

## 双语言轴（最高优先级概念）

- **A. `uiLocale`（界面母语）**：默认 zh-CN，按钮/侧栏/设置文案保持中文，**不做整站 i18n**。
- **B. `targetLanguage`（学习目标语种轨道）**：`ja | en | ko`，由 `studyGoal` 推导
  （`JLPT_*` → ja，`CET*` / `KAOYAN_EN` → en，`TOPIK_*` → ko）。
  它决定：题库分区、模块可见性、雷达技能集、AI Snapshot、阅读默认语种、Gateway 写入 `language` 戳。

## 壳层契约

1. **单一配置源**：`apps/web/src/learning/learning-shell.ts`（`LEARNING_SHELL_CONFIGS`）+
   `useLearningShell()` 订阅 `profile.targetLanguage`。禁止复制三份 App / Sidebar。
2. **模块可见性**：`allowedTabs` 按轨道过滤侧栏（`AppSidebar`）；
   JA 专属（KANA / PITCH / TEXTBOOK / SHADOWING）在 en/ko 轨道隐藏，
   ko 用 `comingSoonModules` 灰显 + `interimBanner`（`koreanInterim`）。
3. **非法 Tab 守卫**：`App.tsx` 经 `resolveGuardTab` 重定向（如 EN+KANA→QUIZ，
   KO+WRITING→READING），切换轨道时按 `key={shell.track}` 重挂载。
4. **数据隔离**：学习域 `useQuery` 的 `queryKey` 必须带 `targetLanguage`
   （教材查询按 `userId` 隔离、kana 为 JA 唯一底座、news-topics 语言中立，三者书面豁免，
   见 `textbooks-annotations.ts` 注释）。
   保存 profile 后必须 `invalidateQueries` 全学习域。
5. **AI 语境**：`ContextSnapshot.targetLanguage` 与 profile 一致；
   Tutor 开场白/离线兜底按轨道分支（`copy/tutor-track-copy.ts`），不断线引导走轨道文案 SSOT。
6. **Gateway 侧**：`learner_language_profiles` + 资产表 `language` 列隔离；
   仓储读写默认按当前语种过滤，切换语种不丢另一语种数据。

## 反模式（禁止重犯）

- 把 `uiLocale` 和 `targetLanguage` 揉成一个开关；en 轨道展示日语种子句当材料（宁可空态）；
- 只改 Badge 文案不 `invalidateQueries`；为 ko 伪造完整 TOPIK 题库又不登记静态清单；
- 前端直连 DB 或 LLM（见 `AGENTS.md` §1）。

## 验收脚本

- `bun apps/gateway/scripts/shell-acceptance.mjs`（需 Gateway `localhost:8080`）
- `bun apps/gateway/scripts/scan-web-vendor-sdk.mjs`（确认 `apps/web` 无厂商 SDK）
