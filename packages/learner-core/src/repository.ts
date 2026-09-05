import type { Result, BusinessError } from '@study-studio/shared';
import type {
  SkillMetric,
  LearnerProfileSnapshot,
  LearnerProfile,
  DailyTaskProgress,
} from './types.js';
import type { DailyStudyPlan } from './daily-plan.js';
import type { Flashcard } from '@study-studio/protocol';
import type {
  PracticePlanTemplate,
  PracticePlanRun,
  PracticeItemAttempt,
  PracticeBlockSpec,
  PracticeRunStatus,
} from '@study-studio/protocol';
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
  getProfileSnapshot(userId: string, langOverride?: string): Promise<Result<LearnerProfileSnapshot, BusinessError>>;
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
      reading?: number;
      date?: string;
    }
  ): Promise<Result<DailyTaskProgress, BusinessError>>;

  /** 获取或生成当日学习计划（步骤顺序稳定，done 由实时学情叠加） */
  getOrCreateDailyStudyPlan(
    userId: string,
    date?: string
  ): Promise<Result<DailyStudyPlan, BusinessError>>;
  completeDailyPlanStep(
    userId: string,
    stepId: string,
    date?: string
  ): Promise<Result<DailyStudyPlan, BusinessError>>;

  // 技能雷达
  saveSkillMetric(userId: string, metric: SkillMetric): Promise<Result<void, BusinessError>>;

  // FSRS 卡片
  getDueCards(
    userId: string,
    limit?: number,
    options?: { dueOnly?: boolean; language?: string }
  ): Promise<Result<Flashcard[], BusinessError>>;
  saveCard(card: Flashcard): Promise<Result<void, BusinessError>>;

  // 做题与错题
  recordQuizAttempt(attempt: QuizAttemptRecord): Promise<Result<void, BusinessError>>;
  saveMistake(mistake: MistakeEntry): Promise<Result<void, BusinessError>>;
  getMistakes(
    userId: string,
    filter?: { resolved?: boolean; language?: string }
  ): Promise<Result<MistakeEntry[], BusinessError>>;

  // P5：可配置练习计划（模板 → 当日冻结 run → 单题尝试 → 完成原子写统计）
  savePracticePlanTemplate(
    template: PracticePlanTemplate
  ): Promise<Result<PracticePlanTemplate, BusinessError>>;
  listPracticePlanTemplates(
    userId: string,
    opts?: { language?: string; includeDisabled?: boolean }
  ): Promise<Result<PracticePlanTemplate[], BusinessError>>;
  getPracticePlanTemplate(
    userId: string,
    templateId: string
  ): Promise<Result<PracticePlanTemplate | null, BusinessError>>;
  deletePracticePlanTemplate(
    userId: string,
    templateId: string
  ): Promise<Result<void, BusinessError>>;
  startPracticePlanRun(
    userId: string,
    params: {
      language: 'en' | 'ja' | 'ko';
      templateId?: string;
      blocks?: PracticeBlockSpec[];
    }
  ): Promise<Result<PracticePlanRun, BusinessError>>;
  getPracticePlanRun(
    userId: string,
    runId: string
  ): Promise<Result<PracticePlanRun | null, BusinessError>>;
  listPracticePlanRuns(
    userId: string,
    opts?: { language?: string; status?: PracticeRunStatus }
  ): Promise<Result<PracticePlanRun[], BusinessError>>;
  savePracticeItemDraft(
    userId: string,
    runId: string,
    itemId: string,
    userAnswer: string
  ): Promise<Result<PracticeItemAttempt, BusinessError>>;
  submitPracticeItem(
    userId: string,
    runId: string,
    itemId: string,
    userAnswer: string,
    gradingResult?: Record<string, unknown>,
    timeSpentMs?: number
  ): Promise<Result<PracticeItemAttempt, BusinessError>>;
  listPracticeItemAttempts(
    runId: string
  ): Promise<Result<PracticeItemAttempt[], BusinessError>>;
  /** 完成运行：原子地把已批改尝试写入既有 quiz_attempts/错题/打卡，并标记 run COMPLETED。 */
  finalizePracticePlanRun(
    userId: string,
    runId: string
  ): Promise<Result<PracticePlanRun, BusinessError>>;
}
