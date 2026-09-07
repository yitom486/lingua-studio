import { describe, expect, it } from 'bun:test';
import {
  evaluateLevelTransition,
  levelProgressHint,
  type LevelEvalInput,
} from '../level.js';

const BASE: LevelEvalInput = {
  track: 'ja',
  currentLevel: 'NOVICE',
  alphabet: { accuracy: 0.9, attempts: 20 },
  collectedCount: 0,
  quizDays: [],
  examPassToday: false,
};

function quizDays(acc: number[], perDay = 5): LevelEvalInput['quizDays'] {
  return acc.map((a, i) => ({
    date: `2026-09-0${i + 1}`,
    correct: Math.round(a * perDay),
    total: perDay,
  }));
}

describe('level state machine（慢上快下）', () => {
  it('NOVICE→BEGINNER：字母95%+30次+收藏200', () => {
    const r = evaluateLevelTransition({
      ...BASE,
      alphabet: { accuracy: 0.96, attempts: 30 },
      collectedCount: 200,
    });
    expect(r.changed).toBe(true);
    expect(r.newLevel).toBe('BEGINNER');
    expect(r.direction).toBe('up');
  });

  it('条件差一条不升（收藏不够）', () => {
    const r = evaluateLevelTransition({
      ...BASE,
      alphabet: { accuracy: 0.96, attempts: 30 },
      collectedCount: 199,
    });
    expect(r.changed).toBe(false);
    expect(r.newLevel).toBe('NOVICE');
  });

  it('一次只升一档（条件直达 ADVANCED 也只到 BEGINNER）', () => {
    const r = evaluateLevelTransition({
      ...BASE,
      alphabet: { accuracy: 0.99, attempts: 100 },
      collectedCount: 5000,
      quizDays: quizDays([0.95, 0.96, 0.97], 10),
    });
    expect(r.newLevel).toBe('BEGINNER');
  });

  it('BEGINNER→INTERMEDIATE：连续3天≥85%（每天≥3题）+800词', () => {
    const r = evaluateLevelTransition({
      ...BASE,
      currentLevel: 'BEGINNER',
      alphabet: { accuracy: 0.96, attempts: 30 },
      collectedCount: 800,
      quizDays: quizDays([0.86, 0.9, 1.0], 20),
    });
    expect(r.newLevel).toBe('INTERMEDIATE');
  });

  it('每天题量不够不算（防1题刷榜）', () => {
    const r = evaluateLevelTransition({
      ...BASE,
      currentLevel: 'BEGINNER',
      alphabet: { accuracy: 0.96, attempts: 30 },
      collectedCount: 800,
      quizDays: quizDays([1.0, 1.0, 1.0], 1),
    });
    expect(r.changed).toBe(false);
  });

  it('两天达标一天拉胯不升', () => {
    const r = evaluateLevelTransition({
      ...BASE,
      currentLevel: 'BEGINNER',
      alphabet: { accuracy: 0.96, attempts: 30 },
      collectedCount: 800,
      quizDays: quizDays([0.9, 0.9, 0.5]),
    });
    expect(r.changed).toBe(false);
  });

  it('掉级：INTER 最近活跃日跌破维持线（85%×0.8=68%）降一档', () => {
    const r = evaluateLevelTransition({
      ...BASE,
      currentLevel: 'INTERMEDIATE',
      alphabet: { accuracy: 0.96, attempts: 30 },
      collectedCount: 900,
      quizDays: quizDays([0.9, 0.9, 0.5]),
    });
    expect(r.newLevel).toBe('BEGINNER');
    expect(r.direction).toBe('down');
  });

  it('考试通过当天豁免掉级', () => {
    const r = evaluateLevelTransition({
      ...BASE,
      currentLevel: 'INTERMEDIATE',
      alphabet: { accuracy: 0.96, attempts: 30 },
      collectedCount: 900,
      quizDays: quizDays([0.9, 0.9, 0.5]),
      examPassToday: true,
    });
    expect(r.changed).toBe(false);
  });

  it('今天没练不判定掉级', () => {
    const r = evaluateLevelTransition({
      ...BASE,
      currentLevel: 'ADVANCED',
      alphabet: { accuracy: 0.96, attempts: 30 },
      collectedCount: 5000,
      quizDays: [],
    });
    expect(r.changed).toBe(false);
  });

  it('en 无字母项：收藏200即 BEGINNER', () => {
    const r = evaluateLevelTransition({
      ...BASE,
      track: 'en',
      alphabet: null,
      collectedCount: 200,
    });
    expect(r.newLevel).toBe('BEGINNER');
  });

  it('en 的 BEGINNER 不因准确率掉级（无依据不判）', () => {
    const r = evaluateLevelTransition({
      ...BASE,
      track: 'en',
      currentLevel: 'BEGINNER',
      alphabet: null,
      collectedCount: 200,
      quizDays: quizDays([0.1]),
    });
    expect(r.changed).toBe(false);
  });

  it('hint：再稳 N 天/再收 N 词', () => {
    const h = levelProgressHint({
      ...BASE,
      currentLevel: 'BEGINNER',
      collectedCount: 800,
      quizDays: quizDays([0.9, 0.9], 20),
    });
    expect(h).toContain('再稳 1 天');
    const h2 = levelProgressHint({
      ...BASE,
      currentLevel: 'NOVICE',
      alphabet: { accuracy: 0.9, attempts: 20 },
      collectedCount: 50,
    });
    expect(h2).toContain('收藏 50/200');
  });
});
