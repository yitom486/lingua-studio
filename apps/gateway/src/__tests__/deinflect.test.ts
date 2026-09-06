import { describe, expect, it, beforeEach } from 'bun:test';
import { isOk } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../infrastructure/drizzle-learner-repository.js';
import { deinflectJa } from '../modules/dictionary/persistence/deinflect.js';

function bases(surface: string): string[] {
  return deinflectJa(surface).map((c) => c.base);
}

describe('deinflectJa（clean-room 活用形还原）', () => {
  it('た形/て形：五段各行 + 一段', () => {
    expect(bases('食べた')).toContain('食べる');
    expect(bases('行った')).toContain('行く');
    expect(bases('書いた')).toContain('書く');
    expect(bases('泳いだ')).toContain('泳ぐ');
    expect(bases('話した')).toContain('話す');
    expect(bases('待った')).toContain('待つ');
    expect(bases('読んだ')).toContain('読む');
    expect(bases('死んだ')).toContain('死ぬ');
    expect(bases('呼んだ')).toContain('呼ぶ');
    expect(bases('買った')).toContain('買う');
    expect(bases('食べて')).toContain('食べる');
  });

  it('ない形/ます形/たい形', () => {
    expect(bases('書かない')).toContain('書く');
    expect(bases('食べない')).toContain('食べる');
    expect(bases('行きました')).toContain('行く');
    expect(bases('食べます')).toContain('食べる');
    expect(bases('食べたい')).toContain('食べる');
    expect(bases('高かった')).toContain('高い');
    expect(bases('高くない')).toContain('高い');
  });

  it('する/来る/ある不规则', () => {
    expect(bases('した')).toContain('する');
    expect(bases('しない')).toContain('する');
    expect(bases('して')).toContain('する');
    expect(bases('きた')).toContain('くる');
    expect(bases('こない')).toContain('くる');
    expect(bases('きました')).toContain('くる');
    expect(bases('ない')).toContain('ある');
  });

  it('受身可能使役/意向命令/条件', () => {
    expect(bases('書かれる')).toContain('書く');
    expect(bases('食べられる')).toContain('食べる');
    expect(bases('書ける')).toContain('書く');
    expect(bases('書けない')).toContain('書く');
    expect(bases('書かせる')).toContain('書く');
    expect(bases('書こう')).toContain('書く');
    expect(bases('書け')).toContain('書く');
    expect(bases('書けば')).toContain('書く');
    expect(bases('書いたら')).toContain('書く');
    expect(bases('書かず')).toContain('書く');
  });

  it('链式：進行体/てください/てしまう缩约', () => {
    const prog = deinflectJa('食べている').map((c) => `${c.base}(${c.note})`);
    expect(prog.some((s) => s.startsWith('食べる('))).toBe(true);
    expect(bases('書いてください')).toContain('書く');
    expect(bases('買っちゃう')).toContain('買う');
  });

  it('原形不返回自身；空输入返回空；候选有上限', () => {
    expect(bases('食べる')).not.toContain('食べる');
    expect(deinflectJa('')).toEqual([]);
    expect(deinflectJa('あ').length).toBeLessThanOrEqual(16);
  });
});

describe('searchLocalDictionary 活用形回退', () => {
  let repo: DrizzleLearnerRepository;
  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
    repo.getRawDb().run('DELETE FROM local_dictionary_entries');
    const now = new Date().toISOString();
    const seed = (id: string, headword: string, reading: string, meanings: string[]) => {
      repo.getRawDb().prepare(`INSERT INTO local_dictionary_entries (
        id, language, headword, reading, romanization, meanings_json,
        pronunciation_json, part_of_speech, source_id, source_label, license_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, 'ja', headword, reading, null, JSON.stringify(meanings), null, null, 'test', 'test', 'test', now
      );
    };
    seed('w_taberu', '食べる', 'たべる', ['吃']);
    seed('w_iku', '行く', 'いく', ['去']);
  });

  it('食べた/行きました命中辞書形并注记', async () => {
    const r1 = await repo.searchLocalDictionary('ja', '食べた');
    expect(isOk(r1)).toBe(true);
    if (!isOk(r1)) return;
    expect(r1.value.length).toBeGreaterThan(0);
    expect(r1.value[0]?.headword).toBe('食べる');
    expect(r1.value[0]?.inflectionNote).toContain('た形');
    const r2 = await repo.searchLocalDictionary('ja', '行きました');
    expect(isOk(r2)).toBe(true);
    if (!isOk(r2)) return;
    expect(r2.value[0]?.headword).toBe('行く');
  });

  it('直击中无注记；非日语不还原；查无返回空', async () => {
    const direct = await repo.searchLocalDictionary('ja', '食べる');
    expect(isOk(direct)).toBe(true);
    if (!isOk(direct)) return;
    expect(direct.value[0]?.inflectionNote).toBeUndefined();
    const en = await repo.searchLocalDictionary('en', 'went');
    expect(isOk(en)).toBe(true);
    if (!isOk(en)) return;
    expect(en.value).toEqual([]);
    const miss = await repo.searchLocalDictionary('ja', '不存在的词xyz');
    expect(isOk(miss)).toBe(true);
    if (!isOk(miss)) return;
    expect(miss.value).toEqual([]);
  });
});
