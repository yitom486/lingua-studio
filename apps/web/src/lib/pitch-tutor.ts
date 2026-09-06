/**
 * 声调 AI 导师上下文构造器（纯函数，不绑定任何 UI）。
 * 把课程声调种子（调型/口诀/最小对立对）拼成“教我读准它”的导师上下文，
 * 与 kana-tutor 同源做法：UI 只负责调用。
 */
import type { AiTutorContext } from '../stores/tutor-context.js';
import type { PitchLexiconItem } from '../queries/useLearnerQueries.js';

export function buildPitchTutorContext(word: PitchLexiconItem): AiTutorContext {
  const contrast = word.contrastPair
    ? `它和「${word.contrastPair.kanji}（${word.contrastPair.kana}，${word.contrastPair.pitchType}）」只有声调不同`
    : '';
  return {
    questionText:
      `请教我读准日语单词「${word.kanji}」（${word.kana}，${word.pitchType}）。` +
      `请给：1) 逐拍高低走法（${word.moraList.join('・')}）；` +
      `2) 一个中文谐音记忆钩；` +
      (contrast ? `3) ${contrast}，怎么一眼听出区别。` : `3) 中国人最容易读错的一点。`),
    correctAnswer: `${word.kanji}（${word.kana}）· ${word.pitchType}`,
    skillTag: 'jp.pitch.accent',
    explanation: `【${word.kanji}】${word.pitchType}：${word.tip}${
      word.contrastPair ? `对比词${word.contrastPair.kanji}（${word.contrastPair.kana}）为${word.contrastPair.pitchType}。` : ''
    }`,
  };
}
