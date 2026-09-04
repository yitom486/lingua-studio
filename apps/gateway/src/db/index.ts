import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema.js';
import { KANA_SEEDS } from './seeds/kana-seed.js';
import { INITIAL_READING_SEEDS } from './seeds/reading-seed.js';
import {
  INITIAL_CARD_SEEDS,
  INITIAL_EN_CARD_SEEDS,
  INITIAL_QUESTION_SEEDS,
  INITIAL_EN_QUESTION_SEEDS,
  INITIAL_MISTAKE_SEEDS,
  INITIAL_SKILL_METRIC_SEEDS,
} from './seeds/learning-seed.js';
import { LEARNING_CONTENT_TEMPLATE_SEEDS } from './seeds/content-template-seed.js';

export * from './schema.js';
export { KANA_SEEDS } from './seeds/kana-seed.js';
export { INITIAL_READING_SEEDS } from './seeds/reading-seed.js';
export {
  INITIAL_CARD_SEEDS,
  INITIAL_EN_CARD_SEEDS,
  INITIAL_QUESTION_SEEDS,
  INITIAL_EN_QUESTION_SEEDS,
  INITIAL_MISTAKE_SEEDS,
  INITIAL_SKILL_METRIC_SEEDS,
} from './seeds/learning-seed.js';
export { LEARNING_CONTENT_TEMPLATE_SEEDS } from './seeds/content-template-seed.js';


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
      target_language TEXT NOT NULL DEFAULT 'en',
      study_goal TEXT NOT NULL DEFAULT 'CET6',
      learner_level TEXT NOT NULL DEFAULT 'BEGINNER',
      overall_level TEXT NOT NULL DEFAULT 'B1',
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

    CREATE TABLE IF NOT EXISTS learner_language_profiles (
      user_id TEXT NOT NULL,
      language TEXT NOT NULL,
      study_goal TEXT NOT NULL DEFAULT 'CET6',
      learner_level TEXT NOT NULL DEFAULT 'BEGINNER',
      overall_level TEXT NOT NULL DEFAULT 'B1',
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
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, language)
    );

    CREATE TABLE IF NOT EXISTS study_activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      activity_date TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'ja',
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
      language TEXT NOT NULL DEFAULT 'ja',
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
      language TEXT NOT NULL DEFAULT 'ja',
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
      language TEXT NOT NULL DEFAULT 'ja',
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
      language TEXT NOT NULL DEFAULT 'ja',
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

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'ja',
      content TEXT NOT NULL,
      ast_json TEXT,
      topic TEXT,
      difficulty INTEGER,
      source_url TEXT,
      source_publisher TEXT,
      exam_tag TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id, source_kind);

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      quote TEXT NOT NULL,
      note TEXT,
      start_offset INTEGER NOT NULL DEFAULT 0,
      end_offset INTEGER NOT NULL DEFAULT 0,
      page_number INTEGER,
      created_by TEXT NOT NULL DEFAULT 'USER',
      flashcard_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_annotations_doc_user ON annotations(document_id, user_id);

    CREATE TABLE IF NOT EXISTS curriculum_kana (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      hiragana TEXT NOT NULL,
      katakana TEXT NOT NULL,
      romaji TEXT NOT NULL,
      row TEXT NOT NULL,
      col TEXT NOT NULL,
      mnemonic TEXT,
      audio_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kana_type ON curriculum_kana(type, sort_order);

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default_user',
      language TEXT NOT NULL DEFAULT 'ja',
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      prompt TEXT NOT NULL,
      content TEXT NOT NULL,
      options TEXT,
      chunks TEXT,
      correct_answer TEXT NOT NULL,
      explanation TEXT NOT NULL,
      tested_skill_id TEXT NOT NULL,
      difficulty INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_questions_user ON quiz_questions(user_id, created_at);

    CREATE TABLE IF NOT EXISTS practice_collections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'ja',
      title TEXT NOT NULL,
      intent TEXT NOT NULL DEFAULT 'GENERATE_QUIZ',
      layout_hint TEXT,
      source_ref TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_practice_collections_user ON practice_collections(user_id, created_at);

    CREATE TABLE IF NOT EXISTS practice_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'ja',
      collection_id TEXT NOT NULL,
      question_json TEXT NOT NULL,
      skill_ids TEXT,
      source_ref TEXT,
      passage_document_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      collected_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_practice_items_collection ON practice_items(collection_id, sort_order);

    CREATE TABLE IF NOT EXISTS learning_content_templates (
      id TEXT PRIMARY KEY,
      language TEXT NOT NULL,
      action TEXT NOT NULL,
      format TEXT,
      skill_id TEXT,
      difficulty INTEGER NOT NULL DEFAULT 2,
      topic TEXT,
      genre TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_content_templates_action_lang
      ON learning_content_templates(action, language, sort_order);
    CREATE INDEX IF NOT EXISTS idx_practice_items_user ON practice_items(user_id, collected_at);
  `);

  // 增量列：已有库补字段
  const alterStatements = [
    'ALTER TABLE annotations ADD COLUMN page_number INTEGER',
    "ALTER TABLE study_activity_logs ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE skill_metrics ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE flashcards ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE quiz_attempts ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE mistakes ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE quiz_questions ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE practice_collections ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE practice_items ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
  ];
  for (const sql of alterStatements) {
    try {
      sqlite.exec(sql);
    } catch {
      /* column already exists */
    }
  }

  try {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS idx_activity_user_date_lang ON study_activity_logs(user_id, activity_date, language)'
    );
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_flashcards_user_lang ON flashcards(user_id, language)');
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS idx_mistakes_user_lang_resolved ON mistakes(user_id, language, is_resolved)'
    );
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS idx_quiz_questions_user_lang ON quiz_questions(user_id, language, created_at)'
    );
  } catch {
    /* ignore */
  }

  // 将主档案镜像迁入当前语种行（仅当该语种行尚不存在）
  try {
    sqlite.exec(`
      INSERT OR IGNORE INTO learner_language_profiles (
        user_id, language, study_goal, learner_level, overall_level, overall_proficiency,
        streak_days, max_streak_days, last_active_date, retention_rate,
        daily_goal_quizzes, daily_goal_cards, total_study_minutes, total_cards_reviewed,
        total_quizzes_answered, updated_at
      )
      SELECT
        user_id,
        CASE
          WHEN lower(target_language) IN ('en', 'eng') THEN 'en'
          WHEN lower(target_language) IN ('ko', 'kr') THEN 'ko'
          ELSE 'ja'
        END,
        study_goal, learner_level, overall_level, overall_proficiency,
        streak_days, max_streak_days, last_active_date, retention_rate,
        daily_goal_quizzes, daily_goal_cards, total_study_minutes, total_cards_reviewed,
        total_quizzes_answered, updated_at
      FROM learner_profiles
    `);
  } catch (e) {
    console.warn('[initSchema] Failed to backfill learner_language_profiles:', e);
  }

    // 1. 自动填充五十音权威种子数据（若空）
    try {
      const countRow = sqlite
        .query<{ count: number }, []>('SELECT COUNT(*) as count FROM curriculum_kana')
        .get();
      if (!countRow || countRow.count === 0) {
        const insertStmt = sqlite.prepare(`
          INSERT INTO curriculum_kana (id, type, hiragana, katakana, romaji, row, col, mnemonic, audio_text, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const k of KANA_SEEDS) {
          insertStmt.run(
            k.id,
            k.type,
            k.hiragana,
            k.katakana,
            k.romaji,
            k.row,
            k.col,
            k.mnemonic ?? null,
            k.audioText,
            k.sortOrder
          );
        }
      }
    } catch (e) {
      console.warn('[initSchema] Failed to auto-seed curriculum_kana:', e);
    }

    // 2. 自动填充双源阅读篇目（若空）
    try {
      const readingCountRow = sqlite
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM documents WHERE source_kind IN ('ai_generated', 'news')"
        )
        .get();
      if (!readingCountRow || readingCountRow.count === 0) {
        const now = new Date().toISOString();
        const insertDocStmt = sqlite.prepare(`
          INSERT INTO documents (
            id, user_id, title, source_kind, language, content, ast_json, topic, difficulty, source_url, source_publisher, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const set of INITIAL_READING_SEEDS) {
          insertDocStmt.run(
            set.id,
            'default_user',
            set.title,
            set.origin === 'news' ? 'news' : 'ai_generated',
            set.language.toLowerCase(),
            set.body,
            JSON.stringify({ questions: set.questions }),
            set.topic,
            set.difficulty,
            set.sourceUrl ?? null,
            set.sourceLabel,
            now,
            now
          );
        }
      }
    } catch (e) {
      console.warn('[initSchema] Failed to auto-seed reading passages:', e);
    }

    // 3. 自动填充 FSRS 闪卡初始种子（按语种分仓）
    try {
      const now = new Date().toISOString();
      const insertCardStmt = sqlite.prepare(`
        INSERT INTO flashcards (id, user_id, language, type, front, back, phonetic, audio_url, tags, fsrs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const jaCardCount = sqlite
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM flashcards WHERE language = 'ja'")
        .get();
      if (!jaCardCount || jaCardCount.count === 0) {
        for (const c of INITIAL_CARD_SEEDS) {
          const fsrsObj = {
            stability: c.stability,
            difficulty: 5.0,
            reps: c.reps,
            lapses: 0,
            dueAt: now,
            state: c.reps > 0 ? 'REVIEW' : 'NEW',
          };
          const tags = [...c.tags];
          if (c.exampleJp) tags.push(c.exampleJp);
          if (c.exampleZh) tags.push(c.exampleZh);

          insertCardStmt.run(
            c.id,
            'student_web_01',
            'ja',
            c.type,
            c.front,
            c.back,
            c.phonetic ?? null,
            c.audioUrl ?? null,
            JSON.stringify(tags),
            JSON.stringify(fsrsObj)
          );
        }
      }

      const enCardCount = sqlite
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM flashcards WHERE language = 'en'")
        .get();
      if (!enCardCount || enCardCount.count === 0) {
        for (const c of INITIAL_EN_CARD_SEEDS) {
          const fsrsObj = {
            stability: c.stability,
            difficulty: 5.0,
            reps: c.reps,
            lapses: 0,
            dueAt: now,
            state: c.reps > 0 ? 'REVIEW' : 'NEW',
          };
          const tags = [...c.tags];
          if (c.exampleJp) tags.push(c.exampleJp);
          if (c.exampleZh) tags.push(c.exampleZh);

          insertCardStmt.run(
            c.id,
            'student_web_01',
            'en',
            c.type,
            c.front,
            c.back,
            c.phonetic ?? null,
            c.audioUrl ?? null,
            JSON.stringify(tags),
            JSON.stringify(fsrsObj)
          );
        }
      }
    } catch (e) {
      console.warn('[initSchema] Failed to auto-seed flashcards:', e);
    }

    // 4. 自动填充初始测评与自适应题库（按语种分仓）
    try {
      const now = new Date().toISOString();
      const insertQStmt = sqlite.prepare(`
        INSERT INTO quiz_questions (id, user_id, language, type, category, prompt, content, options, chunks, correct_answer, explanation, tested_skill_id, difficulty, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const jaQCount = sqlite
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM quiz_questions WHERE language = 'ja'")
        .get();
      if (!jaQCount || jaQCount.count === 0) {
        for (const q of INITIAL_QUESTION_SEEDS) {
          insertQStmt.run(
            q.id,
            'student_web_01',
            'ja',
            q.type,
            q.category,
            q.prompt,
            q.content,
            q.options ? JSON.stringify(q.options) : null,
            q.chunks ? JSON.stringify(q.chunks) : null,
            q.correctAnswer,
            q.explanation,
            q.testedSkillId,
            q.difficulty,
            now
          );
        }
      }

      const enQCount = sqlite
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM quiz_questions WHERE language = 'en'")
        .get();
      if (!enQCount || enQCount.count === 0) {
        for (const q of INITIAL_EN_QUESTION_SEEDS) {
          insertQStmt.run(
            q.id,
            'student_web_01',
            'en',
            q.type,
            q.category,
            q.prompt,
            q.content,
            q.options ? JSON.stringify(q.options) : null,
            q.chunks ? JSON.stringify(q.chunks) : null,
            q.correctAnswer,
            q.explanation,
            q.testedSkillId,
            q.difficulty,
            now
          );
        }
      }
    } catch (e) {
      console.warn('[initSchema] Failed to auto-seed quiz_questions:', e);
    }

    // 5. 自动填充初始错题记录（若空）
    try {
      const mistCountRow = sqlite
        .query<{ count: number }, []>('SELECT COUNT(*) as count FROM mistakes')
        .get();
      if (!mistCountRow || mistCountRow.count === 0) {
        const now = new Date().toISOString();
        const insertMistStmt = sqlite.prepare(`
          INSERT INTO mistakes (id, user_id, language, question_id, question, last_user_submission, last_grading, recorded_at, last_retried_at, retry_count, consecutive_correct, is_resolved)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const m of INITIAL_MISTAKE_SEEDS) {
          const questionObj = {
            id: m.questionId,
            type: 'CHOICE',
            category: m.categoryTag,
            prompt: m.prompt,
            content: m.sentence,
            correctAnswer: m.correctAnswer,
            explanation: m.reviewNote,
            testedSkillId: m.testedSkillId,
          };
          const gradingObj = {
            isCorrect: false,
            score: 0,
            correctAnswer: m.correctAnswer,
            userSubmission: m.userWrongAnswer,
            explanation: m.reviewNote,
          };
          insertMistStmt.run(
            m.id,
            'student_web_01',
            'ja',
            m.questionId,
            JSON.stringify(questionObj),
            m.userWrongAnswer,
            JSON.stringify(gradingObj),
            now,
            null,
            1,
            m.consecutiveCorrect,
            m.isResolved ? 1 : 0
          );
        }
      }
    } catch (e) {
      console.warn('[initSchema] Failed to auto-seed mistakes:', e);
    }

    // 6. 自动填充技能画像指标（若空）
    try {
      const smCountRow = sqlite
        .query<{ count: number }, []>('SELECT COUNT(*) as count FROM skill_metrics')
        .get();
      if (!smCountRow || smCountRow.count === 0) {
        const now = new Date().toISOString();
        const insertSmStmt = sqlite.prepare(`
          INSERT INTO skill_metrics (user_id, skill_id, language, dimension, name, proficiency, total_attempts, correct_attempts, consecutive_errors, status, last_practiced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const sm of INITIAL_SKILL_METRIC_SEEDS) {
          const lang = sm.skillId.startsWith('en.')
            ? 'en'
            : sm.skillId.startsWith('ko.')
              ? 'ko'
              : 'ja';
          insertSmStmt.run(
            'student_web_01',
            sm.skillId,
            lang,
            sm.dimension,
            sm.name,
            sm.proficiency,
            sm.totalAttempts,
            sm.correctAttempts,
            sm.consecutiveErrors,
            sm.status,
            now
          );
        }
      }
    } catch (e) {
      console.warn('[initSchema] Failed to auto-seed skill_metrics:', e);
    }

    // 7. learning.content 内容模板库（工具离线兜底 SSOT）
    try {
      const tplCount = sqlite
        .query<{ count: number }, []>('SELECT COUNT(*) as count FROM learning_content_templates')
        .get();
      if (!tplCount || tplCount.count === 0) {
        const now = new Date().toISOString();
        const insertTpl = sqlite.prepare(`
          INSERT INTO learning_content_templates
            (id, language, action, format, skill_id, difficulty, topic, genre, sort_order, payload, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of LEARNING_CONTENT_TEMPLATE_SEEDS) {
          insertTpl.run(
            t.id,
            t.language,
            t.action,
            t.format ?? null,
            t.skillId ?? null,
            t.difficulty,
            t.topic ?? null,
            t.genre ?? null,
            t.sortOrder,
            JSON.stringify(t.payload),
            now
          );
        }
      }
    } catch (e) {
      console.warn('[initSchema] Failed to auto-seed learning_content_templates:', e);
    }
  }
