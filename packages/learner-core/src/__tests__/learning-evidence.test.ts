import { describe, expect, it } from 'bun:test';
import { summarizeLearningEvidence } from '../learning-evidence.js';
import type { SkillMetric } from '../types.js';
const metric = (id: string, totalAttempts: number, correctAttempts: number): SkillMetric => ({ id, totalAttempts, correctAttempts, name: id, dimension: 'GRAMMAR', status: 'NORMAL', proficiency: 0.55, consecutiveErrors: 0 });
describe('练习证据', () => {
  it('不把无记录或种子百分比当成能力', () => {
    expect(summarizeLearningEvidence([metric('jp.kana.hiragana', 0, 0)], 'ja').accuracy).toBeNull();
  });
  it('按作答数加权而非平均技能百分比，并隔离语种', () => {
    const e = summarizeLearningEvidence([metric('jp.kana.hiragana', 1, 1), metric('jp.kana.katakana', 9, 0), metric('en.grammar', 100, 100)], 'ja');
    expect(e.accuracy).toBe(0.1); expect(e.attempts).toBe(10);
  });
  it('全错是零分而非未评测，损坏记录不造数据', () => {
    expect(summarizeLearningEvidence([metric('en.vocab', 3, 0)], 'en').accuracy).toBe(0);
    expect(summarizeLearningEvidence([metric('en.vocab', 3, 4)], 'en').accuracy).toBeNull();
  });
});
