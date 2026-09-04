import { describe, expect, it } from 'bun:test';
import { initFsrsState, scheduleNextReview } from '../index.js';

describe('Learner Core - FSRS Spaced Repetition', () => {
  it('should initialize a card in NEW state', () => {
    const card = initFsrsState();
    expect(card.state).toBe('NEW');
    expect(card.reps).toBe(0);
    expect(card.stability).toBe(1.0);
  });

  it('should transition to LEARNING and decrease stability on AGAIN', () => {
    const initial = initFsrsState();
    const next = scheduleNextReview(initial, 'AGAIN', new Date('2026-01-01T00:00:00Z'));

    expect(next.state).toBe('LEARNING');
    expect(next.reps).toBe(1);
    expect(next.lapses).toBe(1);
    expect(next.stability).toBeLessThan(initial.stability);
    expect(next.dueAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('should increase stability and interval on GOOD', () => {
    const initial = initFsrsState();
    const next = scheduleNextReview(initial, 'GOOD', new Date('2026-01-01T00:00:00Z'));

    expect(next.state).toBe('REVIEW');
    expect(next.reps).toBe(1);
    expect(next.stability).toBeGreaterThan(initial.stability);
    expect(next.lapses).toBe(0);
  });

  it('should provide longest interval on EASY', () => {
    const initial = initFsrsState();
    const goodState = scheduleNextReview(initial, 'GOOD', new Date('2026-01-01T00:00:00Z'));
    const easyState = scheduleNextReview(initial, 'EASY', new Date('2026-01-01T00:00:00Z'));

    expect(easyState.stability).toBeGreaterThan(goodState.stability);
  });
});
