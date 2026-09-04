import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema.js';

export * from './schema.js';

export type DrizzleDb = BunSQLiteDatabase<typeof schema>;

export interface DrizzleInstance {
  db: DrizzleDb;
  sqlite: Database;
}

/**
 * 初始化 SQLite 结构并挂载 Drizzle ORM 客户端
 */
export function createDrizzleDb(dbOrPath: Database | string = ':memory:'): DrizzleInstance {
  const sqlite = typeof dbOrPath === 'string' ? new Database(dbOrPath, { create: true }) : dbOrPath;

  // 提升 SQLite 性能与数据完整性
  try {
    sqlite.run('PRAGMA journal_mode = WAL;');
    sqlite.run('PRAGMA foreign_keys = ON;');
  } catch {
    // 内存数据库可能不支持 WAL，静默忽略
  }

  initSchema(sqlite);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/**
 * 自动迁移/初始化数据表 DDL
 */
export function initSchema(sqlite: Database): void {
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS learner_profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      target_language TEXT NOT NULL DEFAULT 'ja',
      study_goal TEXT NOT NULL DEFAULT 'JLPT_N2',
      learner_level TEXT NOT NULL DEFAULT 'BEGINNER',
      overall_level TEXT NOT NULL DEFAULT 'N3-',
      overall_proficiency REAL NOT NULL DEFAULT 0.55,
      streak_days INTEGER NOT NULL DEFAULT 0,
      max_streak_days INTEGER NOT NULL DEFAULT 0,
      last_active_date TEXT,
      retention_rate REAL NOT NULL DEFAULT 0.85,
      daily_goal_quizzes INTEGER NOT NULL DEFAULT 5,
      daily_goal_cards INTEGER NOT NULL DEFAULT 10,
      total_study_minutes INTEGER NOT NULL DEFAULT 0,
      total_cards_reviewed INTEGER NOT NULL DEFAULT 0,
      total_quizzes_answered INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      activity_date TEXT NOT NULL,
      quizzes_count INTEGER NOT NULL DEFAULT 0,
      cards_reviewed_count INTEGER NOT NULL DEFAULT 0,
      listening_minutes INTEGER NOT NULL DEFAULT 0,
      mistakes_resolved_count INTEGER NOT NULL DEFAULT 0,
      is_goal_completed INTEGER NOT NULL DEFAULT 0,
      intensity_level INTEGER NOT NULL DEFAULT 0,
      is_overtime_burst INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_activity_user_date ON study_activity_logs(user_id, activity_date);

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
