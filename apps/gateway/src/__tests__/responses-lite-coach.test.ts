import { describe, expect, it } from 'bun:test';
import {
  resolveResponsesLiteCoach,
  tryHangulCoachReply,
  tryKanaCoachReply,
  tryParticleCoachReply,
} from '../runtime/responses-lite-coach.js';

describe('responses-lite coach', () => {
  it('hits pitch lexicon for Japanese accent questions', () => {
    const hit = resolveResponsesLiteCoach({
      prompt: '「雨」的声调怎么读？',
      track: 'ja',
    });
    expect(hit?.source).toBe('pitch-lexicon');
    expect(hit?.reply).toContain('雨');
  });

  it('hits kana seed for hiragana lookups', () => {
    const hit = tryKanaCoachReply('あ 的片假名和罗马字是什么');
    expect(hit?.source).toBe('kana-seed');
    expect(hit?.reply).toContain('あ');
    expect(hit?.reply).toContain('ア');
  });

  it('hits hangul seed for jamo lookups', () => {
    const hit = tryHangulCoachReply('ㄱ 怎么读，罗马字是什么');
    expect(hit?.source).toBe('hangul-seed');
    expect(hit?.reply).toContain('ㄱ');
    expect(hit?.reply).toContain('기역');
  });

  it('resolves hangul prompts on ko track without hijacking syllable chat', () => {
    const hit = resolveResponsesLiteCoach({
      prompt: '谚文 ㅏ 怎么读',
      track: 'ko',
    });
    expect(hit?.source).toBe('hangul-seed');
    expect(
      resolveResponsesLiteCoach({
        prompt: '가방에 뭐가 있어요?',
        track: 'ko',
      })
    ).toBeNull();
  });

  it('hits particle tips for に vs で', () => {
    const hit = tryParticleCoachReply('に vs で 有什么区别', 'ja');
    expect(hit?.source).toBe('particle-tip');
    expect(hit?.reply).toContain('に');
    expect(hit?.reply).toContain('で');
  });

  it('hits Korean particle tip for 에서', () => {
    const hit = resolveResponsesLiteCoach({
      prompt: '에서와 에 차이 알려줘',
      track: 'ko',
    });
    expect(hit?.source).toBe('particle-tip');
    expect(hit?.reply).toContain('에서');
  });

  it('returns null for free-form coaching so stub can answer', () => {
    expect(
      resolveResponsesLiteCoach({
        prompt: '帮我规划下周听力与阅读的时间分配，并说明理由。',
        track: 'en',
      })
    ).toBeNull();
  });
});
