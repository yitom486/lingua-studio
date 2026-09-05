/**
 * 练习内容前端展示类型契约。
 * 听写题 / 主观写作题内容全部由 Gateway learning.content 按需生成并持久化，
 * 前端不内置任何演示题池；类型仅描述 Gateway 返回的条目形状。
 */

/** 考点挖词精听听写条目（Gateway learning.content generate_quiz + LISTENING_DICTATION） */
export interface DictationItem {
  id: string;
  sourceLesson: string;
  speaker: string;
  fullJapanese: string;
  chinese: string;
  blankPrompt: string;
  clozeDisplay: string;
  targetWord: string;
  furiganaHint: string;
  categoryTag: string;
  testedSkillId: string;
  grammarExplanation: string;
}

/** 主观写作 / 翻译题干（Gateway learning.content generate_writing_prompt） */
export interface SubjectiveExercise {
  id: string;
  category: string;
  chinesePrompt: string;
  contextHint: string;
  testedSkillId: string;
  standardAnswer: string;
  grammarFocus: string;
}
