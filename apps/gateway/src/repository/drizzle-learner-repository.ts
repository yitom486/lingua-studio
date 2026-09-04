import { Database } from 'bun:sqlite';
import { eq, and, desc, lte } from 'drizzle-orm';
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
import type { Flashcard } from '@study-studio/protocol';
import {
  createDrizzleDb,
  type DrizzleDb,
  learnerProfiles,
  studyActivityLogs,
  skillMetrics,
  flashcards,
  quizAttempts,
  mistakes,
} from '../db/index.js';

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

  /**
   * 获取或初始化学习者基础档案
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
        return ok({
          userId: row.userId,
          displayName: row.displayName || '学习者',
          targetLanguage: (row.targetLanguage as any) || 'ja',
          studyGoal: (row.studyGoal as any) || 'JLPT_N2',
          learnerLevel: (row.learnerLevel as any) || 'BEGINNER',
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
          updatedAt: row.updatedAt,
        });
      }

      // 初次创建新用户默认档案
      const defaultProfile: LearnerProfile = {
        userId,
        displayName: '学员 ' + userId.slice(-4),
        targetLanguage: 'ja',
        studyGoal: 'JLPT_N2',
        learnerLevel: 'BEGINNER',
        overallLevel: 'N3-',
        overallProficiency: 0.55,
        streakDays: 0,
        maxStreakDays: 0,
        lastActiveDate: null,
        retentionRate: 0.85,
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
   * 更新学习者档案 (昵称、学习目标、难度阶段、每日配额等)
   */
  public async updateLearnerProfile(
    userId: string,
    input: Partial<LearnerProfile>
  ): Promise<Result<LearnerProfile, BusinessError>> {
    try {
      const currentRes = await this.getLearnerProfile(userId);
      if (!isOk(currentRes)) return currentRes;

      const updateData: Record<string, any> = {
        ...input,
        updatedAt: nowIso(),
      };
      delete updateData.userId;

      await this.db
        .update(learnerProfiles)
        .set(updateData)
        .where(eq(learnerProfiles.userId, userId));

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

      const rows = await this.db
        .select()
        .from(studyActivityLogs)
        .where(
          and(
            eq(studyActivityLogs.userId, userId),
            eq(studyActivityLogs.activityDate, targetDate)
          )
        )
        .limit(1);

      if (rows.length === 0) {
        return ok({
          userId,
          activityDate: targetDate,
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
   * 记录每日学情足迹并自适应核算打卡与连续天数
   */
  public async recordDailyActivity(
    userId: string,
    delta: {
      quizzes?: number;
      cards?: number;
      listeningMinutes?: number;
      mistakesResolved?: number;
      date?: string;
    }
  ): Promise<Result<DailyTaskProgress, BusinessError>> {
    try {
      const today = delta.date || getTodayString();
      const profileRes = await this.getLearnerProfile(userId);
      if (!isOk(profileRes)) return profileRes;
      let profile = profileRes.value;

      // 查找今日已有足迹
      const existingLogs = await this.db
        .select()
        .from(studyActivityLogs)
        .where(
          and(
            eq(studyActivityLogs.userId, userId),
            eq(studyActivityLogs.activityDate, today)
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
        newQuizzes >= profile.dailyGoalQuizzes &&
        newCards >= profile.dailyGoalCards;

      // 计算活跃度评级 (0~4) 与超额连刷标记
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

      // 如果今日刚刚达成打卡门槛，更新连胜记录
      if (!wasCompleted && isCompleted) {
        completedAt = nowIso();
        const yesterday = getYesterdayString(today);

        if (profile.lastActiveDate === yesterday) {
          updatedStreak += 1;
        } else if (profile.lastActiveDate !== today) {
          updatedStreak = 1;
        }
        updatedMaxStreak = Math.max(updatedMaxStreak, updatedStreak);

        await this.db
          .update(learnerProfiles)
          .set({
            streakDays: updatedStreak,
            maxStreakDays: updatedMaxStreak,
            lastActiveDate: today,
            totalQuizzesAnswered: profile.totalQuizzesAnswered + (delta.quizzes ?? 0),
            totalCardsReviewed: profile.totalCardsReviewed + (delta.cards ?? 0),
            totalStudyMinutes: profile.totalStudyMinutes + (delta.listeningMinutes ?? 0),
            updatedAt: nowIso(),
          })
          .where(eq(learnerProfiles.userId, userId));
      } else {
        // 未打卡或早已打卡，只累加总数
        await this.db
          .update(learnerProfiles)
          .set({
            totalQuizzesAnswered: profile.totalQuizzesAnswered + (delta.quizzes ?? 0),
            totalCardsReviewed: profile.totalCardsReviewed + (delta.cards ?? 0),
            totalStudyMinutes: profile.totalStudyMinutes + (delta.listeningMinutes ?? 0),
            updatedAt: nowIso(),
          })
          .where(eq(learnerProfiles.userId, userId));
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
    userId: string
  ): Promise<Result<LearnerProfileSnapshot, BusinessError>> {
    try {
      const profileRes = await this.getLearnerProfile(userId);
      const profile = isOk(profileRes) ? profileRes.value : undefined;

      const dailyTaskRes = await this.getDailyTaskProgress(userId);
      const dailyTask = isOk(dailyTaskRes) ? dailyTaskRes.value : undefined;

      const rows = await this.db
        .select()
        .from(skillMetrics)
        .where(eq(skillMetrics.userId, userId));

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
        targetLanguage: profile?.targetLanguage ?? 'ja',
        overallLevel: profile?.overallLevel ?? 'N3-',
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
    limit: number = 20
  ): Promise<Result<Flashcard[], BusinessError>> {
    try {
      const now = nowIso();
      const rows = await this.db
        .select()
        .from(flashcards)
        .where(eq(flashcards.userId, userId))
        .limit(limit);

      const cards: Flashcard[] = rows
        .map((r) => ({
          id: r.id,
          userId: r.userId,
          type: r.type as any,
          front: r.front,
          back: r.back,
          phonetic: r.phonetic ?? undefined,
          audioUrl: r.audioUrl ?? undefined,
          tags: JSON.parse(r.tags),
          fsrs: JSON.parse(r.fsrs),
        }))
        .filter((c) => !c.fsrs.dueAt || c.fsrs.dueAt <= now);

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
        await this.db.insert(flashcards).values({
          id: card.id,
          userId: card.userId,
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
      const existing = await this.db
        .select()
        .from(mistakes)
        .where(eq(mistakes.id, mistake.id))
        .limit(1);

      if (existing.length > 0) {
        await this.db
          .update(mistakes)
          .set({
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
    filter?: { resolved?: boolean }
  ): Promise<Result<MistakeEntry[], BusinessError>> {
    try {
      let query = this.db
        .select()
        .from(mistakes)
        .where(eq(mistakes.userId, userId));

      const rows = await query;
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
          consecutiveCorrect: mistake.consecutiveCorrect + 1,
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
}
