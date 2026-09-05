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

  public async saveMistake(mistake: MistakeEntry): Promise<Result<void, BusinessError>> {
    try {
      const skillId =
        (mistake.question as any)?.testedSkillId ||
        (mistake.question as any)?.testedSkill ||
        '';
      const language = normalizeTrackLanguage(
        (mistake as any).language ??
          (await this.resolveActiveLanguage(mistake.userId)) ??
          inferLanguageFromSkillId(String(skillId))
      );
      const existing = await this.db
        .select()
        .from(mistakes)
        .where(eq(mistakes.id, mistake.id))
        .limit(1);

      if (existing.length > 0) {
        await this.db
          .update(mistakes)
          .set({
            language,
            questionId: mistake.questionId,
            question: JSON.stringify(mistake.question),
            lastUserSubmission: mistake.lastUserSubmission,
            lastGrading: JSON.stringify(mistake.lastGrading),
            recordedAt: mistake.recordedAt,
            lastRetriedAt: mistake.lastRetriedAt ?? null,
            retryCount: mistake.retryCount,
            consecutiveCorrect: mistake.consecutiveCorrect,
            isResolved: mistake.isResolved,
          })
          .where(eq(mistakes.id, mistake.id));
      } else {
        await this.db.insert(mistakes).values({
          id: mistake.id,
          userId: mistake.userId,
          language,
          questionId: mistake.questionId,
          question: JSON.stringify(mistake.question),
          lastUserSubmission: mistake.lastUserSubmission,
          lastGrading: JSON.stringify(mistake.lastGrading),
          recordedAt: mistake.recordedAt,
          lastRetriedAt: mistake.lastRetriedAt ?? null,
          retryCount: mistake.retryCount,
          consecutiveCorrect: mistake.consecutiveCorrect,
          isResolved: mistake.isResolved,
        });
      }

      return ok(undefined);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'saveMistake',
          entityId: mistake.id,
        })
      );
    }
  }

  public async getMistakes(
    userId: string,
    filter?: { resolved?: boolean; language?: string }
  ): Promise<Result<MistakeEntry[], BusinessError>> {
    try {
      const language = filter?.language
        ? normalizeTrackLanguage(filter.language)
        : await this.resolveActiveLanguage(userId);
      let rows = await this.db
        .select()
        .from(mistakes)
        .where(and(eq(mistakes.userId, userId), eq(mistakes.language, language)));

      const filteredRows = filter?.resolved !== undefined
        ? rows.filter((r) => Boolean(r.isResolved) === filter.resolved)
        : rows;

      const results: MistakeEntry[] = filteredRows.map((r) => ({
        id: r.id,
        userId: r.userId,
        questionId: r.questionId,
        question: JSON.parse(r.question),
        lastUserSubmission: r.lastUserSubmission,
        lastGrading: JSON.parse(r.lastGrading),
        recordedAt: r.recordedAt,
        lastRetriedAt: r.lastRetriedAt ?? undefined,
        retryCount: r.retryCount,
        consecutiveCorrect: r.consecutiveCorrect,
        isResolved: Boolean(r.isResolved),
      }));

      return ok(results);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'getMistakes',
          entityId: userId,
        })
      );
    }
  }

  public async resolveMistake(mistakeId: string): Promise<Result<void, BusinessError>> {
    try {
      const rows = await this.db
        .select()
        .from(mistakes)
        .where(eq(mistakes.id, mistakeId))
        .limit(1);

      if (rows.length === 0) {
        return err(new BusinessError('E_NOT_FOUND', '错题记录未找到', 'DATABASE'));
      }

      const mistake = rows[0]!;
      await this.db
        .update(mistakes)
        .set({
          isResolved: true,
          consecutiveCorrect: Math.max(2, mistake.consecutiveCorrect + 1),
          lastRetriedAt: nowIso(),
        })
        .where(eq(mistakes.id, mistakeId));

      // 自动记录错题消除足迹
      await this.recordDailyActivity(mistake.userId, { mistakesResolved: 1 });

      return ok(undefined);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'resolveMistake',
          entityId: mistakeId,
        })
      );
    }
  }

  /**
   * 记录一次错题重做结果；是否出库完全由 SQLite 中的连续正确次数决定。
   */
  public async retryMistake(
    userId: string,
    mistakeId: string,
    isCorrect: boolean
  ): Promise<Result<Pick<MistakeEntry, 'consecutiveCorrect' | 'isResolved' | 'retryCount'>, BusinessError>> {
    try {
      const rows = await this.db
        .select()
        .from(mistakes)
        .where(and(eq(mistakes.id, mistakeId), eq(mistakes.userId, userId)))
        .limit(1);

      if (rows.length === 0) {
        return err(new BusinessError('E_NOT_FOUND', '错题记录未找到', 'DATABASE'));
      }

      const mistake = rows[0]!;
      const consecutiveCorrect = isCorrect ? mistake.consecutiveCorrect + 1 : 0;
      const isResolved = consecutiveCorrect >= 2;
      const retryCount = mistake.retryCount + 1;

      await this.db
        .update(mistakes)
        .set({
          retryCount,
          consecutiveCorrect,
          isResolved,
          lastRetriedAt: nowIso(),
        })
        .where(eq(mistakes.id, mistakeId));

      // 仅在本次由未攻克转为攻克时计入每日完成量。
      if (isResolved && !mistake.isResolved) {
        await this.recordDailyActivity(userId, { mistakesResolved: 1 });
      }

      return ok({ consecutiveCorrect, isResolved, retryCount });
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'retryMistake',
          entityId: mistakeId,
        })
      );
    }
  }

  // ==================== 文档与教材资产 (Documents) ====================

  /**
   * 保存或更新教材/文档
   */
  public async saveDocument(doc: DocumentItem): Promise<Result<DocumentItem, BusinessError>> {
    try {
      const existing = await this.db
        .select()
        .from(documents)
        .where(eq(documents.id, doc.id))
        .limit(1);

      if (existing.length > 0) {
        await this.db
          .update(documents)
          .set({
            title: doc.title,
            sourceKind: doc.sourceKind,
            language: doc.language,
            content: doc.content,
            astJson: doc.astJson ?? null,
            topic: doc.topic ?? null,
            difficulty: doc.difficulty ?? null,
            sourceUrl: doc.sourceUrl ?? null,
            sourcePublisher: doc.sourcePublisher ?? null,
            examTag: doc.examTag ?? null,
            updatedAt: doc.updatedAt || nowIso(),
          })
          .where(eq(documents.id, doc.id));
      } else {
        await this.db.insert(documents).values({
          id: doc.id,
          userId: doc.userId,
          title: doc.title,
          sourceKind: doc.sourceKind,
          language: doc.language,
          content: doc.content,
          astJson: doc.astJson ?? null,
          topic: doc.topic ?? null,
          difficulty: doc.difficulty ?? null,
          sourceUrl: doc.sourceUrl ?? null,
          sourcePublisher: doc.sourcePublisher ?? null,
          examTag: doc.examTag ?? null,
          createdAt: doc.createdAt || nowIso(),
          updatedAt: doc.updatedAt || nowIso(),
        });
      }

      return ok(doc);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'saveDocument',
          entityId: doc.id,
        })
      );
    }
  }

  /**
   * 列出用户拥有的教材与导入文档
   */
  public async listDocuments(
    userId: string,
    sourceKind?: string
  ): Promise<Result<DocumentItem[], BusinessError>> {
    try {
      let query = this.db.select().from(documents);
      const conditions = [eq(documents.userId, userId)];
      if (sourceKind) {
        conditions.push(eq(documents.sourceKind, sourceKind));
      }

      const rows = await query
        .where(and(...conditions))
        .orderBy(desc(documents.updatedAt));

      const items: DocumentItem[] = rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        title: r.title,
        sourceKind: r.sourceKind as any,
        language: r.language,
        content: r.content,
        astJson: r.astJson ?? undefined,
        topic: r.topic ?? undefined,
        difficulty: r.difficulty ?? undefined,
        sourceUrl: r.sourceUrl ?? undefined,
        sourcePublisher: r.sourcePublisher ?? undefined,
        examTag: r.examTag ?? undefined,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));

      return ok(items);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'listDocuments',
          entityId: userId,
        })
      );
    }
  }

  /**
   * 根据 ID 查询特定文档/教材
   */
  public async getDocumentById(id: string): Promise<Result<DocumentItem | null, BusinessError>> {
    try {
      const rows = await this.db
        .select()
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);

      if (rows.length === 0) {
        return ok(null);
      }

      const r = rows[0]!;
      return ok({
        id: r.id,
        userId: r.userId,
        title: r.title,
        sourceKind: r.sourceKind as any,
        language: r.language,
        content: r.content,
        astJson: r.astJson ?? undefined,
        topic: r.topic ?? undefined,
        difficulty: r.difficulty ?? undefined,
        sourceUrl: r.sourceUrl ?? undefined,
        sourcePublisher: r.sourcePublisher ?? undefined,
        examTag: r.examTag ?? undefined,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      });
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'getDocumentById',
          entityId: id,
        })
      );
    }
  }

  /**
   * 删除文档及其关联批注
   */
  public async deleteDocument(id: string, userId: string): Promise<Result<void, BusinessError>> {
    try {
      await this.db
        .delete(annotations)
        .where(and(eq(annotations.documentId, id), eq(annotations.userId, userId)));
      await this.db
        .delete(documents)
        .where(and(eq(documents.id, id), eq(documents.userId, userId)));
      return ok(undefined);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'deleteDocument',
          entityId: id,
        })
      );
    }
  }

  // ==================== 划线高亮与批注 (Annotations) ====================

  /**
   * 保存划线批注
   */
  public async saveAnnotation(ann: AnnotationItem): Promise<Result<AnnotationItem, BusinessError>> {
    try {
      await this.db.insert(annotations).values({
        id: ann.id,
        documentId: ann.documentId,
        userId: ann.userId,
        kind: ann.kind,
        quote: ann.quote,
        note: ann.note ?? null,
        startOffset: ann.startOffset,
        endOffset: ann.endOffset,
        pageNumber: ann.pageNumber ?? null,
        createdBy: ann.createdBy,
        flashcardId: ann.flashcardId ?? null,
        createdAt: ann.createdAt || nowIso(),
      });

      return ok(ann);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'saveAnnotation',
          entityId: ann.id,
        })
      );
    }
  }

  /**
   * 获取某篇文档下的所有划线批注
   */
  public async listAnnotations(
    documentId: string,
    userId: string
  ): Promise<Result<AnnotationItem[], BusinessError>> {
    try {
      const rows = await this.db
        .select()
        .from(annotations)
        .where(and(eq(annotations.documentId, documentId), eq(annotations.userId, userId)))
        .orderBy(desc(annotations.createdAt));

      const items: AnnotationItem[] = rows.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        userId: r.userId,
        kind: r.kind as any,
        quote: r.quote,
        note: r.note ?? undefined,
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        pageNumber: r.pageNumber ?? undefined,
        createdBy: r.createdBy as any,
        flashcardId: r.flashcardId ?? undefined,
        createdAt: r.createdAt,
      }));

      return ok(items);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'listAnnotations',
          entityId: documentId,
        })
      );
    }
  }

  /**
   * 删除特定批注
   */
  public async deleteAnnotation(
    annotationId: string,
    userId: string
  ): Promise<Result<void, BusinessError>> {
    try {
      await this.db
        .delete(annotations)
        .where(and(eq(annotations.id, annotationId), eq(annotations.userId, userId)));
      return ok(undefined);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'deleteAnnotation',
          entityId: annotationId,
        })
      );
    }
  }

  /**
   * 批注一键转为 FSRS 复习卡片
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
    try {
      const rows = await this.db
        .select()
        .from(annotations)
        .where(and(eq(annotations.id, annotationId), eq(annotations.userId, userId)))
        .limit(1);

      if (rows.length === 0) {
        return err(new BusinessError('E_NOT_FOUND', '未找到对应的批注记录', 'DATABASE'));
      }

      const ann = rows[0]!;
      const cardId = generateId('card_ann');
      const now = nowIso();

      const newCard: Flashcard = {
        id: cardId,
        userId,
        type: 'VOCABULARY',
        front: cardData.front,
        back: cardData.back,
        phonetic: cardData.phonetic || undefined,
        audioUrl: undefined,
        tags: [cardData.tag || '课文批注', cardData.pos || '重点词句'],
        fsrs: {
          stability: 1.0,
          difficulty: 5.0,
          reps: 0,
          lapses: 0,
          dueAt: now,
          state: 'NEW',
        },
      };

      // 1. 插入 flashcards
      await this.saveCard(newCard);

      // 2. 回填批注关联卡片 ID
      await this.db
        .update(annotations)
        .set({ flashcardId: cardId })
        .where(eq(annotations.id, annotationId));

      return ok(newCard);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'convertAnnotationToCard',
          entityId: annotationId,
        })
      );
    }
  }

  // ==================== 五十音课程底座 (Curriculum Kana) ====================

  /**
   * 获取五十音课程底座数据，支持按类型过滤
   */
  public async getCurriculumKana(
    type?: string
  ): Promise<Result<KanaItem[], BusinessError>> {
    try {
      let rows;
      if (type) {
        rows = await this.db
          .select()
          .from(curriculumKana)
          .where(eq(curriculumKana.type, type))
          .orderBy(asc(curriculumKana.sortOrder));
      } else {
        rows = await this.db
          .select()
          .from(curriculumKana)
          .orderBy(asc(curriculumKana.sortOrder));
      }

      const items: KanaItem[] = rows.map((r) => ({
        id: r.id,
        type: r.type as any,
        hiragana: r.hiragana,
        katakana: r.katakana,
        romaji: r.romaji,
        row: r.row,
        col: r.col,
        mnemonic: r.mnemonic ?? undefined,
        audioText: r.audioText,
        sortOrder: r.sortOrder,
      }));

      return ok(items);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'getCurriculumKana',
          entityId: type ?? 'ALL',
        })
      );
    }
  }

  /**
   * 读取 learning.content 内容模板（按 action / language / skill / format 过滤）
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
    try {
      const language = normalizeTrackLanguage(options.language);
      let rows = await this.db
        .select()
        .from(learningContentTemplates)
        .where(
          and(
            eq(learningContentTemplates.action, options.action),
            eq(learningContentTemplates.language, language)
          )
        )
        .orderBy(asc(learningContentTemplates.sortOrder));

      if (options.format) {
        rows = rows.filter((r) => r.format === options.format);
      }
      if (options.genre) {
        const byGenre = rows.filter((r) => r.genre === options.genre);
        if (byGenre.length > 0) rows = byGenre;
      }
      if (options.skillId) {
        const bySkill = rows.filter((r) => r.skillId === options.skillId);
        if (bySkill.length > 0) {
          rows = bySkill;
        } else if (options.skillId.includes('particle')) {
          const particleRows = rows.filter((r) => r.skillId?.includes('particle'));
          if (particleRows.length > 0) rows = particleRows;
        }
      }

      const mapped = rows.map((r) => ({
        id: r.id,
        language: r.language,
        action: r.action,
        format: r.format,
        skillId: r.skillId,
        difficulty: r.difficulty,
        topic: r.topic,
        genre: r.genre,
        sortOrder: r.sortOrder,
        payload: JSON.parse(r.payload) as Record<string, unknown>,
      }));

      return ok(options.limit ? mapped.slice(0, options.limit) : mapped);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'listContentTemplates',
          entityId: options.action,
        })
      );
    }
  }

  /**
   * 记录假名练习结果并回写学习者熟练度与每日打卡活动
   */
  public async recordKanaPractice(
    userId: string,
    kanaId: string,
    isCorrect: boolean,
    scriptType: 'HIRAGANA' | 'KATAKANA' | 'ROMAJI' = 'HIRAGANA'
  ): Promise<Result<{ proficiency: number }, BusinessError>> {
    try {
      const skillId = scriptType === 'KATAKANA' ? 'jp.kana.katakana' : 'jp.kana.hiragana';
      const skillName = scriptType === 'KATAKANA' ? '片假名认读与听写' : '平假名认读与听写';

      const existingRows = await this.db
        .select()
        .from(skillMetrics)
        .where(and(eq(skillMetrics.userId, userId), eq(skillMetrics.skillId, skillId)))
        .limit(1);

      let totalAttempts = 1;
      let correctAttempts = isCorrect ? 1 : 0;
      let consecutiveErrors = isCorrect ? 0 : 1;

      if (existingRows.length > 0) {
        const row = existingRows[0]!;
        totalAttempts = row.totalAttempts + 1;
        correctAttempts = row.correctAttempts + (isCorrect ? 1 : 0);
        consecutiveErrors = isCorrect ? 0 : row.consecutiveErrors + 1;
      }

      const proficiency = Math.min(
        1.0,
        Math.max(0.05, Number((correctAttempts / totalAttempts).toFixed(2)))
      );

      const status =
        consecutiveErrors >= 2
          ? 'WEAKNESS'
          : proficiency >= 0.85 && totalAttempts >= 5
          ? 'STRENGTH'
          : 'NORMAL';

      await this.saveSkillMetric(userId, {
        id: skillId,
        dimension: 'VOCABULARY',
        name: skillName,
        proficiency,
        totalAttempts,
        correctAttempts,
        consecutiveErrors,
        status,
        lastPracticedAt: nowIso(),
      });

      // 累计当日学习足迹
      await this.recordDailyActivity(userId, { quizzes: 1 });

      return ok({ proficiency });
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'recordKanaPractice',
          entityId: kanaId,
        })
      );
    }
  }

  /**
   * 检索阅读理解篇目套题列表 (AI 分级篇目 / 真实新闻)
   */
  public async listReadingSets(
    userId: string,
    origin?: 'ai' | 'news' | 'user_import',
    language?: 'JA' | 'EN' | 'KO'
  ): Promise<Result<ReadingPassageSet[], BusinessError>> {
    try {
      const userCondition = or(
        eq(documents.userId, userId),
        eq(documents.userId, 'default_user'),
        eq(documents.userId, 'system')
      );

      const rows = await this.db
        .select()
        .from(documents)
        .where(
          and(
            userCondition,
            inArray(documents.sourceKind, ['ai_generated', 'news', 'user_import'])
          )
        )
        .orderBy(desc(documents.createdAt));

      const sets: ReadingPassageSet[] = rows
        .map((row) => {
          let questions = [];
          if (row.astJson) {
            try {
              const parsed = JSON.parse(row.astJson);
              questions = parsed.questions || [];
            } catch {
              questions = [];
            }
          }
          const itemOrigin =
            row.sourceKind === 'news'
              ? ('news' as const)
              : row.sourceKind === 'ai_generated'
              ? ('ai' as const)
              : ('user_import' as const);

          const upper = row.language.toUpperCase();
          const itemLang =
            upper === 'EN' ? ('EN' as const) : upper === 'KO' ? ('KO' as const) : ('JA' as const);

          return {
            id: row.id,
            origin: itemOrigin,
            title: row.title,
            topic: row.topic || '综合',
            difficulty: (row.difficulty ?? 2) as 1 | 2 | 3 | 4 | 5,
            language: itemLang,
            sourceLabel:
              row.sourcePublisher ||
              (itemOrigin === 'news' ? '合规精选新闻' : 'AI 精选篇目'),
            sourceUrl: row.sourceUrl ?? undefined,
            body: row.content,
            questions,
            createdAt: row.createdAt,
            // P3-B 回填结构化来源元数据
            sourceKind:
              (row.sourceKindDetail as ReadingPassageSet['sourceKind']) ??
              (itemOrigin === 'ai' ? 'ai' : itemOrigin === 'user_import' ? 'user_import' : undefined),
            ...(row.fetchStatus
              ? { fetchStatus: row.fetchStatus as ReadingPassageSet['fetchStatus'] }
              : {}),
            ...(row.newsPublisher ? { publisher: row.newsPublisher } : {}),
          };
        })
        .filter((set) => {
          if (origin && set.origin !== origin) return false;
          if (language && set.language !== language) return false;
          return true;
        });

      return ok(sets);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'listReadingSets',
          entityId: userId,
        })
      );
    }
  }

  /**
   * 保存或更新阅读理解篇目套题
   */
  public async saveReadingSet(
    userId: string,
    set: ReadingPassageSet
  ): Promise<Result<ReadingPassageSet, BusinessError>> {
    try {
      const now = nowIso();
      const sourceKind =
        set.origin === 'news' ? 'news' : set.origin === 'ai' ? 'ai_generated' : 'user_import';

      const existing = await this.db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.id, set.id))
        .limit(1);

      if (existing.length > 0) {
        await this.db
          .update(documents)
          .set({
            title: set.title,
            content: set.body,
            astJson: JSON.stringify({ questions: set.questions }),
            topic: set.topic,
            difficulty: set.difficulty,
            sourceUrl: set.sourceUrl ?? null,
            sourcePublisher: set.sourceLabel,
            sourceKindDetail: set.sourceKind ?? null,
            fetchStatus: set.fetchStatus ?? null,
            newsPublisher: set.publisher ?? null,
            updatedAt: now,
          })
          .where(eq(documents.id, set.id));
      } else {
        await this.db.insert(documents).values({
          id: set.id,
          userId,
          title: set.title,
          sourceKind,
          language: set.language.toLowerCase(),
          content: set.body,
          astJson: JSON.stringify({ questions: set.questions }),
          topic: set.topic,
          difficulty: set.difficulty,
          sourceUrl: set.sourceUrl ?? null,
          sourcePublisher: set.sourceLabel,
          sourceKindDetail: set.sourceKind ?? null,
          fetchStatus: set.fetchStatus ?? null,
          newsPublisher: set.publisher ?? null,
          createdAt: set.createdAt || now,
          updatedAt: now,
        });
      }

      return ok(set);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'saveReadingSet',
          entityId: set.id,
        })
      );
    }
  }

  /**
   * 记录阅读理解做题成绩，同步更新学情雷达与当日打卡活动
   */
  public async recordReadingPractice(
    userId: string,
    input: SubmitReadingPractice
  ): Promise<Result<{ proficiency: number }, BusinessError>> {
    try {
      const skillId =
        input.language === 'JA'
          ? 'jp.reading.comprehension'
          : input.language === 'KO'
            ? 'ko.reading.comprehension'
            : 'en.reading.comprehension';
      const skillName =
        input.language === 'JA'
          ? '日语长文阅读与理解'
          : input.language === 'KO'
            ? '韩语阅读理解（扩展预留）'
            : '英语篇章精读与理解';

      const existingRows = await this.db
        .select()
        .from(skillMetrics)
        .where(and(eq(skillMetrics.userId, userId), eq(skillMetrics.skillId, skillId)))
        .limit(1);

      let totalAttempts = input.totalQuestions;
      let correctAttempts = input.score;
      const isGoodScore = input.score >= Math.ceil(input.totalQuestions * 0.6);
      let consecutiveErrors = isGoodScore ? 0 : 1;

      if (existingRows.length > 0) {
        const row = existingRows[0]!;
        totalAttempts = row.totalAttempts + input.totalQuestions;
        correctAttempts = row.correctAttempts + input.score;
        consecutiveErrors = isGoodScore ? 0 : row.consecutiveErrors + 1;
      }

      const proficiency = Math.min(
        1.0,
        Math.max(0.05, Number((correctAttempts / totalAttempts).toFixed(2)))
      );

      const status =
        consecutiveErrors >= 2
          ? 'WEAKNESS'
          : proficiency >= 0.85 && totalAttempts >= 6
          ? 'STRENGTH'
          : 'NORMAL';

      await this.saveSkillMetric(userId, {
        id: skillId,
        dimension: 'READING',
        name: skillName,
        proficiency,
        totalAttempts,
        correctAttempts,
        consecutiveErrors,
        status,
        lastPracticedAt: nowIso(),
      });

      // 阅读篇目单独计数；题量仍计入 quizzes 以兼容原有每日目标
      await this.recordDailyActivity(userId, {
        quizzes: input.totalQuestions,
        reading: 1,
      });

      return ok({ proficiency });
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'recordReadingPractice',
          entityId: input.setId,
        })
      );
    }
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
