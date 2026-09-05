import { Database } from 'bun:sqlite';
import { eq, and, desc, asc, lte, gte, or, inArray, like } from 'drizzle-orm';
import {
  ok,
  err,
  type Result,
  BusinessError,
  translateToBusinessError,
  generateId,
  nowIso,
  isOk,
} from '@study-studio/shared';
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
import {
  buildDailyPlanStepTemplates,
  parseCompletedStepIds,
  parseDailyPlanStepTemplates,
  summarizeDailyStudyPlan,
  appendPracticePlanStep,
  PRACTICE_PLAN_STEP_ID,
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
import {
  createDrizzleDb,
  type DrizzleDb,
  learnerProfiles,
  learnerLanguageProfiles,
  studyActivityLogs,
  skillMetrics,
  flashcards,
  quizAttempts,
  mistakes,
  documents,
  annotations,
  practiceCollections,
  practiceItems,
  curriculumKana,
  quizQuestions,
  INITIAL_CARD_SEEDS,
  INITIAL_EN_CARD_SEEDS,
  INITIAL_SKILL_METRIC_SEEDS,
  learningContentTemplates,
  localDictionaryEntries,
  dailyStudyPlans,
  practicePlanTemplates,
  practicePlanRuns,
  practiceItemAttempts,
} from '../db/index.js';
import type {
  PracticePlanTemplate,
  PracticePlanRun,
  PracticeItemAttempt,
  PracticeBlockSpec,
  PracticeRunStatus,
} from '@study-studio/protocol';
import {
  validatePracticePlanTemplate,
  freezeRunFromTemplate,
  parsePracticeBlockSpecs,
  isRunComplete,
} from '@study-studio/learner-core';

// P0-1 拆分：语种 / 词典 / 通用工具已下沉 domains；本地 import 供剩余方法使用，
// 底部 export 保持对外契约不变（index.ts 经 export * 转出）。
import type { TrackLanguage } from './domains/language.js';
import { normalizeTrackLanguage, inferLanguageFromSkillId } from './domains/language.js';
import type {
  LocalDictionaryEntry,
  DictionaryEntryCollection,
} from './domains/dictionary.js';
import {
  searchLocalDictionary as searchLocalDictionaryDomain,
  collectDictionaryEntry as collectDictionaryEntryDomain,
} from './domains/dictionary.js';
import {
  resolveActiveLanguage as resolveActiveLanguageDomain,
  ensureLanguageProfile as ensureLanguageProfileDomain,
  mirrorLanguageProfileToMain as mirrorLanguageProfileToMainDomain,
} from './domains/profile-internals.js';
import {
  getLearnerProfile as getLearnerProfileDomain,
  updateLearnerProfile as updateLearnerProfileDomain,
  getProfileSnapshot as getProfileSnapshotDomain,
  saveSkillMetric as saveSkillMetricDomain,
} from './domains/profile.js';
import {
  getDailyTaskProgress as getDailyTaskProgressDomain,
  getActivityHistory as getActivityHistoryDomain,
  recordDailyActivity as recordDailyActivityDomain,
  getOrCreateDailyStudyPlan as getOrCreateDailyStudyPlanDomain,
  completeDailyPlanStep as completeDailyPlanStepDomain,
} from './domains/activity-plan.js';
import {
  getDueCards as getDueCardsDomain,
  saveCard as saveCardDomain,
  getQuestions as getQuestionsDomain,
  saveQuestion as saveQuestionDomain,
  saveQuestions as saveQuestionsDomain,
  recordQuizAttempt as recordQuizAttemptDomain,
} from './domains/cards-questions.js';
import {
  saveMistake as saveMistakeDomain,
  getMistakes as getMistakesDomain,
  resolveMistake as resolveMistakeDomain,
  retryMistake as retryMistakeDomain,
} from './domains/mistakes.js';
import {
  saveDocument as saveDocumentDomain,
  listDocuments as listDocumentsDomain,
  getDocumentById as getDocumentByIdDomain,
  deleteDocument as deleteDocumentDomain,
  saveAnnotation as saveAnnotationDomain,
  listAnnotations as listAnnotationsDomain,
  deleteAnnotation as deleteAnnotationDomain,
  convertAnnotationToCard as convertAnnotationToCardDomain,
} from './domains/documents-annotations.js';
import {
  getCurriculumKana as getCurriculumKanaDomain,
  listContentTemplates as listContentTemplatesDomain,
  recordKanaPractice as recordKanaPracticeDomain,
  listReadingSets as listReadingSetsDomain,
  saveReadingSet as saveReadingSetDomain,
  recordReadingPractice as recordReadingPracticeDomain,
} from './domains/curriculum-reading.js';
import {
  getTodayString,
  getYesterdayString,
  safeJsonParse,
  defaultLanguageProfileSeed,
} from './domains/repo-utils.js';
import type { RepoDeps } from './domains/repo-context.js';

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
  ): Promise<Result<any[], BusinessError>> {
    return getQuestionsDomain(this.deps, userId, limit, langOverride, filter);
  }

  /**
   * 实现已下沉 domains/cards-questions.ts，此处仅委托。
   */
  public async saveQuestion(question: any): Promise<Result<void, BusinessError>> {
    return saveQuestionDomain(this.deps, question);
  }

  /**
   * 实现已下沉 domains/cards-questions.ts，此处仅委托。
   */
  public async saveQuestions(questions: any[]): Promise<Result<void, BusinessError>> {
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
   * 创建练习集合并批量写入练习队列条目（collect:true）
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
    try {
      const parsed = input.questions.map((q) => {
        // 运行时再校验，避免坏 JSON 入库
        return q;
      });
      if (parsed.length === 0) {
        return err(
          new BusinessError('E_INVALID_INPUT', '练习队列至少需要 1 道题', 'VALIDATION')
        );
      }

      const collectionId = generateId('pcol');
      const createdAt = nowIso();
      const intent = input.intent ?? 'GENERATE_QUIZ';
      const language = await this.resolveActiveLanguage(input.userId);

      await this.db.insert(practiceCollections).values({
        id: collectionId,
        userId: input.userId,
        language,
        title: input.title,
        intent,
        layoutHint: input.layoutHint ?? null,
        sourceRef: input.sourceRef ?? null,
        createdAt,
        planRunId: input.planRunId ?? null,
        blockId: input.blockId ?? null,
        gradingMode: input.gradingMode ?? null,
      });

      const items: PracticeItem[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const q = parsed[i]!;
        const itemId = generateId('pitem');
        const skillIds = q.testedSkillId ? [q.testedSkillId] : [];
        await this.db.insert(practiceItems).values({
          id: itemId,
          userId: input.userId,
          language,
          collectionId,
          questionJson: JSON.stringify(q),
          skillIds: JSON.stringify(skillIds),
          sourceRef: input.sourceRef ?? null,
          passageDocumentId: null,
          sortOrder: i,
          collectedAt: createdAt,
        });
        items.push({
          id: itemId,
          userId: input.userId,
          collectionId,
          question: q,
          skillIds,
          sourceRef: input.sourceRef,
          sortOrder: i,
          collectedAt: createdAt,
        });
      }

      const collection: PracticeCollection = {
        id: collectionId,
        userId: input.userId,
        title: input.title,
        intent,
        layoutHint: input.layoutHint as PracticeCollection['layoutHint'],
        sourceRef: input.sourceRef,
        createdAt,
      };

      return ok({ collection, items });
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'collectPracticeQuestions',
          entityId: input.userId,
        })
      );
    }
  }

  public async listPracticeCollections(
    userId: string,
    limit = 20
  ): Promise<Result<PracticeCollection[], BusinessError>> {
    try {
      const language = await this.resolveActiveLanguage(userId);
      const rows = await this.db
        .select()
        .from(practiceCollections)
        .where(
          and(
            eq(practiceCollections.userId, userId),
            eq(practiceCollections.language, language)
          )
        )
        .orderBy(desc(practiceCollections.createdAt))
        .limit(limit);

      return ok(
        rows.map((r) => {
          const col: PracticeCollection = {
            id: r.id,
            userId: r.userId,
            title: r.title,
            intent: r.intent,
            createdAt: r.createdAt,
          };
          if (r.layoutHint) {
            col.layoutHint = r.layoutHint as PracticeCollection['layoutHint'];
          }
          if (r.sourceRef) col.sourceRef = r.sourceRef;
          return col;
        })
      );
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'listPracticeCollections',
          entityId: userId,
        })
      );
    }
  }

  public async listPracticeItems(
    userId: string,
    collectionId: string
  ): Promise<Result<PracticeItem[], BusinessError>> {
    try {
      const rows = await this.db
        .select()
        .from(practiceItems)
        .where(
          and(eq(practiceItems.userId, userId), eq(practiceItems.collectionId, collectionId))
        )
        .orderBy(asc(practiceItems.sortOrder));

      return ok(rows.map((r) => this.mapPracticeItemRow(r)));
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'listPracticeItems',
          entityId: collectionId,
        })
      );
    }
  }

  /**
   * 用户勾选练习队列条目 → 显式写入 FSRS 闪卡（collect 本身不建卡）
   */
  public async convertPracticeItemsToCards(
    userId: string,
    itemIds: string[]
  ): Promise<
    Result<{ createdCount: number; cardIds: string[]; skippedItemIds: string[] }, BusinessError>
  > {
    try {
      const uniqueIds = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
      if (uniqueIds.length === 0) {
        return err(
          new BusinessError('E_INVALID_INPUT', '请至少勾选一条练习队列条目再转入复习。', 'VALIDATION')
        );
      }
      if (uniqueIds.length > 50) {
        return err(
          new BusinessError('E_INVALID_INPUT', '单次最多转入 50 张闪卡。', 'VALIDATION')
        );
      }

      const rows = await this.db
        .select()
        .from(practiceItems)
        .where(and(eq(practiceItems.userId, userId), inArray(practiceItems.id, uniqueIds)));

      const found = new Set(rows.map((r) => r.id));
      const skippedItemIds = uniqueIds.filter((id) => !found.has(id));
      const cardIds: string[] = [];

      for (const row of rows) {
        const item = this.mapPracticeItemRow(row);
        const card = this.practiceItemToFlashcard(item);
        const saveRes = await this.saveCard(card);
        if (!isOk(saveRes)) {
          return saveRes;
        }
        cardIds.push(card.id);
      }

      return ok({
        createdCount: cardIds.length,
        cardIds,
        skippedItemIds,
      });
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'convertPracticeItemsToCards',
          entityId: userId,
        })
      );
    }
  }

  private mapPracticeItemRow(r: typeof practiceItems.$inferSelect): PracticeItem {
    const item: PracticeItem = {
      id: r.id,
      userId: r.userId,
      collectionId: r.collectionId,
      question: JSON.parse(r.questionJson) as GeneratedQuestion,
      skillIds: r.skillIds ? (JSON.parse(r.skillIds) as string[]) : [],
      sortOrder: r.sortOrder,
      collectedAt: r.collectedAt,
    };
    if (r.sourceRef) item.sourceRef = r.sourceRef;
    if (r.passageDocumentId) item.passageDocumentId = r.passageDocumentId;
    return item;
  }

  private practiceItemToFlashcard(item: PracticeItem): Flashcard {
    const q = item.question;
    const front = (q.content?.trim() || q.prompt).trim().slice(0, 240);
    const backParts = [
      q.correctAnswer ? `答案：${q.correctAnswer}` : '',
      q.explanation?.trim() || '',
    ].filter(Boolean);
    const back = (backParts.join('\n') || q.prompt).slice(0, 800);
    const tags = [
      '练习队列',
      ...(item.skillIds.length > 0 ? item.skillIds.slice(0, 3) : [q.testedSkillId || 'review']),
    ].filter(Boolean);

    return {
      id: generateId('card_pq'),
      userId: item.userId,
      type: 'VOCABULARY',
      front,
      back,
      tags,
      fsrs: {
        stability: 1.0,
        difficulty: 5.0,
        reps: 0,
        lapses: 0,
        dueAt: nowIso(),
        state: 'NEW',
      },
    };
  }

  // ===================== P5：可配置练习计划 =====================

  public async savePracticePlanTemplate(
    template: PracticePlanTemplate
  ): Promise<Result<PracticePlanTemplate, BusinessError>> {
    try {
      // 领域校验
      const vres = validatePracticePlanTemplate(template);
      if (!isOk(vres)) {
        return err(vres.error);
      }
      const now = nowIso();
      const existing = await this.db
        .select()
        .from(practicePlanTemplates)
        .where(and(eq(practicePlanTemplates.id, template.id), eq(practicePlanTemplates.userId, template.userId)))
        .limit(1);
      const nextRevision =
        existing.length > 0 ? (existing[0]!.revision ?? 0) + 1 : 1;
      const payload = {
        id: template.id,
        userId: template.userId,
        language: template.language,
        name: template.name,
        enabled: template.enabled ? 1 : 0,
        revision: nextRevision,
        blocksJson: JSON.stringify(template.blocks),
        createdAt: existing.length > 0 ? existing[0]!.createdAt : now,
        updatedAt: now,
      };
      if (existing.length > 0) {
        await this.db
          .update(practicePlanTemplates)
          .set({ name: payload.name, enabled: payload.enabled, revision: payload.revision, blocksJson: payload.blocksJson, updatedAt: now })
          .where(eq(practicePlanTemplates.id, template.id));
      } else {
        await this.db.insert(practicePlanTemplates).values(payload);
      }
      return ok({ ...template, revision: nextRevision, createdAt: payload.createdAt, updatedAt: now });
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'savePracticePlanTemplate', entityId: template.id }));
    }
  }

  public async listPracticePlanTemplates(
    userId: string,
    opts?: { language?: string | undefined; includeDisabled?: boolean | undefined }
  ): Promise<Result<PracticePlanTemplate[], BusinessError>> {
    try {
      const conds = [eq(practicePlanTemplates.userId, userId)];
      if (opts?.language) conds.push(eq(practicePlanTemplates.language, opts.language));
      if (!opts?.includeDisabled) conds.push(eq(practicePlanTemplates.enabled, 1));
      const rows = await this.db
        .select()
        .from(practicePlanTemplates)
        .where(and(...conds))
        .orderBy(desc(practicePlanTemplates.updatedAt));
      return ok(rows.map((r) => this.mapTemplateRow(r)));
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'listPracticePlanTemplates', entityId: userId }));
    }
  }

  public async getPracticePlanTemplate(
    userId: string,
    templateId: string
  ): Promise<Result<PracticePlanTemplate | null, BusinessError>> {
    try {
      const rows = await this.db
        .select()
        .from(practicePlanTemplates)
        .where(and(eq(practicePlanTemplates.id, templateId), eq(practicePlanTemplates.userId, userId)))
        .limit(1);
      if (rows.length === 0) return ok(null);
      return ok(this.mapTemplateRow(rows[0]!));
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'getPracticePlanTemplate', entityId: templateId }));
    }
  }

  public async deletePracticePlanTemplate(
    userId: string,
    templateId: string
  ): Promise<Result<void, BusinessError>> {
    try {
      await this.db
        .delete(practicePlanTemplates)
        .where(and(eq(practicePlanTemplates.id, templateId), eq(practicePlanTemplates.userId, userId)));
      return ok(undefined);
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'deletePracticePlanTemplate', entityId: templateId }));
    }
  }

  public async setPracticePlanTemplateEnabled(
    userId: string,
    templateId: string,
    enabled: boolean
  ): Promise<Result<PracticePlanTemplate | null, BusinessError>> {
    try {
      const existing = await this.db
        .select({ id: practicePlanTemplates.id })
        .from(practicePlanTemplates)
        .where(and(eq(practicePlanTemplates.id, templateId), eq(practicePlanTemplates.userId, userId)))
        .limit(1);
      if (existing.length === 0) return ok(null);
      await this.db
        .update(practicePlanTemplates)
        .set({ enabled: enabled ? 1 : 0, updatedAt: nowIso() })
        .where(and(eq(practicePlanTemplates.id, templateId), eq(practicePlanTemplates.userId, userId)));
      return await this.getPracticePlanTemplate(userId, templateId);
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'setPracticePlanTemplateEnabled', entityId: templateId }));
    }
  }

  public async copyPracticePlanTemplate(
    userId: string,
    templateId: string
  ): Promise<Result<PracticePlanTemplate, BusinessError>> {
    const sourceRes = await this.getPracticePlanTemplate(userId, templateId);
    if (!isOk(sourceRes)) return err(sourceRes.error);
    const source = sourceRes.value;
    if (!source) {
      return err(new BusinessError('E_PRACTICE_TEMPLATE_NOT_FOUND', '要复制的练习计划模板不存在，可能已被删除', 'VALIDATION'));
    }
    const copy: PracticePlanTemplate = {
      ...source,
      id: generateId('tpl'),
      name: `${source.name}（副本）`,
      enabled: false,
      revision: 0,
      blocks: source.blocks.map((b) => ({ ...b, id: generateId('blk') })),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return await this.savePracticePlanTemplate(copy);
  }

  public async startPracticePlanRun(
    userId: string,
    params: {
      language: 'en' | 'ja' | 'ko';
      templateId?: string | undefined;
      blocks?: PracticeBlockSpec[] | undefined;
    }
  ): Promise<Result<PracticePlanRun, BusinessError>> {
    try {
      let run: PracticePlanRun;
      if (params.templateId) {
        const tres = await this.getPracticePlanTemplate(userId, params.templateId);
        if (!isOk(tres) || !tres.value) {
          return err(new BusinessError('E_TEMPLATE_NOT_FOUND', '计划模板未找到', 'DATABASE'));
        }
        run = freezeRunFromTemplate({ template: tres.value, runId: generateId('prun') });
      } else if (params.blocks && params.blocks.length > 0) {
        run = {
          id: generateId('prun'),
          userId,
          language: params.language,
          templateId: undefined,
          templateRevision: undefined,
          blocks: params.blocks.map((b) => ({ ...b })),
          status: 'IN_PROGRESS',
          startedAt: nowIso(),
          createdAt: nowIso(),
        };
      } else {
        return err(new BusinessError('E_INVALID_RUN', '必须提供 templateId 或 blocks', 'VALIDATION'));
      }
      await this.db.insert(practicePlanRuns).values({
        id: run.id,
        userId,
        language: run.language,
        templateId: run.templateId ?? null,
        templateRevision: run.templateRevision ?? null,
        blocksJson: JSON.stringify(run.blocks),
        status: run.status,
        startedAt: run.startedAt,
        completedAt: null,
        createdAt: run.createdAt,
      });
      return ok(run);
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'startPracticePlanRun', entityId: userId }));
    }
  }

  public async getPracticePlanRun(
    userId: string,
    runId: string
  ): Promise<Result<PracticePlanRun | null, BusinessError>> {
    try {
      const rows = await this.db
        .select()
        .from(practicePlanRuns)
        .where(and(eq(practicePlanRuns.id, runId), eq(practicePlanRuns.userId, userId)))
        .limit(1);
      if (rows.length === 0) return ok(null);
      return ok(this.mapRunRow(rows[0]!));
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'getPracticePlanRun', entityId: runId }));
    }
  }

  public async listPracticePlanRuns(
    userId: string,
    opts?: { language?: string | undefined; status?: PracticeRunStatus | undefined }
  ): Promise<Result<PracticePlanRun[], BusinessError>> {
    try {
      const conds = [eq(practicePlanRuns.userId, userId)];
      if (opts?.language) conds.push(eq(practicePlanRuns.language, opts.language));
      if (opts?.status) conds.push(eq(practicePlanRuns.status, opts.status));
      const rows = await this.db
        .select()
        .from(practicePlanRuns)
        .where(and(...conds))
        .orderBy(desc(practicePlanRuns.createdAt));
      return ok(rows.map((r) => this.mapRunRow(r)));
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'listPracticePlanRuns', entityId: userId }));
    }
  }

  public async savePracticeItemDraft(
    userId: string,
    runId: string,
    itemId: string,
    userAnswer: string
  ): Promise<Result<PracticeItemAttempt, BusinessError>> {
    try {
      const runRes = await this.getPracticePlanRun(userId, runId);
      if (!isOk(runRes) || !runRes.value) {
        return err(new BusinessError('E_RUN_NOT_FOUND', '练习运行未找到', 'DATABASE'));
      }
      const existing = await this.db
        .select()
        .from(practiceItemAttempts)
        .where(and(eq(practiceItemAttempts.runId, runId), eq(practiceItemAttempts.itemId, itemId)))
        .limit(1);
      const now = nowIso();
      if (existing.length > 0) {
        const row = existing[0]!;
        await this.db
          .update(practiceItemAttempts)
          .set({ userAnswer, status: 'DRAFT' })
          .where(eq(practiceItemAttempts.id, row.id));
        return ok(this.mapAttemptRow({ ...row, userAnswer, status: 'DRAFT' }));
      }
      const id = generateId('patt');
      await this.db.insert(practiceItemAttempts).values({
        id,
        runId,
        blockId: '',
        itemId,
        status: 'DRAFT',
        userAnswer,
        gradingResultJson: null,
        timeSpentMs: null,
        submittedAt: null,
        gradedAt: null,
      });
      return ok({
        id,
        runId,
        blockId: '',
        itemId,
        status: 'DRAFT',
        userAnswer,
        timeSpentMs: undefined,
        submittedAt: undefined,
        gradedAt: undefined,
      });
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'savePracticeItemDraft', entityId: runId }));
    }
  }

  public async submitPracticeItem(
    userId: string,
    runId: string,
    itemId: string,
    userAnswer: string,
    gradingResult?: Record<string, unknown>,
    timeSpentMs?: number
  ): Promise<Result<PracticeItemAttempt, BusinessError>> {
    try {
      const runRes = await this.getPracticePlanRun(userId, runId);
      if (!isOk(runRes) || !runRes.value) {
        return err(new BusinessError('E_RUN_NOT_FOUND', '练习运行未找到', 'DATABASE'));
      }
      const now = nowIso();
      const existing = await this.db
        .select()
        .from(practiceItemAttempts)
        .where(and(eq(practiceItemAttempts.runId, runId), eq(practiceItemAttempts.itemId, itemId)))
        .limit(1);
      const status: 'SUBMITTED' | 'GRADED' = gradingResult ? 'GRADED' : 'SUBMITTED';
      if (existing.length > 0) {
        const row = existing[0]!;
        await this.db
          .update(practiceItemAttempts)
          .set({
            userAnswer,
            status,
            gradingResultJson: gradingResult ? JSON.stringify(gradingResult) : row.gradingResultJson,
            timeSpentMs: timeSpentMs ?? row.timeSpentMs,
            submittedAt: row.submittedAt ?? now,
            gradedAt: status === 'GRADED' ? now : row.gradedAt,
          })
          .where(eq(practiceItemAttempts.id, row.id));
        return ok(
          this.mapAttemptRow({
            ...row,
            userAnswer,
            status,
            gradingResultJson: gradingResult ? JSON.stringify(gradingResult) : row.gradingResultJson,
            timeSpentMs: timeSpentMs ?? row.timeSpentMs,
            submittedAt: row.submittedAt ?? now,
            gradedAt: status === 'GRADED' ? now : row.gradedAt,
          })
        );
      }
      const id = generateId('patt');
      await this.db.insert(practiceItemAttempts).values({
        id,
        runId,
        blockId: '',
        itemId,
        status,
        userAnswer,
        gradingResultJson: gradingResult ? JSON.stringify(gradingResult) : null,
        timeSpentMs: timeSpentMs ?? null,
        submittedAt: now,
        gradedAt: status === 'GRADED' ? now : null,
      });
      return ok({
        id,
        runId,
        blockId: '',
        itemId,
        status,
        userAnswer,
        gradingResult: gradingResult,
        timeSpentMs,
        submittedAt: now,
        gradedAt: status === 'GRADED' ? now : undefined,
      });
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'submitPracticeItem', entityId: runId }));
    }
  }

  public async listPracticeItemAttempts(
    runId: string
  ): Promise<Result<PracticeItemAttempt[], BusinessError>> {
    try {
      const rows = await this.db
        .select()
        .from(practiceItemAttempts)
        .where(eq(practiceItemAttempts.runId, runId));
      return ok(rows.map((r) => this.mapAttemptRow(r)));
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'listPracticeItemAttempts', entityId: runId }));
    }
  }

  /** P5：按 run 聚合所有关联集合的题目（practice_collections.plan_run_id = runId）。 */
  public async getPracticeRunItems(
    userId: string,
    runId: string
  ): Promise<Result<Array<{ itemId: string; blockId: string; gradingMode: string; question: GeneratedQuestion }>, BusinessError>> {
    try {
      const cols = await this.db
        .select()
        .from(practiceCollections)
        .where(and(eq(practiceCollections.userId, userId), eq(practiceCollections.planRunId, runId)));
      if (cols.length === 0) return ok([]);
      const collectionIds = cols.map((c) => c.id);
      const itemRows = await this.db
        .select()
        .from(practiceItems)
        .where(inArray(practiceItems.collectionId, collectionIds))
        .orderBy(asc(practiceItems.sortOrder));
      const colByBlock = new Map(cols.map((c) => [c.id, { blockId: c.blockId ?? '', gradingMode: c.gradingMode ?? 'AUTO_IMMEDIATE' }]));
      const out = itemRows.map((r) => {
        const meta = colByBlock.get(r.collectionId) ?? { blockId: '', gradingMode: 'AUTO_IMMEDIATE' };
        const question = safeJsonParse(r.questionJson) as GeneratedQuestion;
        return {
          itemId: r.id,
          blockId: meta.blockId,
          gradingMode: meta.gradingMode,
          question,
        };
      });
      return ok(out);
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'getPracticeRunItems', entityId: runId }));
    }
  }

  public async finalizePracticePlanRun(
    userId: string,
    runId: string
  ): Promise<Result<PracticePlanRun, BusinessError>> {
    try {
      return await this.withTransaction(async (repo) => {
        const runRes = await repo.getPracticePlanRun(userId, runId);
        if (!isOk(runRes) || !runRes.value) {
          return err(new BusinessError('E_RUN_NOT_FOUND', '练习运行未找到', 'DATABASE'));
        }
        const run = runRes.value;
        if (run.status === 'COMPLETED') {
          return ok(run);
        }
        const attemptsRes = await repo.listPracticeItemAttempts(runId);
        if (!isOk(attemptsRes)) return err(attemptsRes.error);
        const graded = attemptsRes.value.filter((a) => a.status === 'GRADED' && a.gradingResult);
        // 原子写入既有 quiz_attempts/错题/打卡（SSOT）。
        // 每个 GRADED 尝试按其 gradingResult 写一次 quiz_attempt；幂等：同 itemId 已写则跳过。
        for (const a of graded) {
          const already = await repo.db
            .select({ id: quizAttempts.id })
            .from(quizAttempts)
            .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.questionId, a.itemId)))
            .limit(1);
          if (already.length > 0) continue;
          const g = a.gradingResult as {
            isCorrect?: boolean;
            score?: number;
            testedSkillId?: string;
            explanation?: string;
            correctAnswer?: string;
          };
          const isCorrect = g.isCorrect ?? false;
          const score = typeof g.score === 'number' ? g.score : isCorrect ? 1 : 0;
          await repo.db.insert(quizAttempts).values({
            id: generateId('qatt'),
            userId,
            language: run.language,
            questionId: a.itemId,
            userAnswer: a.userAnswer ?? '',
            isCorrect,
            score,
            timeSpentMs: a.timeSpentMs ?? 0,
            testedSkillId: g.testedSkillId ?? 'review',
            createdAt: a.gradedAt ?? nowIso(),
          });
          // 记录每日活动（打卡 SSOT）；按 GRADED 题数累加 quizzes。
          await repo.recordDailyActivity(userId, { quizzes: 1, date: (a.gradedAt ?? nowIso()).slice(0, 10) });
        }
        const now = nowIso();
        await repo.db
          .update(practicePlanRuns)
          .set({ status: 'COMPLETED', completedAt: now })
          .where(eq(practicePlanRuns.id, runId));
        return ok({ ...run, status: 'COMPLETED', completedAt: now });
      });
    } catch (error) {
      return err(translateToBusinessError(error, { category: 'DATABASE', action: 'finalizePracticePlanRun', entityId: runId }));
    }
  }

  private mapTemplateRow(r: typeof practicePlanTemplates.$inferSelect): PracticePlanTemplate {
    const blocks = parsePracticeBlockSpecs(safeJsonParse(r.blocksJson)) ?? [];
    return {
      id: r.id,
      userId: r.userId,
      language: r.language as 'en' | 'ja' | 'ko',
      name: r.name,
      enabled: r.enabled === 1,
      revision: r.revision,
      blocks,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private mapRunRow(r: typeof practicePlanRuns.$inferSelect): PracticePlanRun {
    const blocks = parsePracticeBlockSpecs(safeJsonParse(r.blocksJson)) ?? [];
    return {
      id: r.id,
      userId: r.userId,
      language: r.language as 'en' | 'ja' | 'ko',
      templateId: r.templateId ?? undefined,
      templateRevision: r.templateRevision ?? undefined,
      blocks,
      status: r.status as PracticeRunStatus,
      startedAt: r.startedAt,
      completedAt: r.completedAt ?? undefined,
      createdAt: r.createdAt,
    };
  }

  private mapAttemptRow(r: typeof practiceItemAttempts.$inferSelect): PracticeItemAttempt {
    return {
      id: r.id,
      runId: r.runId,
      blockId: r.blockId,
      itemId: r.itemId,
      status: r.status as PracticeItemAttempt['status'],
      userAnswer: r.userAnswer ?? undefined,
      gradingResult: r.gradingResultJson ? (safeJsonParse(r.gradingResultJson) as Record<string, unknown>) : undefined,
      timeSpentMs: r.timeSpentMs ?? undefined,
      submittedAt: r.submittedAt ?? undefined,
      gradedAt: r.gradedAt ?? undefined,
    };
  }
}
