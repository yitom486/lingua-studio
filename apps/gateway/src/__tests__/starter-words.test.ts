import { describe, expect, it, beforeEach } from 'bun:test';
import { DrizzleLearnerRepository } from '../infrastructure/drizzle-learner-repository.js';
import { LearningContentTool } from '../transport/tools/learning-content-tool.js';
import { STARTER_WORD_SEEDS } from '../infrastructure/db/seeds/starter-words-seed.js';
import { isOk } from '@study-studio/shared';

describe('starter word pack (out-of-box vocabulary)', () => {
  let repo: DrizzleLearnerRepository;
  let tool: LearningContentTool;

  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
    tool = new LearningContentTool(repo);
  });

  it('seeds 24 ja + 24 ko + 24 en starter words with traceable source', () => {
    expect(STARTER_WORD_SEEDS.filter((w) => w.language === 'ja').length).toBe(24);
    expect(STARTER_WORD_SEEDS.filter((w) => w.language === 'ko').length).toBe(24);
    expect(STARTER_WORD_SEEDS.filter((w) => w.language === 'en').length).toBe(24);
    const jaCount = repo
      .getRawDb()
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM local_dictionary_entries WHERE id LIKE 'starter_ja_%'"
      )
      .get()?.count;
    const koCount = repo
      .getRawDb()
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM local_dictionary_entries WHERE id LIKE 'starter_ko_%'"
      )
      .get()?.count;
    expect(jaCount).toBe(24);
    expect(koCount).toBe(24);
    const enCount = repo
      .getRawDb()
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM local_dictionary_entries WHERE id LIKE 'starter_en_%'"
      )
      .get()?.count;
    expect(enCount).toBe(24);
  });

  it('en starter words are lookable out of the box（入门可查可收）', async () => {
    const res = await repo.searchLocalDictionary('en', 'water');
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.some((e) => e.id === 'starter_en_water')).toBe(true);
    const collected = await repo.collectDictionaryEntry('u_starter_en', 'starter_en_water');
    expect(isOk(collected)).toBe(true);
  });

  it('powers kana word drills without any installed package', async () => {
    const res = await tool.execute(
      { action: 'generate_kana_words', count: 5, language: 'ja' },
      { userId: 'u_starter_01', sessionId: 's1' }
    );
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.kanaWords?.length).toBeGreaterThan(0);
    // 新库同池还有 pitch 基准词：不断言全部来自开箱包，只断言开箱词可被抽中且全体合法
    expect(res.value.kanaWords?.some((w) => w.entryId.startsWith('starter_ja_'))).toBe(true);
    for (const w of res.value.kanaWords ?? []) {
      expect(w.kana).toMatch(/^[\u3040-\u30FFー・\s]+$/);
      expect(w.meanings.length).toBeGreaterThan(0);
    }
  });

  it('powers hangul word drills without any installed package', async () => {
    const res = await tool.execute(
      { action: 'generate_hangul_words', count: 5, language: 'ko' },
      { userId: 'u_starter_01', sessionId: 's1' }
    );
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.hangulWords?.length).toBeGreaterThan(0);
    for (const w of res.value.hangulWords ?? []) {
      expect(w.entryId.startsWith('starter_ko_')).toBe(true);
      expect(w.sourceLabel).toBe('开箱词包');
    }
  });
});
