import { describe, expect, it, beforeEach } from 'bun:test';
import { isOk } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../infrastructure/drizzle-learner-repository.js';
import { deinflectKo } from '../modules/dictionary/persistence/ko-deinflect.js';
import { decomposeSyllable, composeSyllable } from '../modules/dictionary/persistence/hangul.js';

function bases(surface: string): string[] {
  return deinflectKo(surface).map((c) => c.base);
}

describe('hangul 谚文分解合成（公开算法）', () => {
  it('分解合成往返（含复终声）', () => {
    expect(decomposeSyllable('한')).toEqual({ cho: 'ㅎ', jung: 'ㅏ', jong: 'ㄴ', raw: '한' });
    expect(decomposeSyllable('닭')).toEqual({ cho: 'ㄷ', jung: 'ㅏ', jong: 'ㄺ', raw: '닭' });
    expect(decomposeSyllable('값')).toEqual({ cho: 'ㄱ', jung: 'ㅏ', jong: 'ㅄ', raw: '값' });
    expect(composeSyllable('ㅊ', 'ㅜ', 'ㅂ')).toBe('춥');
    expect(composeSyllable('ㄹ', 'ㅡ', '')).toBe('르');
    expect(decomposeSyllable('A')).toBeNull();
    expect(composeSyllable('ㅊ', 'X', '')).toBe('');
  });
});

describe('deinflectKo 规则词尾', () => {
  it('해요体/합니다体/过去时', () => {
    expect(bases('가요')).toContain('가다');
    expect(bases('먹어요')).toContain('먹다');
    expect(bases('해요')).toContain('하다');
    expect(bases('갑니다')).toContain('가다');
    expect(bases('먹습니다')).toContain('먹다');
    expect(bases('갔다')).toContain('가다');
    expect(bases('먹었다')).toContain('먹다');
    expect(bases('했습니다')).toContain('하다');
    expect(bases('갔어요')).toContain('가다');
  });

  it('系动词/缩约/连接定语', () => {
    expect(bases('이에요')).toContain('이다');
    expect(bases('입니다')).toContain('이다');
    expect(bases('이었다')).toContain('이다');
    expect(bases('와요')).toContain('오다');
    expect(bases('봤어요')).toContain('보다');
    expect(bases('가고')).toContain('가다');
    expect(bases('가면')).toContain('가다');
    expect(bases('가는')).toContain('가다');
    expect(bases('가세요')).toContain('가다');
    expect(bases('가자')).toContain('가다');
  });

  it('否定前缀链式', () => {
    expect(bases('안 먹어요')).toContain('먹다');
    expect(bases('가지 않아요')).toContain('가다');
  });

  it('不规则 7 式', () => {
    expect(bases('추워요')).toContain('춥다');
    expect(bases('고마워요')).toContain('고맙다');
    expect(bases('예뻐요')).toContain('예쁘다');
    expect(bases('들어요')).toContain('듣다');
    expect(bases('지어요')).toContain('짓다');
    expect(bases('몰라요')).toContain('모르다');
    expect(bases('커요')).toContain('크다');
    expect(bases('노래요')).toContain('노랗다');
  });

  it('原形不返回自身；空输入返回空；候选有上限；双词性', () => {
    expect(bases('가다')).not.toContain('가다');
    expect(deinflectKo('')).toEqual([]);
    expect(deinflectKo('가').length).toBeLessThanOrEqual(24);
    const cands = deinflectKo('먹어요').filter((c) => c.base === '먹다');
    expect(cands.some((c) => c.pos === 'verb')).toBe(true);
    expect(cands.some((c) => c.pos === 'adjective')).toBe(true);
  });
});

describe('searchLocalDictionary 韩语回退', () => {
  let repo: DrizzleLearnerRepository;
  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
    repo.getRawDb().run('DELETE FROM local_dictionary_entries');
    const now = new Date().toISOString();
    const seed = (id: string, headword: string, meanings: string[], partOfSpeech?: string) => {
      repo.getRawDb().prepare(`INSERT INTO local_dictionary_entries (
        id, language, headword, reading, romanization, meanings_json,
        pronunciation_json, part_of_speech, source_id, source_label, license_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, 'ko', headword, null, null, JSON.stringify(meanings), null, partOfSpeech ?? null, 'test', 'test', 'test', now
      );
    };
    seed('w_muk', '먹다', ['吃'], '动词');
    seed('w_chup', '춥다', ['冷'], '形容词');
    seed('w_bae_n', '배', ['梨/肚子'], '名词');
    seed('w_baeda', '배다', ['浸透'], '动词');
    seed('w_ilhada', '일하다', ['工作'], '动词');
  });

  it('먹었어요→먹다（注记含过去时）；추워요→춥다', async () => {
    const r1 = await repo.searchLocalDictionary('ko', '먹었어요');
    expect(isOk(r1)).toBe(true);
    if (!isOk(r1)) return;
    expect(r1.value.length).toBeGreaterThan(0);
    expect(r1.value[0]?.headword).toBe('먹다');
    expect(r1.value[0]?.inflectionNote).toContain('过去时');
    const r2 = await repo.searchLocalDictionary('ko', '추워요');
    expect(isOk(r2)).toBe(true);
    if (!isOk(r2)) return;
    expect(r2.value[0]?.headword).toBe('춥다');
    expect(r2.value[0]?.inflectionNote).toContain('不规则');
  });

  it('缩约链：일해요→일하다', async () => {
    const r = await repo.searchLocalDictionary('ko', '일해요');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.some((e) => e.id === 'w_ilhada')).toBe(true);
  });

  it('名词误命中注记：안 배→배（动词路径不适用，注记存疑但保留）', async () => {
    // 排序代码与 ja 共用（かく对照已覆盖顺序）；此处验证 ko 名词误命中同样注记而不丢失。
    const r = await repo.searchLocalDictionary('ko', '안 배');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const noun = r.value.find((e) => e.id === 'w_bae_n');
    expect(noun).toBeDefined();
    expect(noun?.inflectionNote).toContain('仅供参考');
  });
});
