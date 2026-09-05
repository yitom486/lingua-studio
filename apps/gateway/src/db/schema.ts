import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';

/**
 * 学习者档案表 (Learner Profiles)
 * displayName + 当前激活轨道 target_language；其余学情字段为「当前轨道镜像」，
 * 权威按语种数据在 learner_language_profiles。
 */
export const learnerProfiles = sqliteTable('learner_profiles', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name').notNull().default(''),
  targetLanguage: text('target_language').notNull().default('en'),
  studyGoal: text('study_goal').notNull().default('CET6'),
  learnerLevel: text('learner_level').notNull().default('BEGINNER'),
  overallLevel: text('overall_level').notNull().default('B1'),
  overallProficiency: real('overall_proficiency').notNull().default(0.55),
  streakDays: integer('streak_days').notNull().default(0),
  maxStreakDays: integer('max_streak_days').notNull().default(0),
  lastActiveDate: text('last_active_date'),
  retentionRate: real('retention_rate').notNull().default(0.85),
  dailyGoalQuizzes: integer('daily_goal_quizzes').notNull().default(5),
  dailyGoalCards: integer('daily_goal_cards').notNull().default(10),
  totalStudyMinutes: integer('total_study_minutes').notNull().default(0),
  totalCardsReviewed: integer('total_cards_reviewed').notNull().default(0),
  totalQuizzesAnswered: integer('total_quizzes_answered').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

/**
 * 按目标语种隔离的学情档案（ja / en / ko）
 * 切换设置中的语种时换行，不覆盖另一语种的目标与连胜。
 */
export const learnerLanguageProfiles = sqliteTable(
  'learner_language_profiles',
  {
    userId: text('user_id').notNull(),
    language: text('language').notNull(), // 'ja' | 'en' | 'ko'
    studyGoal: text('study_goal').notNull().default('CET6'),
    learnerLevel: text('learner_level').notNull().default('BEGINNER'),
    overallLevel: text('overall_level').notNull().default('B1'),
    overallProficiency: real('overall_proficiency').notNull().default(0.55),
    streakDays: integer('streak_days').notNull().default(0),
    maxStreakDays: integer('max_streak_days').notNull().default(0),
    lastActiveDate: text('last_active_date'),
    retentionRate: real('retention_rate').notNull().default(0.85),
    dailyGoalQuizzes: integer('daily_goal_quizzes').notNull().default(5),
    dailyGoalCards: integer('daily_goal_cards').notNull().default(10),
    totalStudyMinutes: integer('total_study_minutes').notNull().default(0),
    totalCardsReviewed: integer('total_cards_reviewed').notNull().default(0),
    totalQuizzesAnswered: integer('total_quizzes_answered').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.language] }),
  })
);

/**
 * 每日打卡与学情足迹表 (Study Activity Logs) — 按语种分区
 */
export const studyActivityLogs = sqliteTable(
  'study_activity_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    activityDate: text('activity_date').notNull(), // 'YYYY-MM-DD'
    language: text('language').notNull().default('ja'),
    quizzesCount: integer('quizzes_count').notNull().default(0),
    cardsReviewedCount: integer('cards_reviewed_count').notNull().default(0),
    listeningMinutes: integer('listening_minutes').notNull().default(0),
    mistakesResolvedCount: integer('mistakes_resolved_count').notNull().default(0),
    isGoalCompleted: integer('is_goal_completed', { mode: 'boolean' }).notNull().default(false),
    intensityLevel: integer('intensity_level').notNull().default(0), // 0 ~ 4
    isOvertimeBurst: integer('is_overtime_burst', { mode: 'boolean' }).notNull().default(false),
    completedAt: text('completed_at'),
  },
  (table) => ({
    userDateLangIdx: index('idx_activity_user_date_lang').on(
      table.userId,
      table.activityDate,
      table.language
    ),
  })
);

/**
 * 技能掌握度雷达表 (Skill Metrics) — 显式 language + skillId 前缀双保险
 */
export const skillMetrics = sqliteTable(
  'skill_metrics',
  {
    userId: text('user_id').notNull(),
    skillId: text('skill_id').notNull(),
    language: text('language').notNull().default('ja'),
    dimension: text('dimension').notNull(),
    name: text('name').notNull(),
    proficiency: real('proficiency').notNull(),
    totalAttempts: integer('total_attempts').notNull(),
    correctAttempts: integer('correct_attempts').notNull(),
    consecutiveErrors: integer('consecutive_errors').notNull(),
    status: text('status').notNull(),
    lastPracticedAt: text('last_practiced_at'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.skillId] }),
  })
);

/**
 * 记忆卡片表 (Flashcards)
 */
export const flashcards = sqliteTable(
  'flashcards',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    language: text('language').notNull().default('ja'),
    type: text('type').notNull(),
    front: text('front').notNull(),
    back: text('back').notNull(),
    phonetic: text('phonetic'),
    audioUrl: text('audio_url'),
    tags: text('tags').notNull(),
    fsrs: text('fsrs').notNull(),
  },
  (table) => ({
    userLangIdx: index('idx_flashcards_user_lang').on(table.userId, table.language),
  })
);

/**
 * 做题尝试历史表 (Quiz Attempts)
 */
export const quizAttempts = sqliteTable('quiz_attempts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  language: text('language').notNull().default('ja'),
  questionId: text('question_id').notNull(),
  userAnswer: text('user_answer').notNull(),
  isCorrect: integer('is_correct', { mode: 'boolean' }).notNull(),
  score: real('score').notNull(),
  timeSpentMs: integer('time_spent_ms').notNull(),
  testedSkillId: text('tested_skill_id').notNull(),
  createdAt: text('created_at').notNull(),
});

/**
 * 错题本记录表 (Mistakes)
 */
export const mistakes = sqliteTable(
  'mistakes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    language: text('language').notNull().default('ja'),
    questionId: text('question_id').notNull(),
    question: text('question').notNull(),
    lastUserSubmission: text('last_user_submission').notNull(),
    lastGrading: text('last_grading').notNull(),
    recordedAt: text('recorded_at').notNull(),
    lastRetriedAt: text('last_retried_at'),
    retryCount: integer('retry_count').notNull(),
    consecutiveCorrect: integer('consecutive_correct').notNull(),
    isResolved: integer('is_resolved', { mode: 'boolean' }).notNull(),
  },
  (table) => ({
    userLangResolvedIdx: index('idx_mistakes_user_lang_resolved').on(
      table.userId,
      table.language,
      table.isResolved
    ),
  })
);

/**
 * 教材与导入文档表 (Documents)
 */
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  sourceKind: text('source_kind').notNull(), // 'user_import' | 'system' | 'ai_generated' | 'news'
  language: text('language').notNull().default('ja'),
  content: text('content').notNull(),
  astJson: text('ast_json'),
  topic: text('topic'),
  difficulty: integer('difficulty'),
  sourceUrl: text('source_url'),
  sourcePublisher: text('source_publisher'),
  examTag: text('exam_tag'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * 划线批注与重点表 (Annotations)
 */
export const annotations = sqliteTable('annotations', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(), // 'KEY_POINT' | 'VOCAB' | 'GRAMMAR' | 'EXAM_TRAP' | 'PARAPHRASE'
  quote: text('quote').notNull(),
  note: text('note'),
  startOffset: integer('start_offset').notNull().default(0),
  endOffset: integer('end_offset').notNull().default(0),
  /** PDF 页码（1-based），纯文本批注可空 */
  pageNumber: integer('page_number'),
  createdBy: text('created_by').notNull().default('USER'), // 'USER' | 'AGENT'
  flashcardId: text('flashcard_id'),
  createdAt: text('created_at').notNull(),
});

/**
 * 五十音/假名课程底座表 (Curriculum Kana) — 日语专属
 */
export const curriculumKana = sqliteTable('curriculum_kana', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'SEION' | 'DAKUON' | 'HANDAKUON' | 'YOON' | 'SPECIAL'
  hiragana: text('hiragana').notNull(),
  katakana: text('katakana').notNull(),
  romaji: text('romaji').notNull(),
  row: text('row').notNull(),
  col: text('col').notNull(),
  mnemonic: text('mnemonic'),
  audioText: text('audio_text').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

/**
 * 自适应题库表 (Quiz Questions)
 */
export const quizQuestions = sqliteTable(
  'quiz_questions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().default('default_user'),
    language: text('language').notNull().default('ja'),
    type: text('type').notNull(), // 'CHOICE' | 'FILL_BLANK' | 'REORDER'
    category: text('category').notNull(),
    prompt: text('prompt').notNull(),
    content: text('content').notNull(),
    options: text('options'), // JSON string of options [{ key, text, note }]
    chunks: text('chunks'), // JSON string of chunks ['a', 'b']
    correctAnswer: text('correct_answer').notNull(),
    explanation: text('explanation').notNull(),
    testedSkillId: text('tested_skill_id').notNull(),
    difficulty: integer('difficulty').notNull().default(3),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    userLangCreatedIdx: index('idx_quiz_questions_user_lang').on(
      table.userId,
      table.language,
      table.createdAt
    ),
  })
);

/**
 * 一次「出 N 道 / 阅读套题」练习会话（≠ FSRS 卡）
 */
export const practiceCollections = sqliteTable('practice_collections', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  language: text('language').notNull().default('ja'),
  title: text('title').notNull(),
  intent: text('intent').notNull().default('GENERATE_QUIZ'),
  layoutHint: text('layout_hint'), // 'SPLIT_PASSAGE_QUESTIONS' | 'SINGLE_COLUMN' | null
  sourceRef: text('source_ref'),
  createdAt: text('created_at').notNull(),
});

/**
 * 练习队列条目（可映射 GeneratedQuestion JSON）
 */
export const practiceItems = sqliteTable('practice_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  language: text('language').notNull().default('ja'),
  collectionId: text('collection_id').notNull(),
  questionJson: text('question_json').notNull(),
  skillIds: text('skill_ids'), // JSON string array
  sourceRef: text('source_ref'),
  passageDocumentId: text('passage_document_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  collectedAt: text('collected_at').notNull(),
});

/**
 * 本地词典条目：仅收录本项目自有或已明确获授权再分发的数据。
 * 未命中时由 Gateway 返回外部词典链接；不缓存、不抓取第三方页面内容。
 */
export const localDictionaryEntries = sqliteTable(
  'local_dictionary_entries',
  {
    id: text('id').primaryKey(),
    language: text('language').notNull(), // 'ja' | 'en' | 'ko'
    headword: text('headword').notNull(),
    reading: text('reading'),
    romanization: text('romanization'),
    meaningsJson: text('meanings_json').notNull(),
    pronunciationJson: text('pronunciation_json'),
    partOfSpeech: text('part_of_speech'),
    sourceId: text('source_id'),
    sourceLabel: text('source_label').notNull(),
    licenseNote: text('license_note').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    languageHeadwordIdx: index('idx_local_dictionary_language_headword').on(
      table.language,
      table.headword
    ),
  })
);

/** 每个已安装词典包的版本、来源与署名信息。 */
export const dictionarySources = sqliteTable('dictionary_sources', {
  id: text('id').primaryKey(),
  language: text('language').notNull(),
  provider: text('provider').notNull(),
  version: text('version').notNull(),
  sourceUrl: text('source_url').notNull(),
  licenseName: text('license_name').notNull(),
  licenseUrl: text('license_url').notNull(),
  attribution: text('attribution').notNull(),
  entryCount: integer('entry_count').notNull().default(0),
  importedAt: text('imported_at').notNull(),
});

/**
 * learning.content 离线/冷启动内容模板库（工具运行时只读，不在 TS 内硬编码题干）
 */
export const learningContentTemplates = sqliteTable(
  'learning_content_templates',
  {
    id: text('id').primaryKey(),
    language: text('language').notNull(),
    action: text('action').notNull(),
    format: text('format'),
    skillId: text('skill_id'),
    difficulty: integer('difficulty').notNull().default(2),
    topic: text('topic'),
    genre: text('genre'),
    sortOrder: integer('sort_order').notNull().default(0),
    payload: text('payload').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    actionLangIdx: index('idx_content_templates_action_lang').on(
      table.action,
      table.language,
      table.sortOrder
    ),
  })
);
