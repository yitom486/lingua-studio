import type { Result, BusinessError } from '@study-studio/shared';
import type {
  SkillMetric,
  LearnerProfileSnapshot,
  LearnerProfile,
  DailyTaskProgress,
} from './types.js';
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
  // 画像与学情大盘
  getProfileSnapshot(userId: string): Promise<Result<LearnerProfileSnapshot, BusinessError>>;
  getLearnerProfile(userId: string): Promise<Result<LearnerProfile, BusinessError>>;
  updateLearnerProfile(userId: string, input: Partial<LearnerProfile>): Promise<Result<LearnerProfile, BusinessError>>;

  // 每日任务打卡与足迹
  getDailyTaskProgress(userId: string, date?: string): Promise<Result<DailyTaskProgress, BusinessError>>;
  recordDailyActivity(
    userId: string,
    delta: {
      quizzes?: number;
      cards?: number;
      listeningMinutes?: number;
      mistakesResolved?: number;
      date?: string;
    }
  ): Promise<Result<DailyTaskProgress, BusinessError>>;

  // 技能雷达
  saveSkillMetric(userId: string, metric: SkillMetric): Promise<Result<void, BusinessError>>;

  // FSRS 卡片
  getDueCards(userId: string, limit?: number): Promise<Result<Flashcard[], BusinessError>>;
  saveCard(card: Flashcard): Promise<Result<void, BusinessError>>;

  // 做题与错题
  recordQuizAttempt(attempt: QuizAttemptRecord): Promise<Result<void, BusinessError>>;
  saveMistake(mistake: MistakeEntry): Promise<Result<void, BusinessError>>;
  getMistakes(userId: string, filter?: { resolved?: boolean }): Promise<Result<MistakeEntry[], BusinessError>>;
}
