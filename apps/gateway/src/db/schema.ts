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
