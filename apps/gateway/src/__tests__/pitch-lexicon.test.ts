import { describe, expect, it } from 'bun:test';
import {
  PITCH_LEXICON,
  extractPitchQueryTokens,
  lookupPitchEntries,
  tryPitchLexiconCoachReply,
} from '../db/seeds/pitch-seed.js';

describe('pitch lexicon coach', () => {
  it('has at least 10 benchmark entries', () => {
    expect(PITCH_LEXICON.length).toBeGreaterThanOrEqual(10);
  });

  it('looks up classic minimal pairs by kanji', () => {
    const rain = lookupPitchEntries('雨');
    expect(rain.some((e) => e.id === 'p1')).toBe(true);
    const flower = lookupPitchEntries('花');
    expect(flower.some((e) => e.kanji === '花')).toBe(true);
  });

  it('extracts quoted and kana tokens from a natural prompt', () => {
    const tokens = extractPitchQueryTokens('「橋」と はし の声调怎么读？');
    expect(tokens).toContain('橋');
    expect(tokens).toContain('はし');
  });

  it('formats a curriculum-backed reply for pitch questions', () => {
    const reply = tryPitchLexiconCoachReply('「雨」的声调怎么读？');
    expect(reply).toBeTruthy();
    expect(reply!).toContain('课程声调词表');
    expect(reply!).toContain('雨');
    expect(reply!).toContain('头高型');
  });

  it('returns null for non-pitch prompts', () => {
    expect(tryPitchLexiconCoachReply('今天天气怎么样')).toBeNull();
  });
});
