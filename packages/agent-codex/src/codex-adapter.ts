import type {
  AgentAdapter,
  AgentSession,
  CreateSessionOptions,
  AgentInput,
  AgentEvent,
} from '@study-studio/agent-core';
import {
  ok,
  err,
  type Result,
  type BusinessError,
  translateToBusinessError,
} from '@study-studio/shared';

export class CodexSession implements AgentSession {
  constructor(
    public readonly sessionId: string,
    public readonly threadId: string
  ) {}

  public async *send(input: AgentInput): AsyncIterable<AgentEvent> {
    try {
      // 模拟与原生 Codex App Server 通信的流式响应骨架
      yield { type: 'REASONING_STARTED' };
      yield { type: 'REASONING_DELTA', delta: '正在分析您的作答与薄弱项...' };
      yield { type: 'REASONING_COMPLETED' };
      yield { type: 'TEXT_DELTA', delta: `已收到指令：${input.message}` };
      yield { type: 'COMPLETED', finalOutput: `已收到指令：${input.message}` };
    } catch (rawError) {
      yield {
        type: 'ERROR',
        error: translateToBusinessError(rawError, 'CODEX_SESSION:send'),
      };
    }
  }

  public async submitToolResult(
    _callId: string,
    _result: unknown
  ): Promise<Result<void, BusinessError>> {
    return ok(undefined);
  }

  public async submitApproval(
    _approvalId: string,
    _approved: boolean
  ): Promise<Result<void, BusinessError>> {
    return ok(undefined);
  }

  public async interrupt(): Promise<Result<void, BusinessError>> {
    return ok(undefined);
  }

  public async close(): Promise<Result<void, BusinessError>> {
    return ok(undefined);
  }
}

export class CodexAdapter implements AgentAdapter {
  public readonly id = 'codex-app-server';
  public readonly name = 'Codex App Server Adapter';

  public async createSession(
    options: CreateSessionOptions
  ): Promise<Result<AgentSession, BusinessError>> {
    try {
      const threadId = `th_${options.sessionId}`;
      const session = new CodexSession(options.sessionId, threadId);
      return ok(session);
    } catch (raw) {
      return err(translateToBusinessError(raw, 'CODEX:createSession'));
    }
  }

  public async resumeSession(
    sessionId: string
  ): Promise<Result<AgentSession, BusinessError>> {
    try {
      const threadId = `th_${sessionId}`;
      const session = new CodexSession(sessionId, threadId);
      return ok(session);
    } catch (raw) {
      return err(translateToBusinessError(raw, 'CODEX:resumeSession'));
    }
  }
}
