import { describe, expect, it } from 'bun:test';
import {
  buildDailyPlanStepTemplates,
  overlayDailyPlanProgress,
  parseDailyPlanStepTemplates,
} from '../daily-plan.js';

describe('daily plan sequencing', () => {
  it('reviews due cards before reading and quiz when FSRS has work', () => {
    const steps = buildDailyPlanStepTemplates({
      track: 'en',
      dailyGoalQuizzes: 5,
      dailyGoalCards: 10,
      dueCardsCount: 8,
      unresolvedMistakesCount: 2,
      topWeakness: { skillId: 'en.grammar.tense', name: '时态一致' },
    });

    expect(steps.map((s) => s.kind)).toEqual([
      'CARDS',
      'GRAMMAR',
      'READING',
      'QUIZ',
      'MISTAKES',
    ]);
    expect(steps[0]?.targetCount).toBe(8);
    expect(steps[3]?.targetCount).toBe(5);
  });

  it('starts with new-word collection when nothing is due', () => {
    const steps = buildDailyPlanStepTemplates({
      track: 'en',
      dailyGoalQuizzes: 5,
      dailyGoalCards: 10,
      dueCardsCount: 0,
      unresolvedMistakesCount: 0,
    });

    expect(steps.map((s) => s.kind)).toEqual(['NEW_WORDS', 'READING', 'QUIZ']);
    expect(steps[0]?.navigateTo).toBe('CARDS');
  });

  it('overlays live stats without changing stored order', () => {
    const templates = buildDailyPlanStepTemplates({
      track: 'ja',
      dailyGoalQuizzes: 5,
      dailyGoalCards: 10,
      dueCardsCount: 3,
      unresolvedMistakesCount: 1,
    });
    const overlayed = overlayDailyPlanProgress(templates, {
      quizzesCount: 5,
      cardsReviewedCount: 3,
      readingCount: 0,
      mistakesResolvedCount: 0,
      unresolvedMistakesCount: 1,
      completedStepIds: ['step_reading'],
    });

    expect(overlayed.find((s) => s.kind === 'CARDS')?.done).toBe(true);
    expect(overlayed.find((s) => s.kind === 'QUIZ')?.done).toBe(true);
    expect(overlayed.find((s) => s.kind === 'READING')?.done).toBe(true);
    expect(overlayed.find((s) => s.kind === 'MISTAKES')?.done).toBe(false);
  });

  it('rejects corrupt persisted templates instead of inventing steps', () => {
    expect(parseDailyPlanStepTemplates([{ id: 'x' }])).toBeNull();
    expect(parseDailyPlanStepTemplates([])).toBeNull();
    const ok = parseDailyPlanStepTemplates([
      {
        id: 'step_quiz',
        kind: 'QUIZ',
        title: '自适应练习',
        summary: '做题',
        navigateTo: 'QUIZ',
        targetCount: 5,
      },
    ]);
    expect(ok?.[0]?.kind).toBe('QUIZ');
  });
});
