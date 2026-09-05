import { describe, expect, it } from 'bun:test';
import {
  mapCodexItemToAgentEvent,
  mapAppServerNotificationToEvents,
  CodexAdapter,
  loadCodexConfigFromEnv,
  normalizeSandboxMode,
  normalizeApprovalPolicy,
} from '../index.js';
import { isErr } from '@study-studio/shared';

describe('Agent Codex - Mapper & Adapter', () => {
  it('normalizes sandbox and approval kebab-case enums', () => {
    expect(normalizeSandboxMode('readOnly')).toBe('read-only');
    expect(normalizeSandboxMode('workspaceWrite')).toBe('workspace-write');
    expect(normalizeSandboxMode('danger-full-access')).toBe('danger-full-access');
    expect(normalizeApprovalPolicy('onRequest')).toBe('on-request');
    expect(normalizeApprovalPolicy('never')).toBe('never');
  });
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

  it('maps App Server agentMessage delta notifications', () => {
    const events = mapAppServerNotificationToEvents('item/agentMessage/delta', {
      delta: 'こんにちは',
    });
    expect(events).toEqual([{ type: 'TEXT_DELTA', delta: 'こんにちは' }]);
  });

  it('maps App Server reasoning text deltas', () => {
    const events = mapAppServerNotificationToEvents('item/reasoning/summaryTextDelta', {
      delta: 'think…',
    });
    expect(events).toEqual([{ type: 'REASONING_DELTA', delta: 'think…' }]);
  });

  it('maps dynamicToolCall started to TOOL_CALL_REQUESTED', () => {
    const events = mapAppServerNotificationToEvents('item/started', {
      item: {
        type: 'dynamicToolCall',
        id: 'item_1',
        tool: 'learning.content',
        arguments: { action: 'explain' },
      },
    });
    expect(events[0]).toEqual({
      type: 'TOOL_CALL_REQUESTED',
      callId: 'item_1',
      toolName: 'learning.content',
      input: { action: 'explain' },
    });
  });

  it('respects STUDY_STUDIO_CODEX=0 without spawning process', async () => {
    const prev = process.env.STUDY_STUDIO_CODEX;
    process.env.STUDY_STUDIO_CODEX = '0';
    try {
      const cfg = loadCodexConfigFromEnv();
      expect(cfg.enabled).toBe(false);
      const adapter = new CodexAdapter({ config: cfg });
      const sessionRes = await adapter.createSession({
        sessionId: 'test_sess',
        userId: 'u1',
      });
      expect(isErr(sessionRes)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.STUDY_STUDIO_CODEX;
      else process.env.STUDY_STUDIO_CODEX = prev;
    }
  });
});
