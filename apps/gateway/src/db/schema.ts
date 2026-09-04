import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

/**
 * 学习者档案表 (Learner Profiles)
 * 记录昵称、学习目标 (JLPT N2/考研英语等)、等级、连胜天数与每日目标配置
 */
export const learnerProfiles = sqliteTable('learner_profiles', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name').notNull().default(''),
  targetLanguage: text('target_language').notNull().default('ja'),
  studyGoal: text('study_goal').notNull().default('JLPT_N2'),
  learnerLevel: text('learner_level').notNull().default('BEGINNER'),
  overallLevel: text('overall_level').notNull().default('N3-'),
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
 * 每日打卡与学情足迹表 (Study Activity Logs)
 * 记录用户每天的客观题、卡片复习量，以及是否达成每日目标或开启超额连刷 (Overtime Burst)
 */
export const studyActivityLogs = sqliteTable('study_activity_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  activityDate: text('activity_date').notNull(), // 'YYYY-MM-DD'
  quizzesCount: integer('quizzes_count').notNull().default(0),
  cardsReviewedCount: integer('cards_reviewed_count').notNull().default(0),
  listeningMinutes: integer('listening_minutes').notNull().default(0),
  mistakesResolvedCount: integer('mistakes_resolved_count').notNull().default(0),
  isGoalCompleted: integer('is_goal_completed', { mode: 'boolean' }).notNull().default(false),
  intensityLevel: integer('intensity_level').notNull().default(0), // 0 ~ 4
  isOvertimeBurst: integer('is_overtime_burst', { mode: 'boolean' }).notNull().default(false),
  completedAt: text('completed_at'),
});

/**
 * 技能掌握度雷达表 (Skill Metrics)
 */
export const skillMetrics = sqliteTable(
  'skill_metrics',
  {
    userId: text('user_id').notNull(),
    skillId: text('skill_id').notNull(),
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
export const flashcards = sqliteTable('flashcards', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  front: text('front').notNull(),
  back: text('back').notNull(),
  phonetic: text('phonetic'),
  audioUrl: text('audio_url'),
  tags: text('tags').notNull(),
  fsrs: text('fsrs').notNull(),
});

/**
 * 做题尝试历史表 (Quiz Attempts)
 */
export const quizAttempts = sqliteTable('quiz_attempts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
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
export const mistakes = sqliteTable('mistakes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  questionId: text('question_id').notNull(),
  question: text('question').notNull(),
  lastUserSubmission: text('last_user_submission').notNull(),
  lastGrading: text('last_grading').notNull(),
  recordedAt: text('recorded_at').notNull(),
  lastRetriedAt: text('last_retried_at'),
  retryCount: integer('retry_count').notNull(),
  consecutiveCorrect: integer('consecutive_correct').notNull(),
  isResolved: integer('is_resolved', { mode: 'boolean' }).notNull(),
});

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
  createdBy: text('created_by').notNull().default('USER'), // 'USER' | 'AGENT'
  flashcardId: text('flashcard_id'),
  createdAt: text('created_at').notNull(),
});

/**
 * 五十音/假名课程底座表 (Curriculum Kana)
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
 * 存储初始评测题与 AI 靶向弱项生成的题目，保证最新做题队列持久化
 */
export const quizQuestions = sqliteTable('quiz_questions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().default('default_user'),
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
});

/**
 * 一次「出 N 道 / 阅读套题」练习会话（≠ FSRS 卡）
 */
export const practiceCollections = sqliteTable('practice_collections', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
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
  collectionId: text('collection_id').notNull(),
  questionJson: text('question_json').notNull(),
  skillIds: text('skill_ids'), // JSON string array
  sourceRef: text('source_ref'),
  passageDocumentId: text('passage_document_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  collectedAt: text('collected_at').notNull(),
});
