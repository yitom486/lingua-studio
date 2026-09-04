import type { Result, BusinessError } from '@study-studio/shared';
import type { SkillMetric, LearnerProfileSnapshot } from './types.js';
import type { Flashcard } from '@study-studio/protocol';
import type { MistakeEntry } from './mistake.js';

export interface QuizAttemptRecord {
  id: string;
  userId: string;
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  score: number;
  timeSpentMs: number;
  testedSkillId: string;
  createdAt: string;
}

/**
 * 学习者领域仓储抽象契约 (采用 Result 模式)
 */
export interface LearnerRepository {
  getProfileSnapshot(userId: string): Promise<Result<LearnerProfileSnapshot, BusinessError>>;
  saveSkillMetric(userId: string, metric: SkillMetric): Promise<Result<void, BusinessError>>;

  getDueCards(userId: string, limit?: number): Promise<Result<Flashcard[], BusinessError>>;
  saveCard(card: Flashcard): Promise<Result<void, BusinessError>>;

  recordQuizAttempt(attempt: QuizAttemptRecord): Promise<Result<void, BusinessError>>;
  saveMistake(mistake: MistakeEntry): Promise<Result<void, BusinessError>>;
  getMistakes(userId: string, filter?: { resolved?: boolean }): Promise<Result<MistakeEntry[], BusinessError>>;
}
