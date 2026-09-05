import type { Database } from 'bun:sqlite';

/**
 * 自动迁移/初始化数据表 DDL（P2-5 拆分：仅结构，不含种子数据）
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
      reading_count INTEGER NOT NULL DEFAULT 0,
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
      source_entry_id TEXT,
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
      source_kind_detail TEXT,
      fetch_status TEXT,
      news_publisher TEXT,
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

    CREATE TABLE IF NOT EXISTS local_dictionary_entries (
      id TEXT PRIMARY KEY,
      language TEXT NOT NULL,
      headword TEXT NOT NULL,
      reading TEXT,
      romanization TEXT,
      meanings_json TEXT NOT NULL,
      pronunciation_json TEXT,
      part_of_speech TEXT,
      source_id TEXT,
      source_label TEXT NOT NULL,
      license_note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_dictionary_language_headword
      ON local_dictionary_entries(language, headword);

    CREATE TABLE IF NOT EXISTS dictionary_sources (
      id TEXT PRIMARY KEY,
      language TEXT NOT NULL,
      provider TEXT NOT NULL,
      version TEXT NOT NULL,
      source_url TEXT NOT NULL,
      license_name TEXT NOT NULL,
      license_url TEXT NOT NULL,
      attribution TEXT NOT NULL,
      entry_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS daily_study_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      language TEXT NOT NULL,
      plan_date TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      completed_step_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS practice_plan_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      language TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      revision INTEGER NOT NULL DEFAULT 0,
      blocks_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_practice_templates_user_lang
      ON practice_plan_templates(user_id, language, enabled);

    CREATE TABLE IF NOT EXISTS practice_plan_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      language TEXT NOT NULL,
      template_id TEXT,
      template_revision INTEGER,
      blocks_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_practice_runs_user_status
      ON practice_plan_runs(user_id, status, created_at);

    CREATE TABLE IF NOT EXISTS practice_item_attempts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      user_answer TEXT,
      grading_result_json TEXT,
      time_spent_ms INTEGER,
      submitted_at TEXT,
      graded_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_practice_attempts_run
      ON practice_item_attempts(run_id, block_id, status);
  `);

  // 增量列：已有库补字段
  const alterStatements = [
    'ALTER TABLE annotations ADD COLUMN page_number INTEGER',
    "ALTER TABLE study_activity_logs ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE skill_metrics ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE flashcards ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    'ALTER TABLE flashcards ADD COLUMN source_entry_id TEXT',
    "ALTER TABLE quiz_attempts ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE mistakes ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE quiz_questions ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE practice_collections ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    "ALTER TABLE practice_items ADD COLUMN language TEXT NOT NULL DEFAULT 'ja'",
    'ALTER TABLE local_dictionary_entries ADD COLUMN source_id TEXT',
    'ALTER TABLE study_activity_logs ADD COLUMN reading_count INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE documents ADD COLUMN source_kind_detail TEXT',
    'ALTER TABLE documents ADD COLUMN fetch_status TEXT',
    'ALTER TABLE documents ADD COLUMN news_publisher TEXT',
    // P5：扩展 practice_collections 关联计划运行（可空，向后兼容）
    'ALTER TABLE practice_collections ADD COLUMN plan_run_id TEXT',
    'ALTER TABLE practice_collections ADD COLUMN block_id TEXT',
    'ALTER TABLE practice_collections ADD COLUMN grading_mode TEXT',
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
      'CREATE INDEX IF NOT EXISTS idx_flashcards_user_source_entry ON flashcards(user_id, source_entry_id)'
    );
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS idx_mistakes_user_lang_resolved ON mistakes(user_id, language, is_resolved)'
    );
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS idx_quiz_questions_user_lang ON quiz_questions(user_id, language, created_at)'
    );
    sqlite.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_plans_user_lang_date ON daily_study_plans(user_id, language, plan_date)'
    );
  } catch {
    /* ignore */
  }
}
