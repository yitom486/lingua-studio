import { describe, expect, it } from 'bun:test';
import { ContextBuilder, deriveRecentErrorTags } from '../context/context-builder.js';
import type { LearnerRepository, LearnerProfile, LearnerProfileSnapshot } from '@study-studio/learner-core';
import type { Flashcard } from '@study-studio/protocol';
import { ok, err, BusinessError } from '@study-studio/shared';

function mockRepo(overrides: {
  targetLanguage?: 'ja' | 'en' | 'ko';
  overallLevel?: string;
  dueCards?: Flashcard[];
  mistakes?: Array<{
    id: string;
    question: { testedSkillId: string; category?: string };
    isResolved: boolean;
  }>;
  metrics?: Array<{ id: string; name: string; proficiency: number }>;
}): LearnerRepository {
  const targetLanguage = overrides.targetLanguage ?? 'ja';
  const overallLevel = overrides.overallLevel ?? (targetLanguage === 'en' ? 'B1' : 'N5');
  const profile: LearnerProfile = {
    userId: 'u1',
    displayName: '测',
    targetLanguage,
    overallLevel,
    studyGoal: targetLanguage === 'en' ? 'KAOYAN_EN' : 'JLPT_N5',
    learnerLevel: 'BEGINNER',
    dailyGoalQuizzes: 5,
    dailyGoalCards: 10,
    streakDays: 7,
    updatedAt: new Date().toISOString(),
  } as LearnerProfile;

  const metrics = (overrides.metrics ?? []).map((m) => ({
    id: m.id,
    dimension: 'GRAMMAR' as const,
    name: m.name,
    proficiency: m.proficiency,
    totalAttempts: 10,
    correctAttempts: 5,
    consecutiveErrors: m.proficiency < 0.6 ? 2 : 0,
    status: (m.proficiency < 0.6 ? 'WEAKNESS' : 'NORMAL') as 'WEAKNESS' | 'NORMAL' | 'STRENGTH',
  }));

  const snapshot: LearnerProfileSnapshot = {
    userId: 'u1',
    targetLanguage,
    overallLevel,
    strengths: [],
    weaknesses: metrics.filter((m) => m.status === 'WEAKNESS'),
    allMetrics: metrics,
    updatedAt: new Date().toISOString(),
  };

  return {
    getLearnerProfile: async () => ok(profile),
    updateLearnerProfile: async () => ok(profile),
    getProfileSnapshot: async () => ok(snapshot),
    getDailyTaskProgress: async () => ok({} as never),
    recordDailyActivity: async () => ok({} as never),
    saveSkillMetric: async () => ok(undefined),
    getDueCards: async () => ok(overrides.dueCards ?? []),
    saveCard: async () => ok(undefined),
    recordQuizAttempt: async () => ok(undefined),
    saveMistake: async () => ok(undefined),
    getOrCreateDailyStudyPlan: async () =>
      ok({
        id: 'plan_u1',
        userId: 'u1',
        language: targetLanguage,
        planDate: '2026-09-05',
        steps: [],
        completedCount: 0,
        totalCount: 0,
        createdAt: new Date().toISOString(),
      }),
    completeDailyPlanStep: async () =>
      ok({
        id: 'plan_u1',
        userId: 'u1',
        language: targetLanguage,
        planDate: '2026-09-05',
        steps: [],
        completedCount: 0,
        totalCount: 0,
        createdAt: new Date().toISOString(),
      }),
    getMistakes: async () =>
      ok(
        (overrides.mistakes ?? []).map((m) => ({
          id: m.id,
          userId: 'u1',
          questionId: m.id,
          question: {
            id: m.id,
            type: 'MULTIPLE_CHOICE' as const,
            content: 'q',
            correctAnswer: 'a',
            explanation: '',
            testedSkillId: m.question.testedSkillId,
            category: m.question.category,
          } as never,
          lastUserSubmission: 'x',
          lastGrading: {} as never,
          recordedAt: new Date().toISOString(),
          retryCount: 0,
          consecutiveCorrect: 0,
          isResolved: m.isResolved,
        }))
      ),
    // P5 桩：context-builder 不涉及练习计划
    savePracticePlanTemplate: async () => err(new BusinessError('E_NOT_SUPPORTED', '', 'VALIDATION')) as never,
    listPracticePlanTemplates: async () => ok([]),
    getPracticePlanTemplate: async () => ok(null),
    deletePracticePlanTemplate: async () => err(new BusinessError('E_NOT_SUPPORTED', '', 'VALIDATION')) as never,
    setPracticePlanTemplateEnabled: async () => err(new BusinessError('E_NOT_SUPPORTED', '', 'VALIDATION')) as never,
    copyPracticePlanTemplate: async () => err(new BusinessError('E_NOT_SUPPORTED', '', 'VALIDATION')) as never,
    startPracticePlanRun: async () => err(new BusinessError('E_NOT_SUPPORTED', '', 'VALIDATION')) as never,
    getPracticePlanRun: async () => ok(null),
    listPracticePlanRuns: async () => ok([]),
    savePracticeItemDraft: async () => err(new BusinessError('E_NOT_SUPPORTED', '', 'VALIDATION')) as never,
    submitPracticeItem: async () => err(new BusinessError('E_NOT_SUPPORTED', '', 'VALIDATION')) as never,
    listPracticeItemAttempts: async () => ok([]),
    getPracticeRunItems: async () => ok([]),
    finalizePracticePlanRun: async () => err(new BusinessError('E_NOT_SUPPORTED', '', 'VALIDATION')) as never,
  } as LearnerRepository;
}

describe('ContextBuilder.buildTurnSnapshot', () => {
  it('fills digest from due cards, unresolved mistakes, kana mastery, and error tags', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();

    const builder = new ContextBuilder();
    const snapshot = await builder.buildTurnSnapshot(
      'u1',
      mockRepo({
        dueCards: [
          {
            id: 'c1',
            userId: 'u1',
            type: 'VOCABULARY',
            front: 'a',
            back: 'b',
            tags: [],
            fsrs: {
              stability: 1,
              difficulty: 5,
              reps: 0,
              lapses: 0,
              state: 'NEW',
              dueAt: past,
            },
          },
          {
            id: 'c2',
            userId: 'u1',
            type: 'VOCABULARY',
            front: 'c',
            back: 'd',
            tags: [],
            fsrs: {
              stability: 1,
              difficulty: 5,
              reps: 0,
              lapses: 0,
              state: 'REVIEW',
              dueAt: future,
            },
          },
        ],
        mistakes: [
          {
            id: 'm1',
            question: { testedSkillId: 'jp.particle.ni_vs_de', category: '助词' },
            isResolved: false,
          },
          {
            id: 'm2',
            question: { testedSkillId: 'jp.listening.sokuon' },
            isResolved: false,
          },
        ],
        metrics: [
          { id: 'jp.particle.ni_vs_de', name: 'に/で', proficiency: 0.4 },
          { id: 'jp.kana.hiragana', name: '平假名', proficiency: 0.72 },
          { id: 'jp.kana.katakana', name: '片假名', proficiency: 0.55 },
        ],
      }),
      {
        ui: { activeTab: 'QUIZ' },
        focus: { kind: 'QUESTION', surface: '题干' },
        userIntentHint: 'EXPLAIN',
      }
    );

    expect(snapshot.ui?.activeTab).toBe('QUIZ');
    expect(snapshot.focus?.surface).toBe('题干');
    expect(snapshot.learnerDigest?.dueCardsCount).toBe(1);
    expect(snapshot.learnerDigest?.unresolvedMistakesCount).toBe(2);
    expect(snapshot.learnerDigest?.streakDays).toBe(7);
    expect(snapshot.learnerDigest?.kanaMastery?.hiragana).toBe(0.72);
    expect(snapshot.learnerDigest?.kanaMastery?.katakana).toBe(0.55);
    expect(snapshot.learnerDigest?.recentErrorTags?.length).toBeGreaterThan(0);
    expect(snapshot.learnerDigest?.topWeaknesses.some((w) => w.skillId.includes('particle'))).toBe(
      true
    );
    // 不以客户端假数据覆盖 digest 计数
    expect(snapshot.learnerDigest?.unresolvedMistakesCount).not.toBe(0);
    expect(snapshot.targetLanguage).toBe('ja');
    expect(snapshot.metadata?.coachTrack).toBe('ja');
    expect(Array.isArray(snapshot.metadata?.coachHints)).toBe(true);
  });

  it('fills hangul mastery on ko track and omits kana mastery', async () => {
    const builder = new ContextBuilder();
    const snapshot = await builder.buildTurnSnapshot(
      'u1',
      mockRepo({
        targetLanguage: 'ko',
        overallLevel: 'A1',
        metrics: [
          { id: 'ko.hangul.consonant', name: '자음', proficiency: 0.8 },
          { id: 'ko.hangul.vowel', name: '모음', proficiency: 0.6 },
          { id: 'ko.hangul.compound', name: '복모음·받침', proficiency: 0.4 },
        ],
      }),
      {
        targetLanguage: 'ko',
        ui: { activeTab: 'HANGUL' },
      }
    );

    expect(snapshot.targetLanguage).toBe('ko');
    expect(snapshot.learnerDigest?.hangulMastery?.consonant).toBe(0.8);
    expect(snapshot.learnerDigest?.hangulMastery?.vowel).toBe(0.6);
    expect(snapshot.learnerDigest?.hangulMastery?.compound).toBe(0.4);
    expect(snapshot.learnerDigest?.kanaMastery).toBeUndefined();
  });

  it('omits kana mastery and filters jp skills when track is en', async () => {
    const builder = new ContextBuilder();
    const snapshot = await builder.buildTurnSnapshot(
      'u1',
      mockRepo({
        targetLanguage: 'en',
        overallLevel: 'B1',
        mistakes: [
          {
            id: 'm1',
            question: { testedSkillId: 'jp.particle.ni_vs_de', category: '助词' },
            isResolved: false,
          },
          {
            id: 'm2',
            question: { testedSkillId: 'en.grammar.subjunctive', category: '虚拟语气' },
            isResolved: false,
          },
        ],
        metrics: [
          { id: 'jp.particle.ni_vs_de', name: 'に/で', proficiency: 0.4 },
          { id: 'en.grammar.subjunctive', name: '虚拟语气', proficiency: 0.35 },
          { id: 'jp.kana.hiragana', name: '平假名', proficiency: 0.72 },
        ],
      }),
      {
        targetLanguage: 'en',
        ui: { activeTab: 'QUIZ' },
      }
    );

    expect(snapshot.targetLanguage).toBe('en');
    expect(snapshot.metadata?.coachTrack).toBe('en');
    expect(snapshot.learnerDigest?.kanaMastery).toBeUndefined();
    expect(snapshot.learnerDigest?.topWeaknesses.every((w) => w.skillId.startsWith('en.'))).toBe(
      true
    );
  });
});

describe('deriveRecentErrorTags', () => {
  it('dedupes skill segments and categories', () => {
    const tags = deriveRecentErrorTags(
      [
        { question: { testedSkillId: 'jp.particle.ni', category: '助词' } },
        { question: { testedSkillId: 'jp.particle.de' } },
      ],
      [{ skillId: 'jp.listening.sokuon' }]
    );
    expect(tags).toContain('PARTICLE');
    expect(tags).toContain('助词');
    expect(tags).toContain('LISTENING');
  });
});
