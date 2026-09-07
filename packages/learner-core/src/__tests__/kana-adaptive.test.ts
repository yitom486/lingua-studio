import { describe, expect, it } from 'bun:test';
import {
  selectAdaptiveKanaIds,
  updateKanaPracticeMemory,
} from '../index.js';

const NOW = new Date('2026-09-07T12:00:00.000Z');

describe('Learner Core - adaptive kana review', () => {
  it('uses a short relearning interval and raises consecutive errors', () => {
    const memory = updateKanaPracticeMemory(undefined, false, NOW);

    expect(memory.fsrs.state).toBe('LEARNING');
    expect(memory.fsrs.reps).toBe(1);
    expect(memory.fsrs.lapses).toBe(1);
    expect(memory.consecutiveErrors).toBe(1);
    expect(memory.fsrs.dueAt).toBe('2026-09-07T12:10:00.000Z');
  });

  it('increases the interval after a correct review and clears the error streak', () => {
    const wrong = updateKanaPracticeMemory(undefined, false, NOW);
    const corrected = updateKanaPracticeMemory(wrong, true, new Date('2026-09-07T12:10:00.000Z'));

    expect(corrected.fsrs.state).toBe('REVIEW');
    expect(corrected.fsrs.reps).toBe(2);
    expect(corrected.fsrs.lapses).toBe(1);
    expect(corrected.consecutiveErrors).toBe(0);
    expect(corrected.fsrs.dueAt > wrong.fsrs.dueAt).toBe(true);
  });

  it('prioritizes errors, then unseen items, and puts mastered future reviews last', () => {
    const wrong = updateKanaPracticeMemory(undefined, false, NOW);
    const correct = updateKanaPracticeMemory(undefined, true, NOW);
    const candidates = [
      { id: 'new-late', sortOrder: 4 },
      { id: 'mastered', sortOrder: 3, memory: correct },
      { id: 'wrong', sortOrder: 2, memory: wrong },
      { id: 'new-first', sortOrder: 1 },
    ];

    expect(selectAdaptiveKanaIds(candidates, 3, NOW)).toEqual([
      'wrong',
      'new-first',
      'new-late',
    ]);
  });

  it('returns the whole ranked pool when the limit is zero', () => {
    const candidates = [
      { id: 'b', sortOrder: 2 },
      { id: 'a', sortOrder: 1 },
    ];

    expect(selectAdaptiveKanaIds(candidates, 0, NOW)).toEqual(['a', 'b']);
  });
});
