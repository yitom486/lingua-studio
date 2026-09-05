import { describe, expect, it } from 'bun:test';
import {
  buildDailyPlanStepTemplates,
  overlayDailyPlanProgress,
  parseDailyPlanStepTemplates,
  appendPracticePlanStep,
  PRACTICE_PLAN_STEP_ID,
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

describe('practice plan run step (P5-E3)', () => {
  const baseSignals = {
    track: 'en' as const,
    dailyGoalQuizzes: 5,
    dailyGoalCards: 10,
    dueCardsCount: 8,
    unresolvedMistakesCount: 2,
    topWeakness: { skillId: 'en.grammar.tense', name: '时态一致' },
  };

  it('appends practice step after the 5-step cap without being dropped', () => {
    const capped = buildDailyPlanStepTemplates(baseSignals);
    expect(capped.length).toBe(5);
    const withPractice = appendPracticePlanStep(capped, 8);
    expect(withPractice.length).toBe(6);
    const practice = withPractice[withPractice.length - 1]!;
    expect(practice.id).toBe(PRACTICE_PLAN_STEP_ID);
    expect(practice.kind).toBe('PRACTICE_PLAN');
    expect(practice.navigateTo).toBe('PRACTICE_PLAN');
    expect(practice.targetCount).toBe(8);
  });

  it('is idempotent: appending twice does not duplicate the step', () => {
    const once = appendPracticePlanStep(buildDailyPlanStepTemplates(baseSignals), 5);
    const twice = appendPracticePlanStep(once, 5);
    expect(twice.filter((s) => s.id === PRACTICE_PLAN_STEP_ID).length).toBe(1);
  });

  it('completes only when submitted items reach frozen total', () => {
    const templates = appendPracticePlanStep(buildDailyPlanStepTemplates(baseSignals), 3);
    const partial = overlayDailyPlanProgress(templates, {
      quizzesCount: 0,
      cardsReviewedCount: 0,
      readingCount: 0,
      mistakesResolvedCount: 0,
      unresolvedMistakesCount: 2,
      completedStepIds: [],
      practicePlan: { submittedItems: 2, totalItems: 3 },
    });
    const partialStep = partial.find((s) => s.id === PRACTICE_PLAN_STEP_ID)!;
    expect(partialStep.done).toBe(false);
    expect(partialStep.currentCount).toBe(2);

    const complete = overlayDailyPlanProgress(templates, {
      quizzesCount: 0,
      cardsReviewedCount: 0,
      readingCount: 0,
      mistakesResolvedCount: 0,
      unresolvedMistakesCount: 2,
      completedStepIds: [],
      practicePlan: { submittedItems: 3, totalItems: 3 },
    });
    expect(complete.find((s) => s.id === PRACTICE_PLAN_STEP_ID)?.done).toBe(true);
  });

  it('stays incomplete without signal but honours manual completion id', () => {
    const templates = appendPracticePlanStep(buildDailyPlanStepTemplates(baseSignals), 4);
    const noSignal = overlayDailyPlanProgress(templates, {
      quizzesCount: 0,
      cardsReviewedCount: 0,
      readingCount: 0,
      mistakesResolvedCount: 0,
      unresolvedMistakesCount: 2,
      completedStepIds: [],
    });
    const step = noSignal.find((s) => s.id === PRACTICE_PLAN_STEP_ID)!;
    expect(step.done).toBe(false);
    expect(step.currentCount).toBe(0);

    const manuallyDone = overlayDailyPlanProgress(templates, {
      quizzesCount: 0,
      cardsReviewedCount: 0,
      readingCount: 0,
      mistakesResolvedCount: 0,
      unresolvedMistakesCount: 2,
      completedStepIds: [PRACTICE_PLAN_STEP_ID],
    });
    expect(manuallyDone.find((s) => s.id === PRACTICE_PLAN_STEP_ID)?.done).toBe(true);
  });

  it('parses persisted PRACTICE_PLAN templates round-trip', () => {
    const templates = appendPracticePlanStep(buildDailyPlanStepTemplates(baseSignals), 6);
    const parsed = parseDailyPlanStepTemplates(JSON.parse(JSON.stringify(templates)));
    expect(parsed).not.toBeNull();
    expect(parsed?.find((s) => s.id === PRACTICE_PLAN_STEP_ID)?.kind).toBe('PRACTICE_PLAN');
  });
});
