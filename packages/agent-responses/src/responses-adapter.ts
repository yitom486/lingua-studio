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

/**
 * 轻量单次问答会话：无外部厂商 SDK，仅作 AgentRouter 旁路契约骨架。
 * 适合「这个词怎么读 / 客观题快解」等低复杂度场景的占位实现。
 */
export class ResponsesSession implements AgentSession {
  constructor(public readonly sessionId: string) {}

  public async *send(input: AgentInput): AsyncIterable<AgentEvent> {
    try {
      const msg = (input.message || '').trim();
      const reply = buildLightweightReply(msg);
      // 模拟轻量快模：整段一次吐出（非多跳 tool 编排）
      yield { type: 'TEXT_DELTA', delta: reply };
      yield { type: 'COMPLETED', finalOutput: reply };
    } catch (rawError) {
      yield {
        type: 'ERROR',
        error: translateToBusinessError(rawError, 'RESPONSES_SESSION:send'),
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

export class ResponsesAdapter implements AgentAdapter {
  public readonly id = 'responses-lite';
  public readonly name = 'Responses Lightweight Adapter (stub)';

  public async createSession(
    options: CreateSessionOptions
  ): Promise<Result<AgentSession, BusinessError>> {
    try {
      return ok(new ResponsesSession(options.sessionId));
    } catch (raw) {
      return err(translateToBusinessError(raw, 'RESPONSES:createSession'));
    }
  }

  public async resumeSession(
    sessionId: string
  ): Promise<Result<AgentSession, BusinessError>> {
    try {
      return ok(new ResponsesSession(sessionId));
    } catch (raw) {
      return err(translateToBusinessError(raw, 'RESPONSES:resumeSession'));
    }
  }
}

function buildLightweightReply(message: string): string {
  if (!message) {
    return '请给出需要快速解答的词句或客观题干，我将以轻量旁路给出简短说明。';
  }
  if (/助词|に|で|を/.test(message)) {
    return `【轻量旁路】助词提示：静态存在/归着点多用「に」，动态行为发生场所多用「で」。原问：${message.slice(0, 80)}`;
  }
  if (/读|発音|声调|pitch/i.test(message)) {
    return `【轻量旁路】发音提示：请优先查课程资产 lookup_pitch / 五十音表，勿依赖模型编造声调。原问：${message.slice(0, 80)}`;
  }
  return `【轻量旁路 · stub】已收到：${message.slice(0, 120)}。正式快模接入前，复杂编排请走 Codex 主通路。`;
}
