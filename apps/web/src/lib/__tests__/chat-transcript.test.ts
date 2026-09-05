import { describe, expect, it } from 'bun:test';
import {
  formatToolArguments,
  mapThreadItemsToBubbles,
  markToolCallsDone,
  stripTranscriptNoise,
  upsertToolCall,
} from '../chat-transcript.js';

describe('stripTranscriptNoise', () => {
  it('strips StudyStudio Context and keeps the learner message', () => {
    const raw = `[StudyStudio Context]
- targetLanguage: en
- learnerLevel: N3-
- instruction: Prefer calling registered learning.* tools.

那么你有哪些工具可以调用呢请问`;
    expect(stripTranscriptNoise(raw)).toBe('那么你有哪些工具可以调用呢请问');
  });

  it('keeps the user line even without a blank separator', () => {
    const raw = `[StudyStudio Context]
- targetLanguage: en
那么你有哪些工具可以调用呢请问`;
    expect(stripTranscriptNoise(raw)).toBe('那么你有哪些工具可以调用呢请问');
  });

  it('strips trunk-context and system tags', () => {
    const raw =
      '<trunk-context>secret</trunk-context>\n<system>do not show</system>\n你好';
    expect(stripTranscriptNoise(raw)).toBe('你好');
  });
});

describe('upsertToolCall', () => {
  it('appends a running call and can mark it done', () => {
    const once = upsertToolCall([], {
      callId: 'c1',
      toolName: 'learning.content',
      arguments: { action: 'explain' },
    });
    expect(once).toEqual([
      {
        id: 'c1',
        toolName: 'learning.content',
        status: 'running',
        arguments: { action: 'explain' },
      },
    ]);
    expect(markToolCallsDone(once)?.[0]?.status).toBe('done');
  });
});

describe('mapThreadItemsToBubbles', () => {
  it('strips context from user items and folds tools onto the assistant turn', () => {
    const bubbles = mapThreadItemsToBubbles([
      {
        turnId: 't1',
        type: 'userMessage',
        text: '[StudyStudio Context]\n- targetLanguage: en\n\n有哪些工具',
      },
      { turnId: 't1', type: 'reasoning', text: '先列工具' },
      {
        turnId: 't1',
        type: 'dynamicToolCall',
        id: 'c1',
        toolName: 'learning.content',
        arguments: { action: 'explain' },
      },
      { turnId: 't1', type: 'agentMessage', text: '可以用 learning.content' },
    ]);
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]?.role).toBe('user');
    expect(bubbles[0]?.text).toBe('有哪些工具');
    expect(bubbles[1]?.reasoning).toBe('先列工具');
    expect(bubbles[1]?.toolCalls?.[0]?.toolName).toBe('learning.content');
    expect(bubbles[1]?.text).toBe('可以用 learning.content');
  });
});

describe('formatToolArguments', () => {
  it('pretty-prints objects and handles empty', () => {
    expect(formatToolArguments(undefined)).toBe('（无参数）');
    expect(formatToolArguments({ action: 'explain' })).toContain('explain');
  });
});
