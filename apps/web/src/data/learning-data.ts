/**
 * 学习域核心前端类型定义契约
 * 注意：所有历史硬编码 Mock 数据均已迁移至 SQLite 数据库作为唯一事实源 (SSOT)
 */

export interface QuizQuestionItem {
  id: string;
  type: 'CHOICE' | 'FILL_BLANK' | 'REORDER';
  category: string;
  prompt: string;
  content: string;
  options?: { key: string; text: string; note?: string }[];
  chunks?: string[]; // for reorder type
  correctAnswer: string;
  explanation: string;
  testedSkill: string;
}

export interface StudyCardItem {
  id: string;
  type: 'VOCAB' | 'GRAMMAR' | 'CONFUSION';
  frontWord: string;
  reading: string;
  tag: string;
  pos: string;
  backMeaning: string;
  exampleJp: string;
  exampleHighlight: string;
  exampleZh: string;
  note?: string;
  stability: number;
  reps: number;
  /** FSRS 到期时间（ISO）；缺省视为待复习 */
  dueAt?: string;
}

export interface MistakeNotebookItem {
  id: string;
  categoryTag: string;
  prompt: string;
  sentence: string;
  userWrongAnswer: string;
  correctAnswer: string;
  testedSkillId: string;
  reviewNote: string;
  consecutiveCorrect: number; // 0/2 or 1/2
  isResolved: boolean;
}
