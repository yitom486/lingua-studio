import { Database } from 'bun:sqlite';
import type { Result, BusinessError } from '@study-studio/shared';
import type {
  LearnerRepository,
  QuizAttemptRecord,
  SkillMetric,
  LearnerProfileSnapshot,
  LearnerProfile,
  DailyTaskProgress,
  MistakeEntry,
  DailyStudyPlan,
  DailyPlanStepTemplate,
} from '@study-studio/learner-core';
import type {
  Flashcard,
  DocumentItem,
  AnnotationItem,
  KanaItem,
  ReadingPassageSet,
  SubmitReadingPractice,
  PracticeCollection,
  PracticeItem,
  GeneratedQuestion,
} from '@study-studio/protocol';
import { createDrizzleDb, type DrizzleDb, learnerLanguageProfiles } from './db/index.js';
import type {
  PracticePlanTemplate,
  PracticePlanRun,
  PracticeItemAttempt,
  PracticeBlockSpec,
  PracticeRunStatus,
} from '@study-studio/protocol';

// P0-1 拆分：语种 / 词典 / 通用工具已下沉 domains；本地 import 供剩余方法使用，
// 底部 export 保持对外契约不变（index.ts 经 export * 转出）。
import type { TrackLanguage } from './persistence/language.js';
import { normalizeTrackLanguage, inferLanguageFromSkillId } from './persistence/language.js';
import type {
  LocalDictionaryEntry,
  DictionaryEntryCollection,
} from '../modules/dictionary/persistence/dictionary.js';
import {
  searchLocalDictionary as searchLocalDictionaryDomain,
  collectDictionaryEntry as collectDictionaryEntryDomain,
} from '../modules/dictionary/persistence/dictionary.js';
import {
  resolveActiveLanguage as resolveActiveLanguageDomain,
  ensureLanguageProfile as ensureLanguageProfileDomain,
  mirrorLanguageProfileToMain as mirrorLanguageProfileToMainDomain,
} from '../modules/learning-progress/persistence/profile-internals.js';
import {
  getLearnerProfile as getLearnerProfileDomain,
  updateLearnerProfile as updateLearnerProfileDomain,
  getProfileSnapshot as getProfileSnapshotDomain,
  saveSkillMetric as saveSkillMetricDomain,
} from '../modules/learning-progress/persistence/profile.js';
import {
  getDailyTaskProgress as getDailyTaskProgressDomain,
  getActivityHistory as getActivityHistoryDomain,
  recordDailyActivity as recordDailyActivityDomain,
  getOrCreateDailyStudyPlan as getOrCreateDailyStudyPlanDomain,
  completeDailyPlanStep as completeDailyPlanStepDomain,
} from '../modules/learning-progress/persistence/activity-plan.js';
import {
  getDueCards as getDueCardsDomain,
  saveCard as saveCardDomain,
} from '../modules/review/persistence/cards.js';
import {
  getQuestions as getQuestionsDomain,
  saveQuestion as saveQuestionDomain,
  saveQuestions as saveQuestionsDomain,
  recordQuizAttempt as recordQuizAttemptDomain,
  type PersistableQuestion,
} from '../modules/practice/persistence/questions.js';
import {
  saveMistake as saveMistakeDomain,
  getMistakes as getMistakesDomain,
  resolveMistake as resolveMistakeDomain,
  retryMistake as retryMistakeDomain,
} from '../modules/learning-progress/persistence/mistakes.js';
import {
  saveDocument as saveDocumentDomain,
  listDocuments as listDocumentsDomain,
  getDocumentById as getDocumentByIdDomain,
  deleteDocument as deleteDocumentDomain,
  saveAnnotation as saveAnnotationDomain,
  listAnnotations as listAnnotationsDomain,
  deleteAnnotation as deleteAnnotationDomain,
  convertAnnotationToCard as convertAnnotationToCardDomain,
} from '../modules/library/persistence/documents-annotations.js';
import {
  getCurriculumKana as getCurriculumKanaDomain,
  listContentTemplates as listContentTemplatesDomain,
  listReadingSets as listReadingSetsDomain,
  saveReadingSet as saveReadingSetDomain,
} from '../modules/curriculum/persistence/curriculum-content.js';
import {
  recordKanaPractice as recordKanaPracticeDomain,
  recordReadingPractice as recordReadingPracticeDomain,
} from '../modules/learning-progress/persistence/learning-records.js';
import {
  collectPracticeQuestions as collectPracticeQuestionsDomain,
  listPracticeCollections as listPracticeCollectionsDomain,
  listPracticeItems as listPracticeItemsDomain,
  convertPracticeItemsToCards as convertPracticeItemsToCardsDomain,
} from '../modules/practice/persistence/practice.js';
import {
  savePracticePlanTemplate as savePracticePlanTemplateDomain,
  listPracticePlanTemplates as listPracticePlanTemplatesDomain,
  getPracticePlanTemplate as getPracticePlanTemplateDomain,
  deletePracticePlanTemplate as deletePracticePlanTemplateDomain,
  setPracticePlanTemplateEnabled as setPracticePlanTemplateEnabledDomain,
  copyPracticePlanTemplate as copyPracticePlanTemplateDomain,
  startPracticePlanRun as startPracticePlanRunDomain,
  getPracticePlanRun as getPracticePlanRunDomain,
  listPracticePlanRuns as listPracticePlanRunsDomain,
  savePracticeItemDraft as savePracticeItemDraftDomain,
  submitPracticeItem as submitPracticeItemDomain,
  listPracticeItemAttempts as listPracticeItemAttemptsDomain,
  getPracticeRunItems as getPracticeRunItemsDomain,
  finalizePracticePlanRun as finalizePracticePlanRunDomain,
} from '../modules/practice/persistence/practice-plan.js';
import {
  getTodayString,
  getYesterdayString,
  safeJsonParse,
  defaultLanguageProfileSeed,
} from './persistence/repo-utils.js';
import type { RepoDeps } from './persistence/repo-context.js';

export type {
  TrackLanguage,
  LocalDictionaryEntry,
  DictionaryEntryCollection,
  RepoDeps,
};
export {
  normalizeTrackLanguage,
  inferLanguageFromSkillId,
  getTodayString,
  getYesterdayString,
  safeJsonParse,
  defaultLanguageProfileSeed,
};

export class DrizzleLearnerRepository implements LearnerRepository {
  private readonly db: DrizzleDb;
  private readonly sqlite: Database;

  constructor(dbOrPath: Database | string = ':memory:') {
    const instance = createDrizzleDb(dbOrPath);
    this.db = instance.db;
    this.sqlite = instance.sqlite;
  }

  public getRawDb(): Database {
    return this.sqlite;
  }

  /**
   * 查询本地、可再分发的词典资产。第三方词典只可作为外链兜底，绝不在此抓取。
   * 实现已下沉 domains/dictionary.ts，此处仅委托。
   */
  public async searchLocalDictionary(
    language: TrackLanguage,
    query: string,
    limit = 20
  ): Promise<Result<LocalDictionaryEntry[], BusinessError>> {
    return searchLocalDictionaryDomain(this.deps, language, query, limit);
  }

  /**
   * 将一个已安装的本地词典条目收集为用户生词卡。
   * 词典内容仍保持公共只读资产；这里只创建或返回用户自己的 FSRS 状态。
   * 实现已下沉 domains/dictionary.ts，此处仅委托。
   */
  public async collectDictionaryEntry(
    userId: string,
    entryId: string
  ): Promise<Result<DictionaryEntryCollection, BusinessError>> {
    return collectDictionaryEntryDomain(this.deps, userId, entryId);
  }

  private get deps(): RepoDeps {
    return { db: this.db, sqlite: this.sqlite, repo: this };
  }

  private async resolveActiveLanguage(userId: string): Promise<TrackLanguage> {
    return resolveActiveLanguageDomain(this.deps, userId);
  }

  private async ensureLanguageProfile(
    userId: string,
    language: TrackLanguage,
    seed?: Partial<{
      studyGoal: string;
      learnerLevel: string;
      overallLevel: string;
      overallProficiency: number;
      streakDays: number;
      maxStreakDays: number;
      lastActiveDate: string | null;
      retentionRate: number;
      dailyGoalQuizzes: number;
      dailyGoalCards: number;
      totalStudyMinutes: number;
      totalCardsReviewed: number;
      totalQuizzesAnswered: number;
    }>
  ): Promise<typeof learnerLanguageProfiles.$inferSelect> {
    return ensureLanguageProfileDomain(this.deps, userId, language, seed);
  }

  private async mirrorLanguageProfileToMain(
    userId: string,
    language: TrackLanguage,
    langRow: typeof learnerLanguageProfiles.$inferSelect,
    displayName?: string
  ): Promise<void> {
    return mirrorLanguageProfileToMainDomain(this.deps, userId, language, langRow, displayName);
  }

  /**
   * 实现已下沉 domains/profile.ts，此处仅委托。
   */
  public async getLearnerProfile(userId: string): Promise<Result<LearnerProfile, BusinessError>> {
    return getLearnerProfileDomain(this.deps, userId);
  }

  /**
   * 实现已下沉 domains/profile.ts，此处仅委托。
   */
  public async updateLearnerProfile(
    userId: string,
    input: Partial<LearnerProfile>
  ): Promise<Result<LearnerProfile, BusinessError>> {
    return updateLearnerProfileDomain(this.deps, userId, input);
  }

  /**
   * 实现已下沉 domains/activity-plan.ts，此处仅委托。
   */
  public async getDailyTaskProgress(
    userId: string,
    date?: string
  ): Promise<Result<DailyTaskProgress, BusinessError>> {
    return getDailyTaskProgressDomain(this.deps, userId, date);
  }

  /**
   * 实现已下沉 domains/activity-plan.ts，此处仅委托。
   */
  public async getActivityHistory(
    userId: string,
    days: number = 28,
    targetLanguage?: TrackLanguage | string
  ): Promise<Result<DailyTaskProgress[], BusinessError>> {
    return getActivityHistoryDomain(this.deps, userId, days, targetLanguage);
  }

  /**
   * 在独立事务中执行操作
   */
  public async withTransaction<T>(
    fn: (repo: DrizzleLearnerRepository) => Promise<T>
  ): Promise<T> {
    return this.sqlite.transaction(async () => {
      return await fn(this);
    })();
  }

  /**
   * 使用 SAVEPOINT 进行沙盒测试执行，并在执行完毕后无条件回滚，确保测试数据绝不污染真实数据库
   */
  public async withSavepointSandbox<T>(
    fn: (repo: DrizzleLearnerRepository) => Promise<T>
  ): Promise<T> {
    const savepointName = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.sqlite.run(`SAVEPOINT ${savepointName};`);
    try {
      return await fn(this);
    } finally {
      this.sqlite.run(`ROLLBACK TO ${savepointName};`);
      this.sqlite.run(`RELEASE ${savepointName};`);
    }
  }

  /**
   * 实现已下沉 domains/activity-plan.ts，此处仅委托。
   */
  public async recordDailyActivity(
    userId: string,
    delta: {
      quizzes?: number;
      cards?: number;
      listeningMinutes?: number;
      mistakesResolved?: number;
      reading?: number;
      date?: string;
      language?: TrackLanguage | string;
    }
  ): Promise<Result<DailyTaskProgress, BusinessError>> {
    return recordDailyActivityDomain(this.deps, userId, delta);
  }

  /**
   * 实现已下沉 domains/activity-plan.ts，此处仅委托。
   */
  public async getOrCreateDailyStudyPlan(
    userId: string,
    date?: string
  ): Promise<Result<DailyStudyPlan, BusinessError>> {
    return getOrCreateDailyStudyPlanDomain(this.deps, userId, date);
  }

  /**
   * 实现已下沉 domains/activity-plan.ts，此处仅委托。
   */
  public async completeDailyPlanStep(
    userId: string,
    stepId: string,
    date?: string
  ): Promise<Result<DailyStudyPlan, BusinessError>> {
    return completeDailyPlanStepDomain(this.deps, userId, stepId, date);
  }

  /**
   * 实现已下沉 domains/profile.ts，此处仅委托。
   */
  public async getProfileSnapshot(
    userId: string,
    langOverride?: string
  ): Promise<Result<LearnerProfileSnapshot, BusinessError>> {
    return getProfileSnapshotDomain(this.deps, userId, langOverride);
  }

  /**
   * 实现已下沉 domains/profile.ts，此处仅委托。
   */
  public async saveSkillMetric(
    userId: string,
    metric: SkillMetric
  ): Promise<Result<void, BusinessError>> {
    return saveSkillMetricDomain(this.deps, userId, metric);
  }

  /**
   * 实现已下沉 domains/cards-questions.ts，此处仅委托。
   */
  public async getDueCards(
    userId: string,
    limit: number = 500,
    options?: { dueOnly?: boolean; language?: string }
  ): Promise<Result<Flashcard[], BusinessError>> {
    return getDueCardsDomain(this.deps, userId, limit, options);
  }

  /**
   * 实现已下沉 domains/cards-questions.ts，此处仅委托。
   */
  public async getQuestions(
    userId: string,
    limit: number = 50,
    langOverride?: string,
    filter?: {
      types?: string[] | undefined;
      difficulty?: number | undefined;
      skillIds?: string[] | undefined;
    }
  ): Promise<Result<PersistableQuestion[], BusinessError>> {
    return getQuestionsDomain(this.deps, userId, limit, langOverride, filter);
  }

  /**
   * 实现已下沉 domains/cards-questions.ts，此处仅委托。
   */
  public async saveQuestion(question: PersistableQuestion): Promise<Result<void, BusinessError>> {
    return saveQuestionDomain(this.deps, question);
  }

  /**
   * 实现已下沉 domains/cards-questions.ts，此处仅委托。
   */
  public async saveQuestions(questions: PersistableQuestion[]): Promise<Result<void, BusinessError>> {
    return saveQuestionsDomain(this.deps, questions);
  }

  /**
   * 实现已下沉 domains/cards-questions.ts，此处仅委托。
   */
  public async saveCard(card: Flashcard): Promise<Result<void, BusinessError>> {
    return saveCardDomain(this.deps, card);
  }

  /**
   * 实现已下沉 domains/cards-questions.ts，此处仅委托。
   */
  public async recordQuizAttempt(
    attempt: QuizAttemptRecord
  ): Promise<Result<void, BusinessError>> {
    return recordQuizAttemptDomain(this.deps, attempt);
  }

  /**
   * 实现已下沉 domains/mistakes.ts，此处仅委托。
   */
  public async saveMistake(mistake: MistakeEntry): Promise<Result<void, BusinessError>> {
    return saveMistakeDomain(this.deps, mistake);
  }

  /**
   * 实现已下沉 domains/mistakes.ts，此处仅委托。
   */
  public async getMistakes(
    userId: string,
    filter?: { resolved?: boolean; language?: string }
  ): Promise<Result<MistakeEntry[], BusinessError>> {
    return getMistakesDomain(this.deps, userId, filter);
  }

  /**
   * 实现已下沉 domains/mistakes.ts，此处仅委托。
   */
  public async resolveMistake(mistakeId: string): Promise<Result<void, BusinessError>> {
    return resolveMistakeDomain(this.deps, mistakeId);
  }

  /**
   * 实现已下沉 domains/mistakes.ts，此处仅委托。
   */
  public async retryMistake(
    userId: string,
    mistakeId: string,
    isCorrect: boolean
  ): Promise<Result<Pick<MistakeEntry, 'consecutiveCorrect' | 'isResolved' | 'retryCount'>, BusinessError>> {
    return retryMistakeDomain(this.deps, userId, mistakeId, isCorrect);
  }

  // ==================== 文档与教材资产 (Documents) ====================

  /**
   * 实现已下沉 domains/documents-annotations.ts，此处仅委托。
   */
  public async saveDocument(doc: DocumentItem): Promise<Result<DocumentItem, BusinessError>> {
    return saveDocumentDomain(this.deps, doc);
  }

  /**
   * 实现已下沉 domains/documents-annotations.ts，此处仅委托。
   */
  public async listDocuments(
    userId: string,
    sourceKind?: string
  ): Promise<Result<DocumentItem[], BusinessError>> {
    return listDocumentsDomain(this.deps, userId, sourceKind);
  }

  /**
   * 实现已下沉 domains/documents-annotations.ts，此处仅委托。
   */
  public async getDocumentById(id: string): Promise<Result<DocumentItem | null, BusinessError>> {
    return getDocumentByIdDomain(this.deps, id);
  }

  /**
   * 实现已下沉 domains/documents-annotations.ts，此处仅委托。
   */
  public async deleteDocument(id: string, userId: string): Promise<Result<void, BusinessError>> {
    return deleteDocumentDomain(this.deps, id, userId);
  }

  // ==================== 划线高亮与批注 (Annotations) ====================

  /**
   * 实现已下沉 domains/documents-annotations.ts，此处仅委托。
   */
  public async saveAnnotation(ann: AnnotationItem): Promise<Result<AnnotationItem, BusinessError>> {
    return saveAnnotationDomain(this.deps, ann);
  }

  /**
   * 实现已下沉 domains/documents-annotations.ts，此处仅委托。
   */
  public async listAnnotations(
    documentId: string,
    userId: string
  ): Promise<Result<AnnotationItem[], BusinessError>> {
    return listAnnotationsDomain(this.deps, documentId, userId);
  }

  /**
   * 实现已下沉 domains/documents-annotations.ts，此处仅委托。
   */
  public async deleteAnnotation(
    annotationId: string,
    userId: string
  ): Promise<Result<void, BusinessError>> {
    return deleteAnnotationDomain(this.deps, annotationId, userId);
  }

  /**
   * 实现已下沉 domains/documents-annotations.ts，此处仅委托。
   */
  public async convertAnnotationToCard(
    annotationId: string,
    userId: string,
    cardData: {
      front: string;
      back: string;
      tag?: string | undefined;
      pos?: string | undefined;
      phonetic?: string | undefined;
    }
  ): Promise<Result<Flashcard, BusinessError>> {
    return convertAnnotationToCardDomain(this.deps, annotationId, userId, cardData);
  }

  // ==================== 五十音课程底座 (Curriculum Kana) ====================

  /**
   * 实现已下沉 domains/curriculum-reading.ts，此处仅委托。
   */
  public async getCurriculumKana(
    type?: string
  ): Promise<Result<KanaItem[], BusinessError>> {
    return getCurriculumKanaDomain(this.deps, type);
  }

  /**
   * 实现已下沉 domains/curriculum-reading.ts，此处仅委托。
   */
  public async listContentTemplates(options: {
    action: string;
    language: string;
    skillId?: string | undefined;
    format?: string | undefined;
    genre?: string | undefined;
    limit?: number | undefined;
  }): Promise<
    Result<
      Array<{
        id: string;
        language: string;
        action: string;
        format: string | null;
        skillId: string | null;
        difficulty: number;
        topic: string | null;
        genre: string | null;
        sortOrder: number;
        payload: Record<string, unknown>;
      }>,
      BusinessError
    >
  > {
    return listContentTemplatesDomain(this.deps, options);
  }

  /**
   * 实现已下沉 domains/curriculum-reading.ts，此处仅委托。
   */
  public async recordKanaPractice(
    userId: string,
    kanaId: string,
    isCorrect: boolean,
    scriptType: 'HIRAGANA' | 'KATAKANA' | 'ROMAJI' = 'HIRAGANA'
  ): Promise<Result<{ proficiency: number }, BusinessError>> {
    return recordKanaPracticeDomain(this.deps, userId, kanaId, isCorrect, scriptType);
  }

  /**
   * 实现已下沉 domains/curriculum-reading.ts，此处仅委托。
   */
  public async listReadingSets(
    userId: string,
    origin?: 'ai' | 'news' | 'user_import',
    language?: 'JA' | 'EN' | 'KO'
  ): Promise<Result<ReadingPassageSet[], BusinessError>> {
    return listReadingSetsDomain(this.deps, userId, origin, language);
  }

  /**
   * 实现已下沉 domains/curriculum-reading.ts，此处仅委托。
   */
  public async saveReadingSet(
    userId: string,
    set: ReadingPassageSet
  ): Promise<Result<ReadingPassageSet, BusinessError>> {
    return saveReadingSetDomain(this.deps, userId, set);
  }

  /**
   * 实现已下沉 domains/curriculum-reading.ts，此处仅委托。
   */
  public async recordReadingPractice(
    userId: string,
    input: SubmitReadingPractice
  ): Promise<Result<{ proficiency: number }, BusinessError>> {
    return recordReadingPracticeDomain(this.deps, userId, input);
  }

  /**
   * 实现已下沉 domains/practice.ts，此处仅委托。
   */
  public async collectPracticeQuestions(input: {
    userId: string;
    title: string;
    intent?: string;
    layoutHint?: string | undefined;
    sourceRef?: string | undefined;
    questions: GeneratedQuestion[];
    /** P5：关联练习运行/块/批改模式（可空，向后兼容） */
    planRunId?: string | undefined;
    blockId?: string | undefined;
    gradingMode?: string | undefined;
  }): Promise<Result<{ collection: PracticeCollection; items: PracticeItem[] }, BusinessError>> {
    return collectPracticeQuestionsDomain(this.deps, input);
  }

  /**
   * 实现已下沉 domains/practice.ts，此处仅委托。
   */
  public async listPracticeCollections(
    userId: string,
    limit = 20
  ): Promise<Result<PracticeCollection[], BusinessError>> {
    return listPracticeCollectionsDomain(this.deps, userId, limit);
  }

  /**
   * 实现已下沉 domains/practice.ts，此处仅委托。
   */
  public async listPracticeItems(
    userId: string,
    collectionId: string
  ): Promise<Result<PracticeItem[], BusinessError>> {
    return listPracticeItemsDomain(this.deps, userId, collectionId);
  }

  /**
   * 实现已下沉 domains/practice.ts，此处仅委托。
   */
  public async convertPracticeItemsToCards(
    userId: string,
    itemIds: string[]
  ): Promise<
    Result<{ createdCount: number; cardIds: string[]; skippedItemIds: string[] }, BusinessError>
  > {
    return convertPracticeItemsToCardsDomain(this.deps, userId, itemIds);
  }

  // ===================== P5：可配置练习计划 =====================

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async savePracticePlanTemplate(
    template: PracticePlanTemplate
  ): Promise<Result<PracticePlanTemplate, BusinessError>> {
    return savePracticePlanTemplateDomain(this.deps, template);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async listPracticePlanTemplates(
    userId: string,
    opts?: { language?: string | undefined; includeDisabled?: boolean | undefined }
  ): Promise<Result<PracticePlanTemplate[], BusinessError>> {
    return listPracticePlanTemplatesDomain(this.deps, userId, opts);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async getPracticePlanTemplate(
    userId: string,
    templateId: string
  ): Promise<Result<PracticePlanTemplate | null, BusinessError>> {
    return getPracticePlanTemplateDomain(this.deps, userId, templateId);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async deletePracticePlanTemplate(
    userId: string,
    templateId: string
  ): Promise<Result<void, BusinessError>> {
    return deletePracticePlanTemplateDomain(this.deps, userId, templateId);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async setPracticePlanTemplateEnabled(
    userId: string,
    templateId: string,
    enabled: boolean
  ): Promise<Result<PracticePlanTemplate | null, BusinessError>> {
    return setPracticePlanTemplateEnabledDomain(this.deps, userId, templateId, enabled);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async copyPracticePlanTemplate(
    userId: string,
    templateId: string
  ): Promise<Result<PracticePlanTemplate, BusinessError>> {
    return copyPracticePlanTemplateDomain(this.deps, userId, templateId);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async startPracticePlanRun(
    userId: string,
    params: {
      language: 'en' | 'ja' | 'ko';
      templateId?: string | undefined;
      blocks?: PracticeBlockSpec[] | undefined;
    }
  ): Promise<Result<PracticePlanRun, BusinessError>> {
    return startPracticePlanRunDomain(this.deps, userId, params);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async getPracticePlanRun(
    userId: string,
    runId: string
  ): Promise<Result<PracticePlanRun | null, BusinessError>> {
    return getPracticePlanRunDomain(this.deps, userId, runId);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async listPracticePlanRuns(
    userId: string,
    opts?: { language?: string | undefined; status?: PracticeRunStatus | undefined }
  ): Promise<Result<PracticePlanRun[], BusinessError>> {
    return listPracticePlanRunsDomain(this.deps, userId, opts);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async savePracticeItemDraft(
    userId: string,
    runId: string,
    itemId: string,
    userAnswer: string
  ): Promise<Result<PracticeItemAttempt, BusinessError>> {
    return savePracticeItemDraftDomain(this.deps, userId, runId, itemId, userAnswer);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async submitPracticeItem(
    userId: string,
    runId: string,
    itemId: string,
    userAnswer: string,
    gradingResult?: Record<string, unknown>,
    timeSpentMs?: number
  ): Promise<Result<PracticeItemAttempt, BusinessError>> {
    return submitPracticeItemDomain(this.deps, userId, runId, itemId, userAnswer, gradingResult, timeSpentMs);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async listPracticeItemAttempts(
    runId: string
  ): Promise<Result<PracticeItemAttempt[], BusinessError>> {
    return listPracticeItemAttemptsDomain(this.deps, runId);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async getPracticeRunItems(
    userId: string,
    runId: string
  ): Promise<Result<Array<{ itemId: string; blockId: string; gradingMode: string; question: GeneratedQuestion }>, BusinessError>> {
    return getPracticeRunItemsDomain(this.deps, userId, runId);
  }

  /**
   * 实现已下沉 domains/practice-plan.ts，此处仅委托。
   */
  public async finalizePracticePlanRun(
    userId: string,
    runId: string
  ): Promise<Result<PracticePlanRun, BusinessError>> {
    return finalizePracticePlanRunDomain(this.deps, userId, runId);
  }
}
