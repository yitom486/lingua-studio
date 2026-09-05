import { describe, expect, it } from 'bun:test';
import { confusionDistractors, voicingVariants } from '../kana-confusion.js';
import type { KanaItem } from '@study-studio/protocol';

function makeKana(
  id: string,
  hiragana: string,
  katakana: string,
  romaji: string,
  row: string,
  col: string
): KanaItem {
  return { id, type: 'SEION', hiragana, katakana, romaji, row, col, audioText: hiragana, sortOrder: 0 };
}

const POOL: KanaItem[] = [
  makeKana('k_shi', 'し', 'シ', 'shi', 'さ行', 'い段'),
  makeKana('k_sha', 'しゃ', 'シャ', 'sha', 'し拗音', 'あ段'),
  makeKana('k_shu', 'しゅ', 'シュ', 'shu', 'し拗音', 'う段'),
  makeKana('k_sho', 'しょ', 'ショ', 'sho', 'し拗音', 'お段'),
  makeKana('k_ji', 'じ', 'ジ', 'ji', 'ざ行', 'い段'),
  makeKana('k_de', 'で', 'デ', 'de', 'だ行', 'え段'),
  makeKana('k_pa', 'ぱ', 'パ', 'pa', 'ぱ行', 'あ段'),
  makeKana('k_ha', 'は', 'ハ', 'ha', 'は行', 'あ段'),
  makeKana('k_ba', 'ば', 'バ', 'ba', 'ば行', 'あ段'),
  makeKana('k_su', 'す', 'ス', 'su', 'さ行', 'う段'),
];

describe('voicingVariants', () => {
  it('produces dakuten/handakuten counterparts within kana blocks', () => {
    expect(voicingVariants('は')).toContain('ば');
    expect(voicingVariants('は')).toContain('ぱ');
    expect(voicingVariants('し')).toContain('じ');
    expect(voicingVariants('ア')).toContain('ァ');
  });

  it('returns empty for non-kana', () => {
    expect(voicingVariants('A')).toEqual([]);
    expect(voicingVariants('')).toEqual([]);
  });
});

describe('confusionDistractors', () => {
  it('prefers same-row items (しゅ → しゃ/しょ)', () => {
    const target = POOL.find((k) => k.id === 'k_shu')!;
    const got = confusionDistractors(target, POOL, 'HIRAGANA', 3);
    expect(got).not.toContain('しゅ');
    expect(got.slice(0, 2)).toEqual(expect.arrayContaining(['しゃ', 'しょ']));
    expect(got.length).toBe(3);
  });

  it('includes voicing counterparts (は → ば/ぱ)', () => {
    const target = POOL.find((k) => k.id === 'k_ha')!;
    const got = confusionDistractors(target, POOL, 'HIRAGANA', 4);
    expect(got).toContain('ば');
    expect(got).toContain('ぱ');
  });

  it('respects katakana script', () => {
    const target = POOL.find((k) => k.id === 'k_shu')!;
    const got = confusionDistractors(target, POOL, 'KATAKANA', 2);
    expect(got).toEqual(expect.arrayContaining(['シャ', 'ショ']));
    expect(got.every((g) => /[\u30A0-\u30FF]/.test(g[0] ?? ''))).toBe(true);
  });

  it('never invents options outside the pool', () => {
    const tiny = POOL.slice(0, 2);
    const got = confusionDistractors(tiny[0]!, tiny, 'HIRAGANA', 3);
    expect(got.length).toBeLessThanOrEqual(1);
    expect(got.every((g) => g === 'し' || g === 'しゃ')).toBe(true);
  });
});
