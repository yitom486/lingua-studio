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

  it('候选带跳数与表层词性（た形动词/形容词/だ系其他）', () => {
    const tabeta = deinflectJa('食べた').find((c) => c.base === '食べる');
    expect(tabeta?.depth).toBe(1);
    expect(tabeta?.pos).toBe('verb');
    const takakatta = deinflectJa('高かった').find((c) => c.base === '高い');
    expect(takakatta?.pos).toBe('adjective');
    const datta = deinflectJa('だった').find((c) => c.base === 'だ');
    expect(datta?.pos).toBe('other');
    // 链条首跳决定表层词性：食べさせられた（受身链）仍是动词
    const chain = deinflectJa('食べさせられた').find((c) => c.base === '食べる');
    expect(chain?.pos).toBe('verb');
    expect(chain && chain.depth > 1).toBe(true);
  });
});

describe('searchLocalDictionary 活用形回退', () => {
  let repo: DrizzleLearnerRepository;
  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
    repo.getRawDb().run('DELETE FROM local_dictionary_entries');
    const now = new Date().toISOString();
    const seed = (id: string, headword: string, reading: string, meanings: string[], partOfSpeech?: string, language = 'ja') => {
      repo.getRawDb().prepare(`INSERT INTO local_dictionary_entries (
        id, language, headword, reading, romanization, meanings_json,
        pronunciation_json, part_of_speech, source_id, source_label, license_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, language, headword, reading, null, JSON.stringify(meanings), null, partOfSpeech ?? null, 'test', 'test', 'test', now
      );
    };
    seed('w_taberu', '食べる', 'たべる', ['吃'], '一段动词');
    seed('w_iku', '行く', 'いく', ['去'], '五段·カ行');
    // 同形异词性：かく（动词 書く/名词）——验词性加分排序
    seed('w_kaku_v', 'かく', 'かく', ['写'], '五段·カ行');
    seed('w_kaku_n', 'かく', 'かく', ['每/各（接头）'], '名词');
    seed('w_run', 'run', 'run', ['跑'], 'v', 'en');
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

  it('直击中无注记；非日语不还原；查无返回空', async () => {    const direct = await repo.searchLocalDictionary('ja', '食べる');
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

  it('词性一致优先：かかない→かく（动词在前，名词注记存疑）', async () => {
    const r = await repo.searchLocalDictionary('ja', 'かかない');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.length).toBe(2);
    expect(r.value[0]?.id).toBe('w_kaku_v');
    expect(r.value[0]?.inflectionNote).toContain('ない形');
    expect(r.value[0]?.inflectionNote).toContain('动词');
    expect(r.value[0]?.inflectionNote?.includes('仅供参考') ?? false).toBe(false);
    expect(r.value[1]?.id).toBe('w_kaku_n');
    expect(r.value[1]?.inflectionNote).toContain('仅供参考');
  });

  it('英语还原：runs→run（三单注记，词性一致不存疑）', async () => {
    const r = await repo.searchLocalDictionary('en', 'runs');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.length).toBeGreaterThan(0);
    expect(r.value[0]?.headword).toBe('run');
    expect(r.value[0]?.inflectionNote).toContain('还原为');
    // run 词条词性 v=动词，与三单·动词候选一致 → 排首且不标存疑
    expect(r.value[0]?.inflectionNote).toContain('三单');
    expect(r.value[0]?.inflectionNote?.includes('仅供参考') ?? false).toBe(false);
  });
});
