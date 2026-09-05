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

export type TrackLanguage = 'ja' | 'en' | 'ko';

export interface LocalDictionaryEntry {
  id: string;
  language: TrackLanguage;
  headword: string;
  reading?: string | undefined;
  romanization?: string | undefined;
  meanings: string[];
  pronunciation?: Record<string, unknown> | undefined;
  partOfSpeech?: string | undefined;
  sourceLabel: string;
  licenseNote: string;
}

/** 词典资产被收集为用户 FSRS 生词卡后的领域结果；不依赖任何具体界面。 */
export interface DictionaryEntryCollection {
  card: Flashcard;
  created: boolean;
}

export function normalizeTrackLanguage(raw: string | null | undefined): TrackLanguage {
  const v = (raw || '').toLowerCase();
  if (v === 'en' || v === 'eng') return 'en';
  if (v === 'ko' || v === 'kr') return 'ko';
  if (v === 'ja' || v === 'jp') return 'ja';
  return 'en';
}

export function inferLanguageFromSkillId(skillId: string): TrackLanguage {
  if (skillId.startsWith('en.')) return 'en';
  if (skillId.startsWith('ko.')) return 'ko';
  return 'ja';
}

function defaultLanguageProfileSeed(language: TrackLanguage) {
  if (language === 'ja') {
    return { studyGoal: 'JLPT_N2', learnerLevel: 'BEGINNER', overallLevel: 'N3-' };
  }
  if (language === 'ko') {
    return { studyGoal: 'TOPIK_I', learnerLevel: 'BEGINNER', overallLevel: 'A1' };
  }
  return { studyGoal: 'CET6', learnerLevel: 'BEGINNER', overallLevel: 'B1' };
}

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayString(todayStr: string): string {
  const d = new Date(`${todayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function safeJsonParse(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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
   */
  public async searchLocalDictionary(
    language: TrackLanguage,
    query: string,
    limit = 20
  ): Promise<Result<LocalDictionaryEntry[], BusinessError>> {
    try {
      const normalized = query.trim();
      if (!normalized) return ok([]);

      const pattern = `%${normalized}%`;
      const rows = await this.db
        .select()
        .from(localDictionaryEntries)
        .where(
          and(
            eq(localDictionaryEntries.language, language),
            or(
              like(localDictionaryEntries.headword, pattern),
              like(localDictionaryEntries.reading, pattern),
              like(localDictionaryEntries.romanization, pattern)
            )
          )
        )
        .limit(Math.min(Math.max(limit, 1), 50));

      return ok(
        rows.map((row): LocalDictionaryEntry => {
          const entry: LocalDictionaryEntry = {
            id: row.id,
            language: row.language as TrackLanguage,
            headword: row.headword,
            meanings: JSON.parse(row.meaningsJson) as string[],
            sourceLabel: row.sourceLabel,
            licenseNote: row.licenseNote,
          };
          if (row.reading) entry.reading = row.reading;
          if (row.romanization) entry.romanization = row.romanization;
          if (row.pronunciationJson) {
            entry.pronunciation = JSON.parse(row.pronunciationJson) as Record<string, unknown>;
          }
          if (row.partOfSpeech) entry.partOfSpeech = row.partOfSpeech;
          return entry;
        })
      );
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'searchLocalDictionary',
          entityId: query,
        })
      );
    }
  }

  /**
   * 将一个已安装的本地词典条目收集为用户生词卡。
   * 词典内容仍保持公共只读资产；这里只创建或返回用户自己的 FSRS 状态。
   */
  public async collectDictionaryEntry(
    userId: string,
    entryId: string
  ): Promise<Result<DictionaryEntryCollection, BusinessError>> {
    try {
      const entryRows = await this.db
        .select()
        .from(localDictionaryEntries)
        .where(eq(localDictionaryEntries.id, entryId))
        .limit(1);
      const entry = entryRows[0];
      if (!entry) {
        return err(
          new BusinessError('E_NOT_FOUND', '该词典条目不存在或对应词典包尚未安装。', 'LEARNER_STATE')
        );
      }

      const existingRows = await this.db
        .select()
        .from(flashcards)
        .where(
          and(
            eq(flashcards.userId, userId),
            eq(flashcards.sourceEntryId, entry.id)
          )
        )
        .limit(1);
      const existing = existingRows[0];
      if (existing) {
        return ok({
          created: false,
          card: {
            id: existing.id,
            userId: existing.userId,
            type: existing.type as Flashcard['type'],
            front: existing.front,
            back: existing.back,
            phonetic: existing.phonetic ?? undefined,
            audioUrl: existing.audioUrl ?? undefined,
            tags: JSON.parse(existing.tags) as string[],
            fsrs: JSON.parse(existing.fsrs),
          },
        });
      }

      const meanings = JSON.parse(entry.meaningsJson) as string[];
      const reading = entry.reading ?? entry.romanization ?? undefined;
      const now = nowIso();
      const card: Flashcard = {
        id: generateId('card_dict'),
        userId,
        type: 'VOCABULARY',
        front: entry.headword,
        back: meanings.join('；'),
        phonetic: reading,
        tags: ['词典生词', entry.partOfSpeech ?? '词汇', entry.sourceLabel],
        fsrs: {
          stability: 1,
          difficulty: 5,
          reps: 0,
          lapses: 0,
          dueAt: now,
          state: 'NEW',
        },
      };
      await this.db.insert(flashcards).values({
        id: card.id,
        userId,
        language: normalizeTrackLanguage(entry.language),
        type: card.type,
        front: card.front,
        back: card.back,
        phonetic: card.phonetic ?? null,
        audioUrl: null,
        sourceEntryId: entry.id,
        tags: JSON.stringify(card.tags),
        fsrs: JSON.stringify(card.fsrs),
      });
      return ok({ card, created: true });
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'collectDictionaryEntry',
          entityId: entryId,
        })
      );
    }
  }

  private async resolveActiveLanguage(userId: string): Promise<TrackLanguage> {
    const rows = await this.db
      .select({ targetLanguage: learnerProfiles.targetLanguage })
      .from(learnerProfiles)
      .where(eq(learnerProfiles.userId, userId))
      .limit(1);
    return normalizeTrackLanguage(rows[0]?.targetLanguage);
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
    const existing = await this.db
      .select()
      .from(learnerLanguageProfiles)
      .where(
        and(
          eq(learnerLanguageProfiles.userId, userId),
          eq(learnerLanguageProfiles.language, language)
        )
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const defaults = defaultLanguageProfileSeed(language);
    const row = {
      userId,
      language,
      studyGoal: seed?.studyGoal ?? defaults.studyGoal,
      learnerLevel: seed?.learnerLevel ?? defaults.learnerLevel,
      overallLevel: seed?.overallLevel ?? defaults.overallLevel,
      overallProficiency: seed?.overallProficiency ?? 0.55,
      streakDays: seed?.streakDays ?? 0,
      maxStreakDays: seed?.maxStreakDays ?? 0,
      lastActiveDate: seed?.lastActiveDate ?? null,
      retentionRate: seed?.retentionRate ?? 0.85,
      dailyGoalQuizzes: seed?.dailyGoalQuizzes ?? 5,
      dailyGoalCards: seed?.dailyGoalCards ?? 10,
      totalStudyMinutes: seed?.totalStudyMinutes ?? 0,
      totalCardsReviewed: seed?.totalCardsReviewed ?? 0,
      totalQuizzesAnswered: seed?.totalQuizzesAnswered ?? 0,
      updatedAt: nowIso(),
    };
    await this.db.insert(learnerLanguageProfiles).values(row);
    return row as typeof learnerLanguageProfiles.$inferSelect;
  }

  private async mirrorLanguageProfileToMain(
    userId: string,
    language: TrackLanguage,
    langRow: typeof learnerLanguageProfiles.$inferSelect,
    displayName?: string
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      targetLanguage: language,
      studyGoal: langRow.studyGoal,
      learnerLevel: langRow.learnerLevel,
      overallLevel: langRow.overallLevel,
      overallProficiency: langRow.overallProficiency,
      streakDays: langRow.streakDays,
      maxStreakDays: langRow.maxStreakDays,
      lastActiveDate: langRow.lastActiveDate,
      retentionRate: langRow.retentionRate,
      dailyGoalQuizzes: langRow.dailyGoalQuizzes,
      dailyGoalCards: langRow.dailyGoalCards,
      totalStudyMinutes: langRow.totalStudyMinutes,
      totalCardsReviewed: langRow.totalCardsReviewed,
      totalQuizzesAnswered: langRow.totalQuizzesAnswered,
      updatedAt: nowIso(),
    };
    if (displayName !== undefined) patch.displayName = displayName;
    await this.db.update(learnerProfiles).set(patch).where(eq(learnerProfiles.userId, userId));
  }

  /**
   * 获取或初始化学习者基础档案（主表 + 当前语种档案合并）
   */
  public async getLearnerProfile(userId: string): Promise<Result<LearnerProfile, BusinessError>> {
    try {
      const rows = await this.db
        .select()
        .from(learnerProfiles)
        .where(eq(learnerProfiles.userId, userId))
        .limit(1);

      if (rows.length > 0) {
        const row = rows[0]!;
        const language = normalizeTrackLanguage(row.targetLanguage);
        const langRow = await this.ensureLanguageProfile(userId, language, {
          studyGoal: row.studyGoal,
          learnerLevel: row.learnerLevel,
          overallLevel: row.overallLevel,
          overallProficiency: row.overallProficiency,
          streakDays: row.streakDays,
          maxStreakDays: row.maxStreakDays,
          lastActiveDate: row.lastActiveDate,
          retentionRate: row.retentionRate,
          dailyGoalQuizzes: row.dailyGoalQuizzes,
          dailyGoalCards: row.dailyGoalCards,
          totalStudyMinutes: row.totalStudyMinutes,
          totalCardsReviewed: row.totalCardsReviewed,
          totalQuizzesAnswered: row.totalQuizzesAnswered,
        });

        return ok({
          userId: row.userId,
          displayName: row.displayName || '学习者',
          targetLanguage: language,
          studyGoal: (langRow.studyGoal as LearnerProfile['studyGoal']) || 'CET6',
          learnerLevel: (langRow.learnerLevel as LearnerProfile['learnerLevel']) || 'BEGINNER',
          overallLevel: langRow.overallLevel,
          overallProficiency: langRow.overallProficiency,
          streakDays: langRow.streakDays,
          maxStreakDays: langRow.maxStreakDays,
          lastActiveDate: langRow.lastActiveDate,
          retentionRate: langRow.retentionRate,
          dailyGoalQuizzes: langRow.dailyGoalQuizzes,
          dailyGoalCards: langRow.dailyGoalCards,
          totalStudyMinutes: langRow.totalStudyMinutes,
          totalCardsReviewed: langRow.totalCardsReviewed,
          totalQuizzesAnswered: langRow.totalQuizzesAnswered,
          updatedAt: langRow.updatedAt || row.updatedAt,
        });
      }

      const defaultProfile: LearnerProfile = {
        userId,
        displayName: '学员 ' + userId.slice(-4),
        targetLanguage: 'en',
        studyGoal: 'CET6',
        learnerLevel: 'BEGINNER',
        overallLevel: '待评测',
        overallProficiency: 0,
        streakDays: 0,
        maxStreakDays: 0,
        lastActiveDate: null,
        retentionRate: 1.0,
        dailyGoalQuizzes: 5,
        dailyGoalCards: 10,
        totalStudyMinutes: 0,
        totalCardsReviewed: 0,
        totalQuizzesAnswered: 0,
        updatedAt: nowIso(),
      };

      await this.db.insert(learnerProfiles).values({
        ...defaultProfile,
      });
      await this.ensureLanguageProfile(userId, 'en', defaultProfile);

      return ok(defaultProfile);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'getLearnerProfile',
          entityId: userId,
        })
      );
    }
  }

  /**
   * 更新学习者档案：目标/等级/配额写入当前语种行；切换 targetLanguage 时镜像新语种行
   */
  public async updateLearnerProfile(
    userId: string,
    input: Partial<LearnerProfile>
  ): Promise<Result<LearnerProfile, BusinessError>> {
    try {
      const currentRes = await this.getLearnerProfile(userId);
      if (!isOk(currentRes)) return currentRes;
      const current = currentRes.value;

      const nextLanguage = input.targetLanguage
        ? normalizeTrackLanguage(input.targetLanguage)
        : normalizeTrackLanguage(current.targetLanguage);

      const switching = nextLanguage !== normalizeTrackLanguage(current.targetLanguage);

      if (input.displayName !== undefined) {
        await this.db
          .update(learnerProfiles)
          .set({ displayName: input.displayName, updatedAt: nowIso() })
          .where(eq(learnerProfiles.userId, userId));
      }

      // 切换轨道：确保目标语种行存在，并镜像到主表
      if (switching) {
        const langRow = await this.ensureLanguageProfile(userId, nextLanguage);
        await this.mirrorLanguageProfileToMain(
          userId,
          nextLanguage,
          langRow,
          input.displayName ?? current.displayName
        );
      }

      const activeLang = nextLanguage;
      const langPatch: Record<string, unknown> = { updatedAt: nowIso() };
      if (input.studyGoal !== undefined) langPatch.studyGoal = input.studyGoal;
      if (input.learnerLevel !== undefined) langPatch.learnerLevel = input.learnerLevel;
      if (input.overallLevel !== undefined) langPatch.overallLevel = input.overallLevel;
      if (input.overallProficiency !== undefined)
        langPatch.overallProficiency = input.overallProficiency;
      if (input.dailyGoalQuizzes !== undefined) langPatch.dailyGoalQuizzes = input.dailyGoalQuizzes;
      if (input.dailyGoalCards !== undefined) langPatch.dailyGoalCards = input.dailyGoalCards;
      if (input.streakDays !== undefined) langPatch.streakDays = input.streakDays;
      if (input.maxStreakDays !== undefined) langPatch.maxStreakDays = input.maxStreakDays;
      if (input.lastActiveDate !== undefined) langPatch.lastActiveDate = input.lastActiveDate;
      if (input.retentionRate !== undefined) langPatch.retentionRate = input.retentionRate;
      if (input.totalStudyMinutes !== undefined)
        langPatch.totalStudyMinutes = input.totalStudyMinutes;
      if (input.totalCardsReviewed !== undefined)
        langPatch.totalCardsReviewed = input.totalCardsReviewed;
      if (input.totalQuizzesAnswered !== undefined)
        langPatch.totalQuizzesAnswered = input.totalQuizzesAnswered;

      await this.ensureLanguageProfile(userId, activeLang);
      if (Object.keys(langPatch).length > 1) {
        await this.db
          .update(learnerLanguageProfiles)
          .set(langPatch)
          .where(
            and(
              eq(learnerLanguageProfiles.userId, userId),
              eq(learnerLanguageProfiles.language, activeLang)
            )
          );
      }

      const refreshed = await this.db
        .select()
        .from(learnerLanguageProfiles)
        .where(
          and(
            eq(learnerLanguageProfiles.userId, userId),
            eq(learnerLanguageProfiles.language, activeLang)
          )
        )
        .limit(1);
      if (refreshed[0]) {
        await this.mirrorLanguageProfileToMain(
          userId,
          activeLang,
          refreshed[0],
          input.displayName
        );
      } else {
        await this.db
          .update(learnerProfiles)
          .set({ targetLanguage: activeLang, updatedAt: nowIso() })
          .where(eq(learnerProfiles.userId, userId));
      }

      return this.getLearnerProfile(userId);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'updateLearnerProfile',
          entityId: userId,
        })
      );
    }
  }

  /**
   * 获取指定日期的每日任务进度 (默认为今日)
   */
  public async getDailyTaskProgress(
    userId: string,
    date?: string
  ): Promise<Result<DailyTaskProgress, BusinessError>> {
    try {
      const targetDate = date || getTodayString();
      const profileRes = await this.getLearnerProfile(userId);
      if (!isOk(profileRes)) return profileRes;
      const profile = profileRes.value;
      const language: TrackLanguage = normalizeTrackLanguage(profile.targetLanguage) ?? 'ja';

      const rows = await this.db
        .select()
        .from(studyActivityLogs)
        .where(
          and(
            eq(studyActivityLogs.userId, userId),
            eq(studyActivityLogs.activityDate, targetDate),
            eq(studyActivityLogs.language, language)
          )
        )
        .limit(1);

      if (rows.length === 0) {
        return ok({
          userId,
          activityDate: targetDate,
            language: language,
            quizzesCount: 0,
            dailyGoalQuizzes: profile.dailyGoalQuizzes,
            cardsReviewedCount: 0,
            dailyGoalCards: profile.dailyGoalCards,
            listeningMinutes: 0,
            mistakesResolvedCount: 0,
            readingCount: 0,
            isGoalCompleted: false,
            streakDays: profile.streakDays,
            intensityLevel: 0,
            isOvertimeBurst: false,
            completedAt: null,
        });
      }

      const log = rows[0]!;
      const isOvertime =
        log.quizzesCount >= profile.dailyGoalQuizzes * 1.5 ||
        (log.quizzesCount > profile.dailyGoalQuizzes &&
          log.cardsReviewedCount > profile.dailyGoalCards);

      return ok({
        userId: log.userId,
        activityDate: log.activityDate,
        language: language,
        quizzesCount: log.quizzesCount,
        dailyGoalQuizzes: profile.dailyGoalQuizzes,
        cardsReviewedCount: log.cardsReviewedCount,
        dailyGoalCards: profile.dailyGoalCards,
        listeningMinutes: log.listeningMinutes,
        mistakesResolvedCount: log.mistakesResolvedCount,
        readingCount: log.readingCount ?? 0,
        isGoalCompleted: Boolean(log.isGoalCompleted),
        streakDays: profile.streakDays,
        intensityLevel: log.intensityLevel,
        isOvertimeBurst: Boolean(log.isOvertimeBurst) || isOvertime,
        completedAt: log.completedAt,
      });
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'getDailyTaskProgress',
          entityId: userId,
        })
      );
    }
  }

  /**
   * 获取最近 N 天的学习活动历史足迹 (默认为 28 天，未打卡日期自动填充真实 0 值，绝不虚构数据)
   */
  public async getActivityHistory(
    userId: string,
    days: number = 28,
    targetLanguage?: TrackLanguage | string
  ): Promise<Result<DailyTaskProgress[], BusinessError>> {
    try {
      const profileRes = await this.getLearnerProfile(userId);
      if (!isOk(profileRes)) return profileRes;
      const profile = profileRes.value;
      const language: TrackLanguage = normalizeTrackLanguage(targetLanguage ?? profile.targetLanguage) ?? 'ja';

      const now = new Date();
      const dateList: string[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        dateList.push(d.toISOString().slice(0, 10));
      }

      const earliestDate = dateList[0]!;
      const latestDate = dateList[dateList.length - 1]!;

      const rows = await this.db
        .select()
        .from(studyActivityLogs)
        .where(
          and(
            eq(studyActivityLogs.userId, userId),
            eq(studyActivityLogs.language, language),
            gte(studyActivityLogs.activityDate, earliestDate),
            lte(studyActivityLogs.activityDate, latestDate)
          )
        );

      const logMap = new Map<string, (typeof rows)[0]>();
      for (const r of rows) {
        logMap.set(r.activityDate, r);
      }

      const result: DailyTaskProgress[] = dateList.map((dateStr) => {
        const log = logMap.get(dateStr);
        if (!log) {
          return {
            userId,
            activityDate: dateStr,
            language: language,
            quizzesCount: 0,
            dailyGoalQuizzes: profile.dailyGoalQuizzes,
            cardsReviewedCount: 0,
            dailyGoalCards: profile.dailyGoalCards,
            listeningMinutes: 0,
            mistakesResolvedCount: 0,
            readingCount: 0,
            isGoalCompleted: false,
            streakDays: profile.streakDays,
            intensityLevel: 0,
            isOvertimeBurst: false,
            completedAt: null,
          };
        }
        return {
          userId: log.userId,
          activityDate: log.activityDate,
          language: language,
          quizzesCount: log.quizzesCount,
          dailyGoalQuizzes: profile.dailyGoalQuizzes,
          cardsReviewedCount: log.cardsReviewedCount,
          dailyGoalCards: profile.dailyGoalCards,
          listeningMinutes: log.listeningMinutes,
          mistakesResolvedCount: log.mistakesResolvedCount,
          readingCount: log.readingCount ?? 0,
          isGoalCompleted: Boolean(log.isGoalCompleted),
          streakDays: profile.streakDays,
          intensityLevel: log.intensityLevel,
          isOvertimeBurst: Boolean(log.isOvertimeBurst),
          completedAt: log.completedAt,
        };
      });

      return ok(result);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'getActivityHistory',
          entityId: userId,
        })
      );
    }
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
   * 记录每日学情足迹并自适应核算打卡与连续天数（按当前语种分区）
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
    try {
      const today = delta.date || getTodayString();
      const profileRes = await this.getLearnerProfile(userId);
      if (!isOk(profileRes)) return profileRes;
      let profile = profileRes.value;
      const language: TrackLanguage = normalizeTrackLanguage(delta.language ?? profile.targetLanguage) ?? 'ja';

      const existingLogs = await this.db
        .select()
        .from(studyActivityLogs)
        .where(
          and(
            eq(studyActivityLogs.userId, userId),
            eq(studyActivityLogs.activityDate, today),
            eq(studyActivityLogs.language, language)
          )
        )
        .limit(1);

      const existing = existingLogs[0];
      const newQuizzes = (existing?.quizzesCount ?? 0) + (delta.quizzes ?? 0);
      const newCards = (existing?.cardsReviewedCount ?? 0) + (delta.cards ?? 0);
      const newListening = (existing?.listeningMinutes ?? 0) + (delta.listeningMinutes ?? 0);
      const newMistakes = (existing?.mistakesResolvedCount ?? 0) + (delta.mistakesResolved ?? 0);
      const newReading = (existing?.readingCount ?? 0) + (delta.reading ?? 0);

      const wasCompleted = Boolean(existing?.isGoalCompleted);
      const isCompleted =
        newQuizzes >= profile.dailyGoalQuizzes && newCards >= profile.dailyGoalCards;

      const quizRatio = newQuizzes / Math.max(profile.dailyGoalQuizzes, 1);
      const cardRatio = newCards / Math.max(profile.dailyGoalCards, 1);
      const avgRatio = (quizRatio + cardRatio) / 2;

      let intensity = 0;
      if (avgRatio >= 1.5) intensity = 4;
      else if (avgRatio >= 1.0) intensity = 3;
      else if (avgRatio >= 0.5) intensity = 2;
      else if (avgRatio > 0) intensity = 1;

      const isBurst = avgRatio >= 1.5 || (quizRatio >= 2.0 && cardRatio >= 1.0);

      let completedAt = existing?.completedAt ?? null;
      let updatedStreak = profile.streakDays;
      let updatedMaxStreak = profile.maxStreakDays;

      const langRow = await this.ensureLanguageProfile(userId, language, profile);
      const nextTotals = {
        totalQuizzesAnswered: langRow.totalQuizzesAnswered + (delta.quizzes ?? 0),
        totalCardsReviewed: langRow.totalCardsReviewed + (delta.cards ?? 0),
        totalStudyMinutes: langRow.totalStudyMinutes + (delta.listeningMinutes ?? 0),
      };

      if (!wasCompleted && isCompleted) {
        completedAt = nowIso();
        const yesterday = getYesterdayString(today);

        if (langRow.lastActiveDate === yesterday) {
          updatedStreak += 1;
        } else if (langRow.lastActiveDate !== today) {
          updatedStreak = 1;
        }
        updatedMaxStreak = Math.max(updatedMaxStreak, updatedStreak);

        await this.db
          .update(learnerLanguageProfiles)
          .set({
            streakDays: updatedStreak,
            maxStreakDays: updatedMaxStreak,
            lastActiveDate: today,
            ...nextTotals,
            updatedAt: nowIso(),
          })
          .where(
            and(
              eq(learnerLanguageProfiles.userId, userId),
              eq(learnerLanguageProfiles.language, language)
            )
          );
      } else {
        await this.db
          .update(learnerLanguageProfiles)
          .set({
            ...nextTotals,
            updatedAt: nowIso(),
          })
          .where(
            and(
              eq(learnerLanguageProfiles.userId, userId),
              eq(learnerLanguageProfiles.language, language)
            )
          );
      }

      const refreshedLang = await this.db
        .select()
        .from(learnerLanguageProfiles)
        .where(
          and(
            eq(learnerLanguageProfiles.userId, userId),
            eq(learnerLanguageProfiles.language, language)
          )
        )
        .limit(1);
      if (refreshedLang[0] && normalizeTrackLanguage(profile.targetLanguage) === language) {
        await this.mirrorLanguageProfileToMain(userId, language, refreshedLang[0]);
      }

      const logId = existing?.id ?? generateId('act');
      if (existing) {
        await this.db
          .update(studyActivityLogs)
          .set({
            quizzesCount: newQuizzes,
            cardsReviewedCount: newCards,
            listeningMinutes: newListening,
            mistakesResolvedCount: newMistakes,
            readingCount: newReading,
            isGoalCompleted: isCompleted,
            intensityLevel: intensity,
            isOvertimeBurst: isBurst,
            completedAt,
          })
          .where(eq(studyActivityLogs.id, existing.id));
      } else {
        await this.db.insert(studyActivityLogs).values({
          id: logId,
          userId,
          activityDate: today,
          language,
          quizzesCount: newQuizzes,
          cardsReviewedCount: newCards,
          listeningMinutes: newListening,
          mistakesResolvedCount: newMistakes,
          readingCount: newReading,
          isGoalCompleted: isCompleted,
          intensityLevel: intensity,
          isOvertimeBurst: isBurst,
          completedAt,
        });
      }

      return ok({
        userId,
        activityDate: today,
        language: language,
        quizzesCount: newQuizzes,
        dailyGoalQuizzes: profile.dailyGoalQuizzes,
        cardsReviewedCount: newCards,
        dailyGoalCards: profile.dailyGoalCards,
        listeningMinutes: newListening,
        mistakesResolvedCount: newMistakes,
        readingCount: newReading,
        isGoalCompleted: isCompleted,
        streakDays: updatedStreak,
        intensityLevel: intensity,
        isOvertimeBurst: isBurst,
        completedAt,
      });
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'recordDailyActivity',
          entityId: userId,
        })
      );
    }
  }

  public async getOrCreateDailyStudyPlan(
    userId: string,
    date?: string
  ): Promise<Result<DailyStudyPlan, BusinessError>> {
    try {
      return await this.hydrateDailyStudyPlan(userId, date);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'getOrCreateDailyStudyPlan',
          entityId: userId,
        })
      );
    }
  }

  public async completeDailyPlanStep(
    userId: string,
    stepId: string,
    date?: string
  ): Promise<Result<DailyStudyPlan, BusinessError>> {
    try {
      const planRes = await this.hydrateDailyStudyPlan(userId, date);
      if (!isOk(planRes)) return planRes;
      const plan = planRes.value;
      if (!plan.steps.some((step) => step.id === stepId)) {
        return err(
          new BusinessError('E_INVALID_INPUT', '当日计划中没有这一步，请刷新后重试。', 'VALIDATION')
        );
      }

      const rows = await this.db
        .select()
        .from(dailyStudyPlans)
        .where(eq(dailyStudyPlans.id, plan.id))
        .limit(1);
      const row = rows[0];
      if (!row) {
        return err(
          new BusinessError('E_NOT_FOUND', '找不到今日学习计划，请刷新后重试。', 'LEARNER_STATE')
        );
      }

      let completedIds = parseCompletedStepIds(safeJsonParse(row.completedStepIdsJson));
      if (!completedIds.includes(stepId)) {
        completedIds = [...completedIds, stepId];
        await this.db
          .update(dailyStudyPlans)
          .set({ completedStepIdsJson: JSON.stringify(completedIds) })
          .where(eq(dailyStudyPlans.id, plan.id));
      }

      return this.hydrateDailyStudyPlan(userId, plan.planDate);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'completeDailyPlanStep',
          entityId: stepId,
        })
      );
    }
  }

  /**
   * P5-E3：聚合练习计划 run 进度信号。
   * - 存在活跃 run（IN_PROGRESS/GRADING）：返回冻结块总题量与已提交题数，今日计划显示可点击步骤；
   * - 无活跃 run 但当日有已完成 run：返回 1/1 使步骤呈现完成态；
   * - 其余情况返回 undefined（不出步骤）。信号失败静默降级，不影响计划主路径。
   */
  private async getPracticePlanRunSignal(
    userId: string,
    language: TrackLanguage,
    targetDate: string
  ): Promise<{ submittedItems: number; totalItems: number } | undefined> {
    try {
      const activeRows = await this.db
        .select()
        .from(practicePlanRuns)
        .where(
          and(
            eq(practicePlanRuns.userId, userId),
            eq(practicePlanRuns.language, language),
            inArray(practicePlanRuns.status, ['IN_PROGRESS', 'GRADING'])
          )
        )
        .orderBy(desc(practicePlanRuns.startedAt))
        .limit(1);
      const active = activeRows[0];
      if (active) {
        const blocks = parsePracticeBlockSpecs(safeJsonParse(active.blocksJson));
        const totalItems = (blocks ?? []).reduce((sum, b) => sum + b.count, 0);
        const submittedRows = await this.db
          .select({ itemId: practiceItemAttempts.itemId })
          .from(practiceItemAttempts)
          .where(
            and(
              eq(practiceItemAttempts.runId, active.id),
              inArray(practiceItemAttempts.status, ['SUBMITTED', 'GRADED'])
            )
          );
        const submittedItems = new Set(submittedRows.map((r) => r.itemId)).size;
        return { totalItems: Math.max(1, totalItems), submittedItems };
      }
      const completedRows = await this.db
        .select({ id: practicePlanRuns.id })
        .from(practicePlanRuns)
        .where(
          and(
            eq(practicePlanRuns.userId, userId),
            eq(practicePlanRuns.language, language),
            eq(practicePlanRuns.status, 'COMPLETED'),
            like(practicePlanRuns.completedAt, `${targetDate}%`)
          )
        )
        .limit(1);
      if (completedRows.length > 0) return { submittedItems: 1, totalItems: 1 };
      return undefined;
    } catch {
      // 信号为辅助路径：聚合失败时退回「不显示练习计划步骤」，不打断今日计划
      return undefined;
    }
  }

  private async hydrateDailyStudyPlan(
    userId: string,
    date?: string
  ): Promise<Result<DailyStudyPlan, BusinessError>> {
    const targetDate = date || getTodayString();
    const profileRes = await this.getLearnerProfile(userId);
    if (!isOk(profileRes)) return profileRes;
    const profile = profileRes.value;
    const language = normalizeTrackLanguage(profile.targetLanguage);

    const [dueRes, mistakesRes, snapshotRes, progressRes] = await Promise.all([
      this.getDueCards(userId, 200, { dueOnly: true, language }),
      this.getMistakes(userId, { resolved: false, language }),
      this.getProfileSnapshot(userId, language),
      this.getDailyTaskProgress(userId, targetDate),
    ]);
    if (!isOk(dueRes)) return dueRes;
    if (!isOk(mistakesRes)) return mistakesRes;
    if (!isOk(snapshotRes)) return snapshotRes;
    if (!isOk(progressRes)) return progressRes;

    const topWeakness = snapshotRes.value.weaknesses[0];
    const signals = {
      track: language,
      dailyGoalQuizzes: profile.dailyGoalQuizzes,
      dailyGoalCards: profile.dailyGoalCards,
      dueCardsCount: dueRes.value.length,
      unresolvedMistakesCount: mistakesRes.value.length,
      ...(topWeakness ? { topWeakness: { skillId: topWeakness.id, name: topWeakness.name } } : {}),
    };

    // P5-E3：练习计划 run 进度信号（活跃 run 或当日完成 run 才存在）
    const practiceSignal = await this.getPracticePlanRunSignal(userId, language, targetDate);

    const existingRows = await this.db
      .select()
      .from(dailyStudyPlans)
      .where(
        and(
          eq(dailyStudyPlans.userId, userId),
          eq(dailyStudyPlans.language, language),
          eq(dailyStudyPlans.planDate, targetDate)
        )
      )
      .limit(1);

    let planId: string;
    let createdAt: string;
    let templates: DailyPlanStepTemplate[];
    let completedStepIds: string[];

    const existing = existingRows[0];
    const parsedTemplates = existing
      ? parseDailyPlanStepTemplates(safeJsonParse(existing.stepsJson))
      : null;

    if (existing && parsedTemplates) {
      planId = existing.id;
      createdAt = existing.createdAt;
      templates = parsedTemplates;
      completedStepIds = parseCompletedStepIds(safeJsonParse(existing.completedStepIdsJson));
      // P5-E3：run 晚于冻结模板创建时，幂等追加练习计划步骤并持久化（只追加、不改序）
      if (practiceSignal && !templates.some((s) => s.id === PRACTICE_PLAN_STEP_ID)) {
        templates = appendPracticePlanStep(templates, practiceSignal.totalItems);
        await this.db
          .update(dailyStudyPlans)
          .set({ stepsJson: JSON.stringify(templates) })
          .where(eq(dailyStudyPlans.id, existing.id));
      }
    } else {
      templates = buildDailyPlanStepTemplates(signals);
      if (practiceSignal) templates = appendPracticePlanStep(templates, practiceSignal.totalItems);
      planId = existing?.id ?? generateId('plan');
      createdAt = existing?.createdAt ?? nowIso();
      completedStepIds = existing
        ? parseCompletedStepIds(safeJsonParse(existing.completedStepIdsJson))
        : [];
      const payload = {
        id: planId,
        userId,
        language,
        planDate: targetDate,
        stepsJson: JSON.stringify(templates),
        completedStepIdsJson: JSON.stringify(completedStepIds),
        createdAt,
      };
      if (existing) {
        await this.db
          .update(dailyStudyPlans)
          .set({
            stepsJson: payload.stepsJson,
            completedStepIdsJson: payload.completedStepIdsJson,
          })
          .where(eq(dailyStudyPlans.id, existing.id));
      } else {
        await this.db.insert(dailyStudyPlans).values(payload);
      }
    }

    return ok(
      summarizeDailyStudyPlan(planId, userId, language, targetDate, createdAt, templates, {
        quizzesCount: progressRes.value.quizzesCount,
        cardsReviewedCount: progressRes.value.cardsReviewedCount,
        readingCount: progressRes.value.readingCount,
        mistakesResolvedCount: progressRes.value.mistakesResolvedCount,
        unresolvedMistakesCount: mistakesRes.value.length,
        completedStepIds,
        practicePlan: practiceSignal,
      })
    );
  }

  /**
   * 获取学习者全景画像快照 (融合雷达技能、基础档案与每日任务进度)
   */
  public async getProfileSnapshot(
    userId: string,
    langOverride?: string
  ): Promise<Result<LearnerProfileSnapshot, BusinessError>> {
    try {
      const profileRes = await this.getLearnerProfile(userId);
      const profile = isOk(profileRes) ? profileRes.value : undefined;

      const dailyTaskRes = await this.getDailyTaskProgress(userId);
      const dailyTask = isOk(dailyTaskRes) ? dailyTaskRes.value : undefined;

      const language = langOverride
        ? normalizeTrackLanguage(langOverride)
        : normalizeTrackLanguage(profile?.targetLanguage);

      let rows = await this.db
        .select()
        .from(skillMetrics)
        .where(and(eq(skillMetrics.userId, userId), eq(skillMetrics.language, language)));

      // 严禁跨语种回退：英语轨道空雷达应显示空态，不得混入日语 jp.* 指标

      const allMetrics: SkillMetric[] = rows.map((r) => ({
        id: r.skillId,
        dimension: r.dimension as any,
        name: r.name,
        proficiency: r.proficiency,
        totalAttempts: r.totalAttempts,
        correctAttempts: r.correctAttempts,
        consecutiveErrors: r.consecutiveErrors,
        status: r.status as any,
        lastPracticedAt: r.lastPracticedAt ?? undefined,
      }));

      const strengths = allMetrics.filter((m) => m.proficiency >= 0.8 && m.consecutiveErrors === 0);
      const weaknesses = allMetrics.filter(
        (m) => m.proficiency < 0.6 || m.consecutiveErrors >= 2 || m.status === 'WEAKNESS'
      );

      return ok({
        userId,
        profile,
        targetLanguage: profile?.targetLanguage ?? 'en',
        overallLevel: profile?.overallLevel ?? 'B1',
        strengths,
        weaknesses,
        allMetrics,
        dailyTask,
        updatedAt: nowIso(),
      });
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'getProfileSnapshot',
          entityId: userId,
        })
      );
    }
  }

  public async saveSkillMetric(
    userId: string,
    metric: SkillMetric
  ): Promise<Result<void, BusinessError>> {
    try {
      const existing = await this.db
        .select()
        .from(skillMetrics)
        .where(
          and(
            eq(skillMetrics.userId, userId),
            eq(skillMetrics.skillId, metric.id)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await this.db
          .update(skillMetrics)
          .set({
            language: inferLanguageFromSkillId(metric.id),
            dimension: metric.dimension,
            name: metric.name,
            proficiency: metric.proficiency,
            totalAttempts: metric.totalAttempts,
            correctAttempts: metric.correctAttempts,
            consecutiveErrors: metric.consecutiveErrors,
            status: metric.status,
            lastPracticedAt: metric.lastPracticedAt ?? null,
          })
          .where(
            and(
              eq(skillMetrics.userId, userId),
              eq(skillMetrics.skillId, metric.id)
            )
          );
      } else {
        await this.db.insert(skillMetrics).values({
          userId,
          skillId: metric.id,
          language: inferLanguageFromSkillId(metric.id),
          dimension: metric.dimension,
          name: metric.name,
          proficiency: metric.proficiency,
          totalAttempts: metric.totalAttempts,
          correctAttempts: metric.correctAttempts,
          consecutiveErrors: metric.consecutiveErrors,
          status: metric.status,
          lastPracticedAt: metric.lastPracticedAt ?? null,
        });
      }

      return ok(undefined);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'saveSkillMetric',
          entityId: metric.id,
        })
      );
    }
  }

  public async getDueCards(
    userId: string,
    limit: number = 500,
    options?: { dueOnly?: boolean; language?: string }
  ): Promise<Result<Flashcard[], BusinessError>> {
    try {
      const now = nowIso();
      const language = options?.language
        ? normalizeTrackLanguage(options.language)
        : await this.resolveActiveLanguage(userId);
      let rows = await this.db
        .select()
        .from(flashcards)
        .where(and(eq(flashcards.userId, userId), eq(flashcards.language, language)))
        .limit(limit);

      const demoUser = userId === 'student_web_01' || userId === 'default_user';
      if (rows.length === 0 && demoUser && (language === 'ja' || language === 'en')) {
        const seeds = language === 'en' ? INITIAL_EN_CARD_SEEDS : INITIAL_CARD_SEEDS;
        for (const c of seeds) {
          const fsrsObj = {
            stability: c.stability,
            difficulty: 5.0,
            reps: c.reps,
            lapses: 0,
            dueAt: nowIso(),
            state: c.reps > 0 ? 'REVIEW' : 'NEW',
          };
          const tags = [...c.tags];
          if (c.exampleJp) tags.push(c.exampleJp);
          if (c.exampleZh) tags.push(c.exampleZh);

          await this.db.insert(flashcards).values({
            id: c.id,
            userId,
            language,
            type: c.type,
            front: c.front,
            back: c.back,
            phonetic: c.phonetic ?? null,
            audioUrl: c.audioUrl ?? null,
            tags: JSON.stringify(tags),
            fsrs: JSON.stringify(fsrsObj),
          });
        }
        rows = await this.db
          .select()
          .from(flashcards)
          .where(and(eq(flashcards.userId, userId), eq(flashcards.language, language)))
          .limit(limit);
      }

      const cards: Flashcard[] = rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        type: r.type as any,
        front: r.front,
        back: r.back,
        phonetic: r.phonetic ?? undefined,
        audioUrl: r.audioUrl ?? undefined,
        tags: JSON.parse(r.tags),
        fsrs: JSON.parse(r.fsrs),
      }));

      // 如果显式要求仅待复习，则过滤到期卡片；否则返回全量卡片（优先展示待复习）
      if (options?.dueOnly) {
        return ok(cards.filter((c) => !c.fsrs.dueAt || c.fsrs.dueAt <= now));
      }

      cards.sort((a, b) => {
        const aDue = !a.fsrs.dueAt || a.fsrs.dueAt <= now;
        const bDue = !b.fsrs.dueAt || b.fsrs.dueAt <= now;
        if (aDue && !bDue) return -1;
        if (!aDue && bDue) return 1;
        return a.id.localeCompare(b.id);
      });

      return ok(cards);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'getDueCards',
          entityId: userId,
        })
      );
    }
  }

  /**
   * 获取题库题目列表 (从 SQLite quiz_questions 表读取)
   */
  public async getQuestions(
    userId: string,
    limit: number = 50,
    langOverride?: string
  ): Promise<Result<any[], BusinessError>> {
    try {
      const language = langOverride
        ? normalizeTrackLanguage(langOverride)
        : await this.resolveActiveLanguage(userId);
      let rows = await this.db
        .select()
        .from(quizQuestions)
        .where(
          and(
            or(eq(quizQuestions.userId, userId), eq(quizQuestions.userId, 'default_user')),
            eq(quizQuestions.language, language)
          )
        )
        .orderBy(desc(quizQuestions.createdAt))
        .limit(limit);

      let mapped = rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        type: r.type,
        category: r.category,
        prompt: r.prompt,
        content: r.content,
        options: r.options ? JSON.parse(r.options) : undefined,
        chunks: r.chunks ? JSON.parse(r.chunks) : undefined,
        correctAnswer: r.correctAnswer,
        explanation: r.explanation,
        testedSkill: r.testedSkillId,
        testedSkillId: r.testedSkillId,
        difficulty: r.difficulty,
        createdAt: r.createdAt,
      }));

      // 防串语：历史上曾把 EN 题误写入 ko 分区；按 skillId 前缀再过滤一次
      mapped = mapped.filter((q) => {
        const skill = String(q.testedSkillId || q.testedSkill || '');
        if (!skill) return true;
        return inferLanguageFromSkillId(skill) === language;
      });

      return ok(mapped);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'getQuestions',
          entityId: userId,
        })
      );
    }
  }

  /**
   * 保存或更新单道题目至 SQLite quiz_questions
   */
  public async saveQuestion(question: any): Promise<Result<void, BusinessError>> {
    try {
      const skillId = question.testedSkill || question.testedSkillId || '';
      const ownerId = question.userId || 'default_user';
      const language = normalizeTrackLanguage(
        question.language ?? (await this.resolveActiveLanguage(ownerId))
      );
      const existing = await this.db
        .select()
        .from(quizQuestions)
        .where(eq(quizQuestions.id, question.id))
        .limit(1);

      const optionsStr = question.options
        ? typeof question.options === 'string'
          ? question.options
          : JSON.stringify(question.options)
        : null;
      const chunksStr = question.chunks
        ? typeof question.chunks === 'string'
          ? question.chunks
          : JSON.stringify(question.chunks)
        : null;

      if (existing.length > 0) {
        await this.db
          .update(quizQuestions)
          .set({
            language,
            type: question.type,
            category: question.category,
            prompt: question.prompt,
            content: question.content,
            options: optionsStr,
            chunks: chunksStr,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            testedSkillId: skillId,
            difficulty: question.difficulty ?? 3,
          })
          .where(eq(quizQuestions.id, question.id));
      } else {
        await this.db.insert(quizQuestions).values({
          id: question.id,
          userId: question.userId || 'default_user',
          language,
          type: question.type,
          category: question.category,
          prompt: question.prompt,
          content: question.content,
          options: optionsStr,
          chunks: chunksStr,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          testedSkillId: skillId,
          difficulty: question.difficulty ?? 3,
          createdAt: question.createdAt || nowIso(),
        });
      }

      return ok(undefined);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'saveQuestion',
          entityId: question.id,
        })
      );
    }
  }

  /**
   * 批量保存题目至 SQLite
   */
  public async saveQuestions(questions: any[]): Promise<Result<void, BusinessError>> {
    for (const q of questions) {
      const res = await this.saveQuestion(q);
      if (!isOk(res)) return res;
    }
    return ok(undefined);
  }

  public async saveCard(card: Flashcard): Promise<Result<void, BusinessError>> {
    try {
      const existing = await this.db
        .select()
        .from(flashcards)
        .where(eq(flashcards.id, card.id))
        .limit(1);

      if (existing.length > 0) {
        await this.db
          .update(flashcards)
          .set({
            language: normalizeTrackLanguage(
              (card as any).language ?? (await this.resolveActiveLanguage(card.userId))
            ),
            type: card.type,
            front: card.front,
            back: card.back,
            phonetic: card.phonetic ?? null,
            audioUrl: card.audioUrl ?? null,
            tags: JSON.stringify(card.tags),
            fsrs: JSON.stringify(card.fsrs),
          })
          .where(eq(flashcards.id, card.id));
      } else {
        const language = normalizeTrackLanguage(
          (card as any).language ?? (await this.resolveActiveLanguage(card.userId))
        );
        await this.db.insert(flashcards).values({
          id: card.id,
          userId: card.userId,
          language,
          type: card.type,
          front: card.front,
          back: card.back,
          phonetic: card.phonetic ?? null,
          audioUrl: card.audioUrl ?? null,
          tags: JSON.stringify(card.tags),
          fsrs: JSON.stringify(card.fsrs),
        });
      }

      return ok(undefined);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'saveCard',
          entityId: card.id,
        })
      );
    }
  }

  public async recordQuizAttempt(
    attempt: QuizAttemptRecord
  ): Promise<Result<void, BusinessError>> {
    try {
      await this.db.insert(quizAttempts).values({
        id: attempt.id,
        userId: attempt.userId,
        language: inferLanguageFromSkillId(attempt.testedSkillId),
        questionId: attempt.questionId,
        userAnswer: attempt.userAnswer,
        isCorrect: attempt.isCorrect,
        score: attempt.score,
        timeSpentMs: attempt.timeSpentMs,
        testedSkillId: attempt.testedSkillId,
        createdAt: attempt.createdAt,
      });

      // 自动累计每日做题任务足迹
      await this.recordDailyActivity(attempt.userId, { quizzes: 1 });

      return ok(undefined);
    } catch (error) {
      return err(
        translateToBusinessError(error, {
          category: 'DATABASE',
          action: 'recordQuizAttempt',
          entityId: attempt.id,
        })
      );
    }
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
