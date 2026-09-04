import type { CardReviewRating } from '@study-studio/protocol';
import { addDays, nowIso } from '@study-studio/shared';

export interface FsrsState {
  stability: number;       // 记忆稳定性 S
  difficulty: number;      // 难度 D (1 ~ 10)
  reps: number;            // 复习次数
  lapses: number;          // 遗忘次数
  lastReviewedAt?: string;
  dueAt: string;
  state: 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING';
}

/**
 * 创建新卡片的初始 FSRS 状态
 */
export function initFsrsState(): FsrsState {
  return {
    stability: 1.0,
    difficulty: 5.0,
    reps: 0,
    lapses: 0,
    dueAt: nowIso(),
    state: 'NEW',
  };
}

/**
 * 依据学习者评分更新 FSRS 状态并计算下次复习时间
 */
export function scheduleNextReview(
  current: FsrsState,
  rating: CardReviewRating,
  now: Date = new Date()
): FsrsState {
  let { stability, difficulty, reps, lapses, state } = current;
  reps += 1;

  switch (rating) {
    case 'AGAIN':
      lapses += 1;
      stability = Math.max(0.5, stability * 0.5);
      difficulty = Math.min(10, difficulty + 1.2);
      state = reps === 1 ? 'LEARNING' : 'RELEARNING';
      break;

    case 'HARD':
      stability = Math.max(1.0, stability * 1.2);
      difficulty = Math.min(10, difficulty + 0.4);
      state = 'REVIEW';
      break;

    case 'GOOD':
      stability = Math.max(1.5, stability * 2.2);
      difficulty = Math.max(1, difficulty - 0.2);
      state = 'REVIEW';
      break;

    case 'EASY':
      stability = Math.max(2.5, stability * 3.5);
      difficulty = Math.max(1, difficulty - 0.8);
      state = 'REVIEW';
      break;
  }

  // 间隔天数大致正比于稳定性
  const intervalDays = Math.max(1, Math.round(stability));
  const dueAtDate = addDays(now, intervalDays);

  return {
    stability: Number(stability.toFixed(2)),
    difficulty: Number(difficulty.toFixed(2)),
    reps,
    lapses,
    lastReviewedAt: now.toISOString(),
    dueAt: dueAtDate.toISOString(),
    state,
  };
}
