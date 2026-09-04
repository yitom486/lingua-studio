/**
 * 声调基准词表（Gateway 课程资产）。
 * 非 OJAD 直连：权威词典对接前作为 lookup_pitch / list_pitch_benchmarks 的 SSOT。
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

export interface PitchLexiconEntry {
  id: string;
  kanji: string;
  kana: string;
  romaji: string;
  meaning: string;
  pitchType: PitchTypeLabel;
  pitchPattern: PitchLevel[];
  moraList: string[];
  contrastPair?: PitchContrastPair;
  tip: string;
}

export const PITCH_LEXICON: PitchLexiconEntry[] = [
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
];

export function lookupPitchEntries(query: string): PitchLexiconEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...PITCH_LEXICON];
  return PITCH_LEXICON.filter(
    (e) =>
      e.kanji.includes(q) ||
      e.kana.includes(q) ||
      e.romaji.toLowerCase().includes(q) ||
      e.meaning.toLowerCase().includes(q)
  );
}
