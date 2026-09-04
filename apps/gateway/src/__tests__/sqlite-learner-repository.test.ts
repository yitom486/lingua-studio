import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SqliteLearnerRepository } from '../repository/sqlite-learner-repository.js';
import { isOk, generateId, nowIso } from '@study-studio/shared';
import type { Flashcard } from '@study-studio/protocol';
import type { MistakeEntry } from '@study-studio/learner-core';

describe('SqliteLearnerRepository (bun:sqlite)', () => {
  let repo: SqliteLearnerRepository;

  beforeEach(() => {
    // 采用高效的 in-memory SQLite 实例进行单测隔离
    repo = new SqliteLearnerRepository(':memory:');
  });

  afterEach(() => {
    repo.close();
  });

  it('should save and load flashcards with JSON fsrs payload', async () => {
    const card: Flashcard = {
      id: generateId('card'),
      userId: 'user_01',
      type: 'VOCABULARY',
      front: '食べる (たべる)',
      back: '吃 (动2 · 他动)',
      tags: ['N5', '常用动词'],
      fsrs: {
        stability: 2.5,
        difficulty: 4.8,
        reps: 1,
        lapses: 0,
        dueAt: nowIso(),
        state: 'REVIEW',
      },
    };

    const saveRes = await repo.saveCard(card);
    expect(isOk(saveRes)).toBe(true);

    const loadRes = await repo.getDueCards('user_01');
    expect(isOk(loadRes)).toBe(true);
    if (isOk(loadRes)) {
      expect(loadRes.value.length).toBe(1);
      expect(loadRes.value[0]?.front).toBe('食べる (たべる)');
      expect(loadRes.value[0]?.fsrs.stability).toBe(2.5);
      expect(loadRes.value[0]?.tags).toEqual(['N5', '常用动词']);
    }
  });

  it('should record quiz attempts and retrieve skill metrics', async () => {
    const attempt = {
      id: generateId('att'),
      userId: 'user_01',
      questionId: 'q_01',
      userAnswer: 'A',
      isCorrect: true,
      score: 1.0,
      timeSpentMs: 3200,
      testedSkillId: 'jp.particle.wa',
      createdAt: nowIso(),
    };

    const recordRes = await repo.recordQuizAttempt(attempt);
    expect(isOk(recordRes)).toBe(true);

    const metricRes = await repo.saveSkillMetric('user_01', {
      id: 'jp.particle.wa',
      dimension: 'GRAMMAR',
      name: '提示助词「は」',
      proficiency: 0.9,
      totalAttempts: 10,
      correctAttempts: 9,
      consecutiveErrors: 0,
      status: 'STRENGTH',
    });
    expect(isOk(metricRes)).toBe(true);

    const snapshotRes = await repo.getProfileSnapshot('user_01');
    expect(isOk(snapshotRes)).toBe(true);
    if (isOk(snapshotRes)) {
      expect(snapshotRes.value.strengths.length).toBe(1);
      expect(snapshotRes.value.strengths[0]?.name).toBe('提示助词「は」');
    }
  });

  it('should save mistakes and filter by resolution status', async () => {
    const mistake: MistakeEntry = {
      id: generateId('mst'),
      userId: 'user_01',
      questionId: 'q_02',
      question: {
        id: 'q_02',
        type: 'FILL_IN_BLANK',
        prompt: '填入假定形',
        content: '明日、雨が（降る ──►　）',
        correctAnswer: '降ったら',
        explanation: '动词五段过去式+ら',
        testedSkillId: 'jp.grammar.conditional_tara',
        difficultyTier: 3,
      },
      lastUserSubmission: '降れば',
      lastGrading: {
        questionId: 'q_02',
        isCorrect: false,
        score: 0,
        correctAnswer: '降ったら',
        userSubmission: '降れば',
        explanation: '错用了假定形ば而非たら',
        mistakeRecorded: true,
      },
      recordedAt: nowIso(),
      retryCount: 1,
      consecutiveCorrect: 1,
      isResolved: false,
    };

    const saveRes = await repo.saveMistake(mistake);
    expect(isOk(saveRes)).toBe(true);

    // 查询未攻克
    const unresolvedRes = await repo.getMistakes('user_01', { resolved: false });
    expect(isOk(unresolvedRes)).toBe(true);
    if (isOk(unresolvedRes)) {
      expect(unresolvedRes.value.length).toBe(1);
      expect(unresolvedRes.value[0]?.questionId).toBe('q_02');
    }

    // 攻克后更新
    const resolvedMistake: MistakeEntry = {
      ...mistake,
      consecutiveCorrect: 2,
      isResolved: true,
    };
    await repo.saveMistake(resolvedMistake);

    const resolvedListRes = await repo.getMistakes('user_01', { resolved: true });
    expect(isOk(resolvedListRes)).toBe(true);
    if (isOk(resolvedListRes)) {
      expect(resolvedListRes.value.length).toBe(1);
      expect(resolvedListRes.value[0]?.isResolved).toBe(true);
    }
  });
});
