import type {
  AgentAdapter,
  AgentSession,
  CreateSessionOptions,
  AgentInput,
  AgentEvent,
  ContextSnapshot,
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
      const reply = buildLightweightReply(msg, input.contextSnapshot);
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

function trackOf(snapshot?: ContextSnapshot): 'ja' | 'en' | 'ko' {
  const t = snapshot?.targetLanguage;
  if (t === 'en' || t === 'ko' || t === 'ja') return t;
  return 'ja';
}

function buildLightweightReply(message: string, snapshot?: ContextSnapshot): string {
  const track = trackOf(snapshot);
  const clip = message.slice(0, 80);

  if (!message) {
    return '请给出需要快速解答的词句或客观题干，我将以轻量旁路给出简短说明。';
  }

  if (/读|発音|发音|声调|pitch|假名|五十音/i.test(message)) {
    if (track === 'en') {
      return `【轻量旁路 · 英语】发音提示：优先查音标与词性重音，勿让模型臆造美式/英式读音。原问：${clip}`;
    }
    if (track === 'ko') {
      return `【轻量旁路 · 韩语】发音提示：关注收音与连音；正式词典接入前勿臆造声调。原问：${clip}`;
    }
    return `【轻量旁路 · 日语】发音提示：请优先查课程资产 lookup_pitch / 五十音表，勿依赖模型编造声调。原问：${clip}`;
  }

  if (/助词|に|で|を|が|은\/는|에서/.test(message)) {
    if (track === 'en') {
      return `【轻量旁路 · 英语】语法提示：先抓谓语与从句连词，再核对介词搭配。原问：${clip}`;
    }
    if (track === 'ko') {
      return `【轻量旁路 · 韩语】조사 提示：동작 장소「에서」vs 존재「에」；主题「은/는」vs 焦点「이/가」。原问：${clip}`;
    }
    return `【轻量旁路 · 日语】助词提示：静态存在/归着点多用「に」，动态行为发生场所多用「で」。原问：${clip}`;
  }

  const trackLabel = track === 'en' ? '英语' : track === 'ko' ? '韩语' : '日语';
  return `【轻量旁路 · ${trackLabel} stub】已收到：${message.slice(0, 120)}。正式快模接入前，复杂编排请走学习闭环主通路。`;
}
