import { Database } from 'bun:sqlite';
import {
  ok,
  err,
  type Result,
  BusinessError,
  translateToBusinessError,
  nowIso,
} from '@study-studio/shared';
import type {
  LearnerRepository,
  QuizAttemptRecord,
  SkillMetric,
  LearnerProfileSnapshot,
  MistakeEntry,
} from '@study-studio/learner-core';
import type { Flashcard } from '@study-studio/protocol';

export class SqliteLearnerRepository implements LearnerRepository {
  private readonly db: Database;

  constructor(dbOrPath: Database | string = ':memory:') {
    if (typeof dbOrPath === 'string') {
      this.db = new Database(dbOrPath, { create: true });
    } else {
      this.db = dbOrPath;
    }
    this.initSchema();
  }

  /**
   * 初始化 SQLite 数据表结构
   */
  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS skill_metrics (
        user_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        dimension TEXT NOT NULL,
        name TEXT NOT NULL,
        proficiency REAL NOT NULL,
        total_attempts INTEGER NOT NULL,
        correct_attempts INTEGER NOT NULL,
        consecutive_errors INTEGER NOT NULL,
        status TEXT NOT NULL,
        last_practiced_at TEXT,
        PRIMARY KEY (user_id, skill_id)
      );

      CREATE TABLE IF NOT EXISTS flashcards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        phonetic TEXT,
        audio_url TEXT,
        tags TEXT NOT NULL,
        fsrs TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        user_answer TEXT NOT NULL,
        is_correct INTEGER NOT NULL,
        score REAL NOT NULL,
        time_spent_ms INTEGER NOT NULL,
        tested_skill_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mistakes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        question TEXT NOT NULL,
        last_user_submission TEXT NOT NULL,
        last_grading TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        last_retried_at TEXT,
        retry_count INTEGER NOT NULL,
        consecutive_correct INTEGER NOT NULL,
        is_resolved INTEGER NOT NULL
      );
    `);
  }

  public async getProfileSnapshot(
    userId: string
  ): Promise<Result<LearnerProfileSnapshot, BusinessError>> {
    try {
      const rows = this.db
        .query<
          {
            user_id: string;
            skill_id: string;
            dimension: string;
            name: string;
            proficiency: number;
            total_attempts: number;
            correct_attempts: number;
            consecutive_errors: number;
            status: string;
            last_practiced_at: string | null;
          },
          [string]
        >(`SELECT * FROM skill_metrics WHERE user_id = ?`)
        .all(userId);

      const allMetrics: SkillMetric[] = rows.map((r) => ({
        id: r.skill_id,
        dimension: r.dimension as any,
        name: r.name,
        proficiency: r.proficiency,
        totalAttempts: r.total_attempts,
        correctAttempts: r.correct_attempts,
        consecutiveErrors: r.consecutive_errors,
        status: r.status as any,
        lastPracticedAt: r.last_practiced_at ?? undefined,
      }));

      const strengths = allMetrics.filter((m) => m.status === 'STRENGTH');
      const weaknesses = allMetrics.filter((m) => m.status === 'WEAKNESS');

      return ok({
        userId,
        targetLanguage: 'ja',
        overallLevel: 'JLPT N3',
        strengths,
        weaknesses,
        allMetrics,
        updatedAt: nowIso(),
      });
    } catch (error) {
      return err(translateToBusinessError(error, 'SqliteLearnerRepository.getProfileSnapshot'));
    }
  }

  public async saveSkillMetric(
    userId: string,
    metric: SkillMetric
  ): Promise<Result<void, BusinessError>> {
    try {
      this.db
        .prepare(`
          INSERT INTO skill_metrics (
            user_id, skill_id, dimension, name, proficiency,
            total_attempts, correct_attempts, consecutive_errors, status, last_practiced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, skill_id) DO UPDATE SET
            proficiency = excluded.proficiency,
            total_attempts = excluded.total_attempts,
            correct_attempts = excluded.correct_attempts,
            consecutive_errors = excluded.consecutive_errors,
            status = excluded.status,
            last_practiced_at = excluded.last_practiced_at
        `)
        .run(
          userId,
          metric.id,
          metric.dimension,
          metric.name,
          metric.proficiency,
          metric.totalAttempts,
          metric.correctAttempts,
          metric.consecutiveErrors,
          metric.status,
          metric.lastPracticedAt ?? null
        );

      return ok(undefined);
    } catch (error) {
      return err(translateToBusinessError(error, 'SqliteLearnerRepository.saveSkillMetric'));
    }
  }

  public async getDueCards(
    userId: string,
    limit = 20
  ): Promise<Result<Flashcard[], BusinessError>> {
    try {
      const rows = this.db
        .query<
          {
            id: string;
            user_id: string;
            type: string;
            front: string;
            back: string;
            phonetic: string | null;
            audio_url: string | null;
            tags: string;
            fsrs: string;
          },
          [string, number]
        >(`SELECT * FROM flashcards WHERE user_id = ? LIMIT ?`)
        .all(userId, limit);

      const cards: Flashcard[] = rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        type: r.type as any,
        front: r.front,
        back: r.back,
        phonetic: r.phonetic ?? undefined,
        audioUrl: r.audio_url ?? undefined,
        tags: JSON.parse(r.tags),
        fsrs: JSON.parse(r.fsrs),
      }));

      return ok(cards);
    } catch (error) {
      return err(translateToBusinessError(error, 'SqliteLearnerRepository.getDueCards'));
    }
  }

  public async saveCard(card: Flashcard): Promise<Result<void, BusinessError>> {
    try {
      this.db
        .prepare(`
          INSERT INTO flashcards (id, user_id, type, front, back, phonetic, audio_url, tags, fsrs)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            front = excluded.front,
            back = excluded.back,
            phonetic = excluded.phonetic,
            audio_url = excluded.audio_url,
            tags = excluded.tags,
            fsrs = excluded.fsrs
        `)
        .run(
          card.id,
          card.userId,
          card.type,
          card.front,
          card.back,
          card.phonetic ?? null,
          card.audioUrl ?? null,
          JSON.stringify(card.tags),
          JSON.stringify(card.fsrs)
        );

      return ok(undefined);
    } catch (error) {
      return err(translateToBusinessError(error, 'SqliteLearnerRepository.saveCard'));
    }
  }

  public async recordQuizAttempt(
    attempt: QuizAttemptRecord
  ): Promise<Result<void, BusinessError>> {
    try {
      this.db
        .prepare(`
          INSERT INTO quiz_attempts (
            id, user_id, question_id, user_answer, is_correct, score, time_spent_ms, tested_skill_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          attempt.id,
          attempt.userId,
          attempt.questionId,
          attempt.userAnswer,
          attempt.isCorrect ? 1 : 0,
          attempt.score,
          attempt.timeSpentMs,
          attempt.testedSkillId,
          attempt.createdAt
        );

      return ok(undefined);
    } catch (error) {
      return err(translateToBusinessError(error, 'SqliteLearnerRepository.recordQuizAttempt'));
    }
  }

  public async saveMistake(mistake: MistakeEntry): Promise<Result<void, BusinessError>> {
    try {
      this.db
        .prepare(`
          INSERT INTO mistakes (
            id, user_id, question_id, question, last_user_submission, last_grading,
            recorded_at, last_retried_at, retry_count, consecutive_correct, is_resolved
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            last_user_submission = excluded.last_user_submission,
            last_grading = excluded.last_grading,
            last_retried_at = excluded.last_retried_at,
            retry_count = excluded.retry_count,
            consecutive_correct = excluded.consecutive_correct,
            is_resolved = excluded.is_resolved
        `)
        .run(
          mistake.id,
          mistake.userId,
          mistake.questionId,
          JSON.stringify(mistake.question),
          mistake.lastUserSubmission,
          JSON.stringify(mistake.lastGrading),
          mistake.recordedAt,
          mistake.lastRetriedAt ?? null,
          mistake.retryCount,
          mistake.consecutiveCorrect,
          mistake.isResolved ? 1 : 0
        );

      return ok(undefined);
    } catch (error) {
      return err(translateToBusinessError(error, 'SqliteLearnerRepository.saveMistake'));
    }
  }

  public async getMistakes(
    userId: string,
    filter?: { resolved?: boolean }
  ): Promise<Result<MistakeEntry[], BusinessError>> {
    try {
      let query = `SELECT * FROM mistakes WHERE user_id = ?`;
      const params: (string | number)[] = [userId];

      if (filter?.resolved !== undefined) {
        query += ` AND is_resolved = ?`;
        params.push(filter.resolved ? 1 : 0);
      }

      query += ` ORDER BY recorded_at DESC`;

      const rows = this.db
        .query<
          {
            id: string;
            user_id: string;
            question_id: string;
            question: string;
            last_user_submission: string;
            last_grading: string;
            recorded_at: string;
            last_retried_at: string | null;
            retry_count: number;
            consecutive_correct: number;
            is_resolved: number;
          },
          (string | number)[]
        >(query)
        .all(...params);

      const mistakes: MistakeEntry[] = rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        questionId: r.question_id,
        question: JSON.parse(r.question),
        lastUserSubmission: r.last_user_submission,
        lastGrading: JSON.parse(r.last_grading),
        recordedAt: r.recorded_at,
        lastRetriedAt: r.last_retried_at ?? undefined,
        retryCount: r.retry_count,
        consecutiveCorrect: r.consecutive_correct,
        isResolved: r.is_resolved === 1,
      }));

      return ok(mistakes);
    } catch (error) {
      return err(translateToBusinessError(error, 'SqliteLearnerRepository.getMistakes'));
    }
  }

  public close(): void {
    this.db.close();
  }
}
