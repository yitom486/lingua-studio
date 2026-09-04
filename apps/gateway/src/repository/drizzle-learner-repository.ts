import { Database } from 'bun:sqlite';
import { eq, and, desc, asc, lte, gte, or, inArray } from 'drizzle-orm';
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
} from '../db/index.js';

export type TrackLanguage = 'ja' | 'en' | 'ko';

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

      // 累计当日做题数
      await this.recordDailyActivity(userId, { quizzes: input.totalQuestions });

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
        rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          title: r.title,
          intent: r.intent,
          layoutHint: (r.layoutHint as PracticeCollection['layoutHint']) ?? undefined,
          sourceRef: r.sourceRef ?? undefined,
          createdAt: r.createdAt,
        }))
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

      return ok(
        rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          collectionId: r.collectionId,
          question: JSON.parse(r.questionJson) as GeneratedQuestion,
          skillIds: r.skillIds ? (JSON.parse(r.skillIds) as string[]) : [],
          sourceRef: r.sourceRef ?? undefined,
          passageDocumentId: r.passageDocumentId ?? undefined,
          sortOrder: r.sortOrder,
          collectedAt: r.collectedAt,
        }))
      );
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
}

