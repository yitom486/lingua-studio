import { describe, expect, it } from 'bun:test';
import { evaluateLevelTransition, levelProgressHint, type LevelEvalInput } from '../level.js';
const base: LevelEvalInput = { track: 'ja', currentLevel: 'NOVICE', alphabet: { accuracy: 1, attempts: 500 }, collectedCount: 5000, quizDays: [{ date: '2026-09-08', correct: 100, total: 100 }], examPassToday: false };
describe('阶段资格只由测评变更', () => {
  it('大量收藏和满分活动不自动升级', () => {
    expect(evaluateLevelTransition(base).newLevel).toBe('NOVICE');
    expect(evaluateLevelTransition({ ...base, track: 'en', alphabet: null }).changed).toBe(false);
  });
  it('一次低分与长期未练均不剥夺已获阶段', () => {
    for (const quizDays of [[], [{ date: '2026-09-08', correct: 0, total: 10 }]]) {
      expect(evaluateLevelTransition({ ...base, currentLevel: 'INTERMEDIATE', quizDays, collectedCount: 0 }).newLevel).toBe('INTERMEDIATE');
    }
  });
  it('升级提示不要求收藏凑数', () => {
    expect(levelProgressHint(base)).toContain('阶段测评');
    expect(levelProgressHint(base)).not.toContain('/200');
  });
});
