import { describe, expect, it, beforeEach } from 'bun:test';
import { isOk } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../infrastructure/drizzle-learner-repository.js';

function seedEntry(
  repo: DrizzleLearnerRepository,
  row: { id: string; headword: string; reading?: string; meanings: string[]; sourceId?: string }
) {
  repo
    .getRawDb()
    .prepare(
      `INSERT INTO local_dictionary_entries (
        id, language, headword, reading, romanization, meanings_json,
        pronunciation_json, part_of_speech, source_id, source_label, license_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      'ja',
      row.headword,
      row.reading ?? null,
      null,
      JSON.stringify(row.meanings),
      null,
      null,
      row.sourceId ?? 'seed',
      'seed',
      'seed',
      new Date().toISOString()
    );
}

function seedSource(
  repo: DrizzleLearnerRepository,
  row: { id: string; enabled?: number; priority?: number }
) {
  repo
    .getRawDb()
    .prepare(
      `INSERT INTO dictionary_sources (
        id, language, provider, version, source_url, license_name, license_url,
        attribution, entry_count, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      'ja',
      'test',
      't1',
      'https://example.com',
      'test',
      'https://example.com',
      'test',
      1,
      new Date().toISOString()
    );
  if (row.enabled !== undefined || row.priority !== undefined) {
    const sets: string[] = [];
    const args: Array<string | number> = [];
    if (row.enabled !== undefined) {
      sets.push('enabled = ?');
      args.push(row.enabled);
    }
    if (row.priority !== undefined) {
      sets.push('priority = ?');
      args.push(row.priority);
    }
    args.push(row.id);
    repo.getRawDb().prepare(`UPDATE dictionary_sources SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  }
}

function seedFreq(
  repo: DrizzleLearnerRepository,
  row: { term: string; reading: string; frequency: number; source?: string }
) {
  repo
    .getRawDb()
    .prepare(
      `INSERT INTO dictionary_term_meta (term, reading, language, pitch_json, freq_json, freq_value, source_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.term,
      row.reading,
      'ja',
      null,
      JSON.stringify({ reading: row.reading, frequency: row.frequency }),
      row.frequency,
      row.source ?? 'freq-src',
      new Date().toISOString()
    );
}

describe('查词排序：词频升序 + 来源优先级', () => {
  let repo: DrizzleLearnerRepository;
  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
    repo.getRawDb().run('DELETE FROM local_dictionary_entries');
    seedEntry(repo, { id: 'w_rare', headword: '稀有词', reading: 'けう', meanings: ['rare'] });
    seedEntry(repo, { id: 'w_common', headword: '稀有词X', reading: 'けう', meanings: ['rare-ish'] });
  });

  it('无词频时保序；有词频常用在前并带 frequency', async () => {
    seedFreq(repo, { term: '稀有词X', reading: 'けう', frequency: 50 });
    seedFreq(repo, { term: '稀有词', reading: 'けう', frequency: 90000 });
    const res = await repo.searchLocalDictionary('ja', '稀有');
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.map((e) => e.headword)).toEqual(['稀有词X', '稀有词']);
    expect(res.value[0]?.frequency).toBe(50);
  });

  it('来源优先级高者在前', async () => {
    seedSource(repo, { id: 's-low' });
    seedSource(repo, { id: 's-high', priority: 10 });
    seedEntry(repo, { id: 's-low:w', headword: '優先語', reading: 'ゆう', meanings: ['low'], sourceId: 's-low' });
    seedEntry(repo, { id: 's-high:w', headword: '優先語', reading: 'ゆう', meanings: ['high'], sourceId: 's-high' });
    const res = await repo.searchLocalDictionary('ja', '優先語');
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value[0]?.id).toBe('s-high:w');
  });

  it('禁用来源被过滤；未登记来源保留', async () => {
    seedSource(repo, { id: 's-off', enabled: 0 });
    seedEntry(repo, { id: 's-off:w', headword: '禁語', reading: 'きん', meanings: ['off'], sourceId: 's-off' });
    const res = await repo.searchLocalDictionary('ja', '禁語');
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.map((e) => e.id)).not.toContain('s-off:w');
    // 未登记来源不受影响
    const seed = await repo.searchLocalDictionary('ja', '稀有词');
    expect(isOk(seed)).toBe(true);
    if (!isOk(seed)) return;
    expect(seed.value.length).toBeGreaterThan(0);
  });
});

describe('updateDictionarySourceConfig', () => {
  let repo: DrizzleLearnerRepository;
  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
    seedSource(repo, { id: 's-cfg' });
  });

  it('开关与权重更新并回显', async () => {
    const r1 = await repo.updateDictionarySourceConfig('s-cfg', { enabled: false });
    expect(isOk(r1)).toBe(true);
    if (!isOk(r1)) return;
    expect(r1.value).toEqual({ id: 's-cfg', enabled: false, priority: 0 });
    const r2 = await repo.updateDictionarySourceConfig('s-cfg', { priority: 7 });
    expect(isOk(r2)).toBe(true);
    if (!isOk(r2)) return;
    expect(r2.value.priority).toBe(7);
  });

  it('未知 id / 非法值拒绝', async () => {
    expect(isOk(await repo.updateDictionarySourceConfig('nope', { enabled: true }))).toBe(false);
    expect(isOk(await repo.updateDictionarySourceConfig('s-cfg', {}))).toBe(false);
    expect(isOk(await repo.updateDictionarySourceConfig('s-cfg', { priority: -1 }))).toBe(false);
    expect(isOk(await repo.updateDictionarySourceConfig('s-cfg', { priority: 1000 }))).toBe(false);
  });
});
