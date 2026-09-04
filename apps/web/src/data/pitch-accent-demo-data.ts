/**
 * 声调纠音演示词表（最小对立与典型词）。
 * 未来对接 OJAD / 词典 API 后改为按词动态拉取。
 */

export type PitchLevel = 'L' | 'H';

export type PitchTypeLabel = '平板型 (⓪)' | '头高型 (①)' | '中高型 (②/③)' | '尾高型';

export interface PitchContrastPair {
  kanji: string;
  kana: string;
  pitchType: string;
  pitchPattern: PitchLevel[];
  meaning: string;
}

export interface PitchWord {
  id: string;
  kanji: string;
  kana: string;
  romaji: string;
  meaning: string;
  pitchType: PitchTypeLabel;
  pitchPattern: PitchLevel[];
  moraList: string[];
  contrastPair?: PitchContrastPair | undefined;
  tip: string;
}

export const BENCHMARK_PITCH_WORDS: PitchWord[] = [
  {
    id: 'p1',
    kanji: '雨',
    kana: 'あめ',
    romaji: 'ame',
    meaning: '下雨 (Rain)',
    pitchType: '头高型 (①)',
    pitchPattern: ['H', 'L'],
    moraList: ['あ', 'め'],
    contrastPair: {
      kanji: '飴',
      kana: 'あめ',
      pitchType: '平板型 (⓪)',
      pitchPattern: ['L', 'H'],
      meaning: '糖果 (Candy)',
    },
    tip: '第一拍「あ」高声发音，第二拍「め」立刻坠落至低音。切勿发成平调！',
  },
  {
    id: 'p2',
    kanji: '箸',
    kana: 'はし',
    romaji: 'hashi',
    meaning: '筷子 (Chopsticks)',
    pitchType: '头高型 (①)',
    pitchPattern: ['H', 'L'],
    moraList: ['は', 'し'],
    contrastPair: {
      kanji: '橋',
      kana: 'はし',
      pitchType: '尾高型',
      pitchPattern: ['L', 'H'],
      meaning: '桥梁 (Bridge)',
    },
    tip: '「箸」是头高型①，而「橋」是尾高型（后接助词时助词下降），「端」是平板型⓪。',
  },
  {
    id: 'p3',
    kanji: '日本人',
    kana: 'にほんじん',
    romaji: 'nihonjin',
    meaning: '日本人',
    pitchType: '尾高型',
    pitchPattern: ['L', 'H', 'H', 'H', 'L'],
    moraList: ['に', 'ほ', 'ん', 'じ', 'ん'],
    tip: '第一拍「に」低，第二拍至第四拍「ほんじ」维持高位，在末尾拍下降。',
  },
  {
    id: 'p4',
    kanji: 'はじめまして',
    kana: 'はじめまして',
    romaji: 'hajimemashite',
    meaning: '初次见面',
    pitchType: '中高型 (②/③)',
    pitchPattern: ['L', 'H', 'H', 'H', 'L', 'L', 'L'],
    moraList: ['は', 'じ', 'め', 'ま', 'し', 'て'],
    tip: '初学者常见毛病是每一拍都说一样平。在「め」达到峰值后逐渐回落。',
  },
  {
    id: 'p5',
    kanji: '花',
    kana: 'はな',
    romaji: 'hana',
    meaning: '花 (Flower)',
    pitchType: '尾高型',
    pitchPattern: ['L', 'H'],
    moraList: ['は', 'な'],
    contrastPair: {
      kanji: '鼻',
      kana: 'はな',
      pitchType: '平板型 (⓪)',
      pitchPattern: ['L', 'H'],
      meaning: '鼻子 (Nose)',
    },
    tip: '「花」尾高型：后接助词「が」时助词下降；「鼻」平板型：助词仍保持高音。',
  },
  {
    id: 'p6',
    kanji: '今',
    kana: 'いま',
    romaji: 'ima',
    meaning: '现在 (Now)',
    pitchType: '头高型 (①)',
    pitchPattern: ['H', 'L'],
    moraList: ['い', 'ま'],
    tip: '两拍头高型：第一拍高、第二拍立刻落下，语感干脆短促。',
  },
  {
    id: 'p7',
    kanji: '私',
    kana: 'わたし',
    romaji: 'watashi',
    meaning: '我 (I)',
    pitchType: '头高型 (①)',
    pitchPattern: ['H', 'L', 'L'],
    moraList: ['わ', 'た', 'し'],
    tip: '第一拍「わ」最高，其后维持低位；勿把「たし」抬高成中高型。',
  },
  {
    id: 'p8',
    kanji: '家族',
    kana: 'かぞく',
    romaji: 'kazoku',
    meaning: '家人 (Family)',
    pitchType: '中高型 (②/③)',
    pitchPattern: ['L', 'H', 'L'],
    moraList: ['か', 'ぞ', 'く'],
    tip: '核在第二拍「ぞ」：低→高→低，是典型三拍中高型。',
  },
  {
    id: 'p9',
    kanji: '先生',
    kana: 'せんせい',
    romaji: 'sensei',
    meaning: '老师 (Teacher)',
    pitchType: '头高型 (①)',
    pitchPattern: ['H', 'L', 'L', 'L'],
    moraList: ['せ', 'ん', 'せ', 'い'],
    tip: '「せ」起高后整段低走；注意拨音「ん」也占一拍。',
  },
  {
    id: 'p10',
    kanji: '学生',
    kana: 'がくせい',
    romaji: 'gakusei',
    meaning: '学生 (Student)',
    pitchType: '中高型 (②/③)',
    pitchPattern: ['L', 'H', 'H', 'L'],
    moraList: ['が', 'く', 'せ', 'い'],
    tip: '第二拍起高，在「い」前回落；与「先生」头高型形成对照练习。',
  },
];
