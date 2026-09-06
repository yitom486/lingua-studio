/**
 * 假名 AI 导师上下文构造器（纯函数，不绑定任何 UI）。
 * 任何页面（矩阵详情卡、自测反馈、错题回炉…）只需传入假名与题池，
 * 即可拿到可直接灌入导师抽屉的 AiTutorContext；记忆引导语与易混对照
 * 由课程表种子 + 混淆算法实时推导，不写死文案。
 */
import type { KanaItem } from '@study-studio/protocol';
import type { AiTutorContext } from '../stores/tutor-context.js';
import { confusionDistractors, type KanaScript } from './kana-confusion.js';

export interface KanaTutorInput {
  kana: KanaItem;
  /** 题池（用于推导形近字；为空时只讲本字，不阻断）。 */
  pool?: KanaItem[] | undefined;
  script?: KanaScript | undefined;
  /** 自测刚答错时传入，导师着重讲清错因。 */
  wasWrong?: boolean | undefined;
  /** 答错时用户选的选项字面。 */
  userPick?: string | null | undefined;
}

function faceOf(kana: KanaItem, script: KanaScript): string {
  return script === 'KATAKANA' ? kana.katakana : kana.hiragana;
}

/**
 * 为单个假名构造“帮我记住它”的导师上下文：
 * 中文联想口诀 + 形近字一眼区分法 + 跟读嘴形要点；
 * 答错时追加错因追问。返回体与既有抽屉契约一致。
 */
export function buildKanaTutorContext(input: KanaTutorInput): AiTutorContext {
  const { kana, pool = [], script = 'HIRAGANA', wasWrong = false, userPick = null } = input;
  const face = faceOf(kana, script);
  const neighbors = confusionDistractors(kana, pool, script, 3);
  const contrast = neighbors.length > 0 ? `它和「${neighbors.join('」「')}」` : '它';
  const skillTag = script === 'KATAKANA' ? 'jp.kana.katakana' : 'jp.kana.hiragana';

  const questionText =
    `请帮我记住日语假名「${face}」（${kana.romaji}）。` +
    `请给三样东西：1) 一句中文联想口诀（越形象越好）；` +
    `2) ${contrast}放在一起时的一眼区分法；` +
    `3) 跟读时的嘴形与易错点。` +
    (wasWrong
      ? `我刚才把它认成了「${userPick ?? '?'}」，请重点讲清为什么错、下次怎么一眼看对。`
      : `只讲记忆法，不要展开超纲语法。`);

  const explanation =
    `假名【${face}】(${kana.romaji})，${kana.mnemonic || '标准发音单元'}。` +
    (neighbors.length > 0 ? `易混对照：${neighbors.join('、')}。` : '') +
    `注意发音嘴形与送气控制。`;

  return {
    questionText,
    ...(wasWrong && userPick ? { userAnswer: userPick } : {}),
    correctAnswer: `${kana.hiragana} / ${kana.katakana} (${kana.romaji})`,
    skillTag,
    explanation,
  };
}
