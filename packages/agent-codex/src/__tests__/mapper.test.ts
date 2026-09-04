import { describe, expect, it } from 'bun:test';
import { mapCodexItemToAgentEvent, CodexAdapter } from '../index.js';
import { isOk } from '@study-studio/shared';

describe('Agent Codex - Mapper & Adapter', () => {
  it('should map message_delta correctly', () => {
    const event = mapCodexItemToAgentEvent({
      type: 'message_delta',
      delta: 'おはよう',
    });
    expect(event).toEqual({ type: 'TEXT_DELTA', delta: 'おはよう' });
  });

  it('should map dynamic tool call correctly', () => {
    const event = mapCodexItemToAgentEvent({
      type: 'dynamic_tool_call',
      toolCall: {
        callId: 'c1',
        toolName: 'dictionary.lookup',
        arguments: { word: '猫' },
      },
    });
    expect(event).toEqual({
      type: 'TOOL_CALL_REQUESTED',
      callId: 'c1',
      toolName: 'dictionary.lookup',
      input: { word: '猫' },
    });
  });

  it('should map raw error to friendly BusinessError', () => {
    const event = mapCodexItemToAgentEvent({
      type: 'error',
      error: new Error('connect ECONNREFUSED 127.0.0.1:4000'),
    });
    expect(event?.type).toBe('ERROR');
    if (event && event.type === 'ERROR') {
      expect(event.error.code).toBe('E_NETWORK_DISCONNECTED');
      expect(event.error.userMessage).toContain('无法连接到学习助手服务');
    }
  });

  it('should create session and stream events', async () => {
    const adapter = new CodexAdapter();
    const sessionRes = await adapter.createSession({
      sessionId: 'test_sess',
      userId: 'u1',
    });

    expect(isOk(sessionRes)).toBe(true);
    if (isOk(sessionRes)) {
      const session = sessionRes.value;
      const events = [];
      for await (const ev of session.send({ message: '出题' })) {
        events.push(ev);
      }
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]?.type).toBe('REASONING_STARTED');
    }
  });
});
