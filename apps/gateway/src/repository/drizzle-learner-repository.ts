import { Database } from 'bun:sqlite';
import { eq, and, desc, asc, lte } from 'drizzle-orm';
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
import type { Flashcard, DocumentItem, AnnotationItem, KanaItem } from '@study-studio/protocol';
import {
  createDrizzleDb,
  type DrizzleDb,
  learnerProfiles,
  studyActivityLogs,
  skillMetrics,
  flashcards,
  quizAttempts,
  mistakes,
  documents,
  annotations,
  curriculumKana,
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

      let rows = await this.db
        .select()
        .from(skillMetrics)
        .where(eq(skillMetrics.userId, userId));

      if (rows.length === 0 && (userId === 'student_web_01' || userId === 'default_user')) {
        const seedMetrics = [
          { userId, skillId: 'jp.particle.destination_ni', dimension: 'GRAMMAR', name: '目的地到达点助词「に」', proficiency: 0.88, totalAttempts: 14, correctAttempts: 13, consecutiveErrors: 0, status: 'STRENGTH' },
          { userId, skillId: 'jp.particle.action_de', dimension: 'GRAMMAR', name: '动作发生场所助词「で」', proficiency: 0.52, totalAttempts: 9, correctAttempts: 5, consecutiveErrors: 2, status: 'WEAKNESS' },
          { userId, skillId: 'jp.listening.sokuon', dimension: 'LISTENING', name: '听力：促音与长音精细辨析', proficiency: 0.46, totalAttempts: 12, correctAttempts: 5, consecutiveErrors: 2, status: 'WEAKNESS' },
          { userId, skillId: 'jp.grammar.conditional_tara', dimension: 'GRAMMAR', name: '假定条件「～たら」实际运用', proficiency: 0.65, totalAttempts: 10, correctAttempts: 7, consecutiveErrors: 0, status: 'NORMAL' },
          { userId, skillId: 'jp.vocab.n3_verbs', dimension: 'VOCABULARY', name: 'N3 核心动词搭配与活用', proficiency: 0.94, totalAttempts: 32, correctAttempts: 30, consecutiveErrors: 0, status: 'STRENGTH' },
          { userId, skillId: 'jp.nuance.polite_keigo', dimension: 'NUANCE_PRAGMATIC', name: '基础敬语与礼貌体语感', proficiency: 0.58, totalAttempts: 8, correctAttempts: 4, consecutiveErrors: 1, status: 'WEAKNESS' },
        ];
        for (const sm of seedMetrics) {
          await this.db.insert(skillMetrics).values({ ...sm, lastPracticedAt: nowIso() });
        }
        rows = await this.db.select().from(skillMetrics).where(eq(skillMetrics.userId, userId));
      }

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
      let rows = await this.db
        .select()
        .from(flashcards)
        .where(eq(flashcards.userId, userId))
        .limit(limit);

      if (rows.length === 0 && (userId === 'student_web_01' || userId === 'default_user')) {
        const seedCards = [
          {
            id: 'card_01',
            userId,
            type: 'VOCAB',
            front: '約束',
            back: '约定、诺言、契约',
            phonetic: 'やくそく',
            audioUrl: '',
            tags: JSON.stringify(['N3词汇', '高频名词']),
            fsrs: JSON.stringify({ stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0, dueAt: nowIso(), state: 'NEW' }),
          },
          {
            id: 'card_02',
            userId,
            type: 'VOCAB',
            front: '曖昧',
            back: '含糊、暧昧、不明确',
            phonetic: 'あいまい',
            audioUrl: '',
            tags: JSON.stringify(['N2词汇', '形容动词']),
            fsrs: JSON.stringify({ stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0, dueAt: nowIso(), state: 'NEW' }),
          },
          {
            id: 'card_03',
            userId,
            type: 'VOCAB',
            front: '遠慮',
            back: '客气、顾虑、推辞',
            phonetic: 'えんりょ',
            audioUrl: '',
            tags: JSON.stringify(['N3核心', '日常交际']),
            fsrs: JSON.stringify({ stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0, dueAt: nowIso(), state: 'NEW' }),
          },
          {
            id: 'card_04',
            userId,
            type: 'GRAMMAR',
            front: '「～わけにはいかない」',
            back: '不能……、无法……（从情理/社会常识上不能这么做）',
            phonetic: '',
            audioUrl: '',
            tags: JSON.stringify(['N2句型', '情态表达']),
            fsrs: JSON.stringify({ stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0, dueAt: nowIso(), state: 'NEW' }),
          },
        ];
        for (const sc of seedCards) {
          await this.db.insert(flashcards).values(sc);
        }
        rows = await this.db.select().from(flashcards).where(eq(flashcards.userId, userId)).limit(limit);
      }

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

      let rows = await query;
      if (rows.length === 0 && (userId === 'student_web_01' || userId === 'default_user')) {
        const seedMistakes = [
          {
            id: 'm_01',
            userId,
            questionId: 'q_01',
            question: JSON.stringify({
              id: 'q_01',
              type: 'CHOICE',
              category: '助词辨析',
              prompt: '选择最恰当的助词填入括号：',
              content: '夏休みに、友だちと京都（　）行きました。',
              correctAnswer: 'B',
              explanation: '动词「行きました」为移动动词，表示移动目的地必须使用格助词「に」。',
              testedSkillId: 'jp.particle.destination_ni',
            }),
            lastUserSubmission: 'A (で)',
            lastGrading: JSON.stringify({
              isCorrect: false,
              score: 0,
              correctAnswer: 'B (に)',
              userSubmission: 'A (で)',
              explanation: '「で」用于动作发生场所；移动目的地必须使用「に」。',
            }),
            recordedAt: nowIso(),
            lastRetriedAt: null,
            retryCount: 1,
            consecutiveCorrect: 0,
            isResolved: false,
          },
          {
            id: 'm_02',
            userId,
            questionId: 'q_02',
            question: JSON.stringify({
              id: 'q_02',
              type: 'FILL_BLANK',
              category: '动词假定形',
              prompt: '将括号中的动词变形为正确的假定形（～たら）：',
              content: '明日、雨が（降る ──► 降ったら）、試合は中止です。',
              correctAnswer: '降ったら',
              explanation: '动词「降る」过去式为「降った」，后接「ら」构成假定。',
              testedSkillId: 'jp.grammar.conditional_tara',
            }),
            lastUserSubmission: '降るたら',
            lastGrading: JSON.stringify({
              isCorrect: false,
              score: 0,
              correctAnswer: '降ったら',
              userSubmission: '降るたら',
              explanation: '动词「たら」前接必须是动词的「た形」（连用形音便）。',
            }),
            recordedAt: nowIso(),
            lastRetriedAt: null,
            retryCount: 1,
            consecutiveCorrect: 0,
            isResolved: false,
          },
        ];
        for (const sm of seedMistakes) {
          await this.db.insert(mistakes).values(sm);
        }
        rows = await this.db.select().from(mistakes).where(eq(mistakes.userId, userId));
      }

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
}


