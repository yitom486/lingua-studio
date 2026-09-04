# Study Studio - 智能体协作与工程开发守则 (AGENTS.md)

> 本文档是所有参与本工程（包括人类工程师与 AI Agent）必须严格遵守的**顶层宪章与不变量准则**。
> 任何代码变更如果违反以下规则，一律视为架构违规。

---

## 1. 架构不变量与边界铁律 (Architectural Invariants)

### 1.1 业务与模型厂商强解耦 (Zero Provider Leak)
- **禁止在核心业务中直接引用外部 SDK**：
  - `packages/learner-core`、`packages/tool-core`、`packages/protocol`、`apps/web` 绝对禁止 `import` 任何具体 AI 厂商库（如 `@openai/*`, `@anthropic/*`, `codex-*`, `acp-*`）。
  - 外部模型交互**必须且仅能**通过 `packages/agent-core` 中定义的抽象契约：`AgentAdapter`、`AgentSession`、`AgentEvent`。
  - 具体引擎代码（如 Codex App Server）必须完全封装在专有适配器中（如 `packages/agent-codex`）。

### 1.2 客户端通信唯一屏障 (Gateway Boundary)
- 客户端（Web 端 `apps/web`、桌面端 `apps/desktop`）**只连接系统自研的 Agent Gateway**（HTTP + WebSocket）。
- 客户端绝不直连任何 LLM 端点，不对底层是 Codex 还是其他模型产生任何感知。

### 1.3 上下文快照与工具调用的刚性边界 (Context vs Tools)
- **已知事实走快照**：题干内容、用户本次作答、用户语言等级、最近连续出错标签等界面已知事实，必须由前端或 Gateway 组装为不可变 `ContextSnapshot` 随 Turn 注入。
- **严禁反向 Read Tool 往返**：绝不允许 Agent 通过调用 `getCurrentQuestion()`、`getUserAnswer()` 等工具向客户端重复索要界面已知数据。
- **Tool 只用于未知与变更**：Tool 仅用于查询外部未知数据（权威词典检索）或触发持久化状态写入（错题入库、熟练度回写）。

---

## 2. 错误处理机制与链条规范 (Error Handling & Result Pattern)

### 2.1 强制采用 `Result<T, BusinessError>` 模式
- 在领域模型、工具执行（`Tool.execute`）、适配器调用及数据仓库层，**尽可能避免随意的 `throw new Error()`**，全面采用 Rust 风格的 `Result<T, E>`：
  ```typescript
  import { ok, err, Result, BusinessError } from '@study-studio/shared';

  export async function gradeAnswer(input: Submission): Promise<Result<GradingResult, BusinessError>> {
    if (!isValid(input)) {
      return err(new BusinessError('E_INVALID_INPUT', '提交的内容格式不正确', 'VALIDATION'));
    }
    return ok(computedResult);
  }
  ```

### 2.2 底层错误向业务错误的完整翻译链条 (Error Translation Chain)
- **严禁向客户端与用户暴露原始底层异常**：
  - 禁止向用户抛出形如 `ECONNREFUSED`、`fetch failed`、`Unexpected token < in JSON`、`NullPointerException` 的原始调用栈。
- **统一通过 `translateToBusinessError` 转换**：
  - 所有捕获到的未知/底层异常必须经过 `translateToBusinessError(error, context)` 管道处理；
  - 翻译后的 `BusinessError` 必须包含：
    1. 结构化错误代码 (`code`)；
    2. **对用户友好、具有可读性和安抚性的自然语言解释 (`userMessage`)**；
    3. 错误分类 (`category`: `AGENT_RUNTIME`, `TOOL_EXECUTION`, `VALIDATION`, `NETWORK` 等)；
    4. 是否允许重试标记 (`retryable`)。

---

## 3. 学习者模型为唯一事实源 (Learner Core as SSOT)

- 用户的掌握度、听力/语法薄弱项雷达、做题记录与错题本生命周期，**由 `packages/learner-core` 独立掌控并持久化于数据库**。
- 绝不把学习者数据保存在外部大模型的 Thread 或会话历史中。换用模型时，所有学习资产必须 100% 完整保留。

---

## 4. 测试与验证标准 (Quality & Testing)

- **单测先行**：`packages/shared`、`packages/protocol`、`packages/learner-core` 等所有核心逻辑必须编写单元测试。
- **统一测试命令**：
  - 单元测试：`bun test`
  - 全局严格类型检查：`bun run typecheck`
- 任何提交前，必须确保 `bun test` 零失败，`bun run typecheck` 零报错。
