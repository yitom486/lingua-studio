import { describe, expect, it } from 'bun:test';
import { selectAgentRoute } from '../router/agent-router.js';

describe('selectAgentRoute', () => {
  it('routes quiz / example intents to learning-loop', () => {
    expect(selectAgentRoute({ userPrompt: '请给我造三个例句' }).route).toBe('learning-loop');
    expect(selectAgentRoute({ userPrompt: '随便聊聊', intent: 'GENERATE_QUIZ' }).route).toBe(
      'learning-loop'
    );
    expect(selectAgentRoute({ userPrompt: '讲透这个考点' }).reason).toBe('content_or_quiz_intent');
  });

  it('routes pitch / particle hints to responses-lite', () => {
    expect(selectAgentRoute({ userPrompt: '「橋」的声调怎么读？' }).route).toBe('responses-lite');
    expect(selectAgentRoute({ userPrompt: '助词で的读音是什么' }).route).toBe('responses-lite');
    expect(selectAgentRoute({ userPrompt: 'drill', intent: 'DRILL_KANA' }).route).toBe(
      'responses-lite'
    );
  });

  it('routes short factual questions to responses-lite', () => {
    expect(selectAgentRoute({ userPrompt: '这是什么意思？' }).route).toBe('responses-lite');
  });

  it('defaults free coaching to learning-loop', () => {
    expect(
      selectAgentRoute({
        userPrompt:
          '请结合我最近的错题本，帮我制定一个为期一周的语法复盘计划，并说明每天侧重点。',
      }).route
    ).toBe('learning-loop');
  });
});
