import { describe, expect, it, beforeEach } from 'bun:test';
import { DrizzleLearnerRepository } from '../infrastructure/drizzle-learner-repository.js';
import { app } from '../index.js';
import { isOk } from '@study-studio/shared';

describe('Beginner Trail (learning-progress domain)', () => {
  let repo: DrizzleLearnerRepository;
  const userId = 'test_user_trail_01';

  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
  });

  function seedCards(n: number, language = 'ja') {
    const insert = repo
      .getRawDb()
      .prepare(
        `INSERT INTO flashcards (
          id, user_id, language, type, front, back, tags, fsrs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
    for (let i = 0; i < n; i++) {
      insert.run(`trail_card_${i}`, userId, language, 'VOCAB', `前${i}`, `后${i}`, '[]', '{}');
    }
  }

  async function seedQuizAttempts(n: number, testedSkillId = 'jp.particle.ni_vs_de') {
    for (let i = 0; i < n; i++) {
      const res = await repo.recordQuizAttempt({
        id: `trail_attempt_${i}`,
        userId,
        questionId: `q${i}`,
        userAnswer: 'に',
        isCorrect: true,
        score: 1,
        timeSpentMs: 1000,
        testedSkillId,
        createdAt: new Date().toISOString(),
      });
      expect(isOk(res)).toBe(true);
    }
  }

  async function seedReadingMetric(skillId = 'jp.reading.comprehension') {
    const res = await repo.saveSkillMetric(userId, {
      id: skillId,
      dimension: 'VOCABULARY',
      name: '阅读理解',
      proficiency: 0.8,
      totalAttempts: 1,
      correctAttempts: 1,
      consecutiveErrors: 0,
      status: 'NORMAL',
      lastPracticedAt: new Date().toISOString(),
    });
    expect(isOk(res)).toBe(true);
  }

  it('starts with only the first stage current and the rest locked', async () => {
    const res = await repo.getBeginnerTrail(userId, 'ja');
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.track).toBe('ja');
    expect(res.value.complete).toBe(false);
    expect(res.value.stages.length).toBe(5);
    expect(res.value.stages[0]?.current).toBe(true);
    expect(res.value.stages[0]?.locked).toBe(false);
    expect(res.value.stages[0]?.tab).toBe('KANA');
    for (const s of res.value.stages.slice(1)) {
      expect(s.locked).toBe(true);
      expect(s.current).toBe(false);
      expect(s.done).toBe(false);
    }
  });

  it('unlocks stages sequentially as kana attempts accumulate', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await repo.recordKanaPractice(userId, `kana_${i}`, true, 'HIRAGANA');
      expect(isOk(r)).toBe(true);
    }
    const res = await repo.getBeginnerTrail(userId, 'ja');
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.stages[0]?.done).toBe(true);
    expect(res.value.stages[1]?.current).toBe(true);
    expect(res.value.stages[1]?.progress).toBe(3);
  });

  it('marks complete when all five ja signals are satisfied', async () => {
    for (let i = 0; i < 15; i++) {
      await repo.recordKanaPractice(userId, `kana_${i}`, true, 'HIRAGANA');
    }
    seedCards(3);
    await seedQuizAttempts(3);
    await seedReadingMetric();
    const res = await repo.getBeginnerTrail(userId, 'ja');
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.complete).toBe(true);
    expect(res.value.stages.every((s) => s.done)).toBe(true);
  });

  it('serves ko and en tracks with their own stage lists', async () => {
    const ko = await repo.getBeginnerTrail(userId, 'ko');
    expect(isOk(ko)).toBe(true);
    if (!isOk(ko)) return;
    expect(ko.value.stages.length).toBe(5);
    expect(ko.value.stages[0]?.tab).toBe('HANGUL');

    const en = await repo.getBeginnerTrail(userId, 'en');
    expect(isOk(en)).toBe(true);
    if (!isOk(en)) return;
    expect(en.value.stages.length).toBe(3);
    expect(en.value.stages[0]?.tab).toBe('CARDS');
  });

  it('exposes the trail over HTTP GET /api/trail/:userId', async () => {
    const res = await app.request('/api/trail/http_trail_user_01?track=ja');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { track?: unknown; complete?: unknown; stages?: unknown[] };
    expect(data.track).toBe('ja');
    expect(data.complete).toBe(false);
    expect(Array.isArray(data.stages)).toBe(true);
    expect(data.stages?.length).toBe(5);
  });
});
