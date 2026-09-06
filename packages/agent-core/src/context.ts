export interface LearnerWeaknessDigest {
  skillId: string;
  name: string;
  proficiency: number;
}

export interface ContextFocusItem {
  kind: 'QUESTION' | 'CARD' | 'MISTAKE' | 'KANA_CELL' | 'TEXTBOOK_SPAN' | 'READING_PASSAGE' | 'SENTENCE';
  id?: string | undefined;
  surface: string;
  reading?: string | undefined;
  userAnswer?: string | undefined;
  correctAnswer?: string | undefined;
  explanation?: string | undefined;
  skillTag?: string | undefined;
}

export interface LearnerDigest {
  topWeaknesses: LearnerWeaknessDigest[];
  dueCardsCount?: number | undefined;
  unresolvedMistakesCount?: number | undefined;
  streakDays?: number | undefined;
  recentErrorTags?: string[] | undefined;
  kanaMastery?: { hiragana: number; katakana: number } | undefined;
  hangulMastery?: { consonant: number; vowel: number; compound: number } | undefined;
  /** 今日计划尚未完成的步骤标题，供教练按序引导 */
  dailyPlanRemaining?: string[] | undefined;
}

export interface ContextSnapshot {
  targetLanguage: 'ja' | 'en' | 'ko';
  learnerLevel: string;
  locale?: 'zh-CN' | 'en' | undefined;
  ui?: {
    activeTab?: string | undefined;
    activeMode?: string | undefined;
    openTutor?: boolean | undefined;
    splitPaneRatio?: number | undefined;
  } | undefined;
  focus?: ContextFocusItem | undefined;
  learnerDigest?: LearnerDigest | undefined;
  userIntentHint?:
    | 'EXPLAIN'
    | 'GENERATE_QUIZ'
    | 'GRADE'
    | 'DRILL_KANA'
    | 'DRILL_HANGUL'
    | 'REVIEW_MISTAKES'
    | 'FREE_COACH'
    | undefined;
  constraints?: {
    allowedScripts?: Array<'hiragana' | 'katakana' | 'kanji' | 'romaji'> | undefined;
    maxQuestions?: number | undefined;
    questionTypes?: string[] | undefined;
    textbookLessonId?: string | undefined;
  } | undefined;
  // 向后兼容字段
  currentQuestion?: {
    id: string;
    content: string;
    correctAnswer: string;
    userAnswer?: string | undefined;
  } | undefined;
  topWeaknesses?: string[] | undefined;
  selectedWord?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface AgentInput {
  message: string;
  contextSnapshot?: ContextSnapshot | undefined;
  /** 本轮覆盖：模型 / 思考等级 / 审批策略 / 协作模式（由 Adapter 映射到引擎原生字段） */
  turnOptions?:
    | {
        model?: string | undefined;
        effort?: string | undefined;
        approvalPolicy?: string | undefined;
        /** collaborationMode.mode：default | plan */
        collaborationMode?: string | undefined;
      }
    | undefined;
}

