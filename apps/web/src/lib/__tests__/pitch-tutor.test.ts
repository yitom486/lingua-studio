import { describe, expect, it } from 'bun:test';
import { buildPitchTutorContext } from '../pitch-tutor.js';
import type { PitchLexiconItem } from '../../queries/useLearnerQueries.js';

const WORD: PitchLexiconItem = {
  id: 'ame',
  kanji: '雨',
  kana: 'あめ',
  romaji: 'ame',
  meaning: '下雨',
  pitchType: '头高型 (①)',
  pitchPattern: ['H', 'L'],
  moraList: ['あ', 'め'],
  contrastPair: {
    kanji: '飴',
    kana: 'あめ',
    pitchType: '平板型 (⓪)',
    pitchPattern: ['L', 'H'],
    meaning: '糖果',
  },
  tip: '第一拍高，第二拍立刻坠下。',
};

describe('buildPitchTutorContext', () => {
  it('builds a pitch-teaching prompt with mora walk and minimal pair', () => {
    const ctx = buildPitchTutorContext(WORD);
    expect(ctx.questionText).toContain('雨');
    expect(ctx.questionText).toContain('あ・め');
    expect(ctx.questionText).toContain('飴');
    expect(ctx.questionText).toContain('怎么一眼听出区别');
    expect(ctx.correctAnswer).toContain('头高型 (①)');
    expect(ctx.skillTag).toBe('jp.pitch.accent');
    expect(ctx.explanation).toContain('第一拍高');
  });

  it('degrades gracefully without a contrast pair', () => {
    const { contrastPair: _dropped, ...rest } = WORD;
    const ctx = buildPitchTutorContext(rest);
    expect(ctx.questionText).toContain('最容易读错');
    expect(ctx.questionText).not.toContain('undefined');
    expect(ctx.explanation).not.toContain('undefined');
  });
});
