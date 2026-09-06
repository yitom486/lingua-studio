import { describe, expect, it } from 'bun:test';
import { buildKanaTutorContext } from '../kana-tutor.js';
import type { KanaItem } from '@study-studio/protocol';

const A: KanaItem = {
  id: 'kana_a',
  hiragana: 'あ',
  katakana: 'ア',
  romaji: 'a',
  row: 'あ行',
  col: 'あ段',
  mnemonic: '安字的一半',
  type: 'SEION',
} as KanaItem;

const I: KanaItem = {
  id: 'kana_i',
  hiragana: 'い',
  katakana: 'イ',
  romaji: 'i',
  row: 'あ行',
  col: 'い段',
  type: 'SEION',
} as KanaItem;

describe('buildKanaTutorContext', () => {
  it('builds a memorization prompt with face, romaji and confusables', () => {
    const ctx = buildKanaTutorContext({ kana: A, pool: [A, I] });
    expect(ctx.questionText).toContain('あ');
    expect(ctx.questionText).toContain('a');
    expect(ctx.questionText).toContain('口诀');
    expect(ctx.questionText).toContain('い');
    expect(ctx.correctAnswer).toBe('あ / ア (a)');
    expect(ctx.skillTag).toBe('jp.kana.hiragana');
    expect(ctx.explanation).toContain('安字的一半');
  });

  it('switches face and skill for katakana', () => {
    const ctx = buildKanaTutorContext({ kana: A, pool: [A, I], script: 'KATAKANA' });
    expect(ctx.questionText).toContain('ア');
    expect(ctx.skillTag).toBe('jp.kana.katakana');
  });

  it('asks about the mistake when the drill answer was wrong', () => {
    const ctx = buildKanaTutorContext({ kana: A, pool: [A, I], wasWrong: true, userPick: 'い' });
    expect(ctx.questionText).toContain('认成了「い」');
    expect(ctx.questionText).toContain('为什么错');
    expect(ctx.userAnswer).toBe('い');
  });

  it('never blocks when the pool is empty', () => {
    const ctx = buildKanaTutorContext({ kana: A, pool: [] });
    expect(ctx.questionText).toContain('あ');
    expect(ctx.questionText).not.toContain('undefined');
    expect(ctx.explanation).not.toContain('undefined');
  });
});
