import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { isOk } from '@study-studio/shared';
import {
  backfillPitchPronunciation,
  listDictionaryPackages,
} from '../modules/dictionary/application/dictionary-packages.js';
import {
  installYomitanFromBytes,
  parseYomitanDictionary,
  pitchPositionsLabel,
  slugifyTitle,
  type YomitanInstallMeta,
} from '../modules/dictionary/application/yomitan.js';
import { initSchema } from '../infrastructure/db/index.js';

function memDb(): Database {
  const sqlite = new Database(':memory:');
  initSchema(sqlite);
  return sqlite;
}

// ---------- 最小 stored-zip 构造器（无压缩，单测自包含） ----------
function buildStoredZip(files: Array<{ name: string; content: string }>): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const push = (u: Uint8Array) => chunks.push(u);
  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
  const concat = (parts: Uint8Array[]) => {
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = enc.encode(f.content);
    const lh = concat([
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(dataBytes.length),
      u32(dataBytes.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    push(lh);
    push(dataBytes);
    central.push(
      concat([
        new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(dataBytes.length),
        u32(dataBytes.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ])
    );
    offset += lh.length + dataBytes.length;
  }
  const centralDir = concat(central);
  const centralStart = offset;
  push(centralDir);
  const eocd = concat([
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(centralStart),
    u16(0),
  ]);
  push(eocd);
  return concat(chunks);
}

const MINI_INDEX = JSON.stringify({ title: 'MiniTest', format: 3, revision: 't1' });
const MINI_TERMS = JSON.stringify([
  ['雨', 'あめ', 'n', '', 0, ['rain', { type: 'text', text: ' precipitation' }], 1, 'n'],
  ['食べる', 'たべる', 'v1 vt', '', 0, [{ type: 'structured-content', content: ['to eat', { tag: 'x', content: ['food'] }] }], 2, 'v1 vt'],
  ['画像', 'がぞう', 'n', '', 0, [{ type: 'image', path: 'a.webp', width: 1, height: 1 }], 3, 'n'],
  ['空', '', '', '', 0, [], 4, ''],
]);
const MINI_META = JSON.stringify([
  ['雨', 'pitch', { reading: 'あめ', pitches: [{ position: 1 }] }],
  ['食べる', 'pitch', { reading: 'たべる', pitches: [{ position: 0 }] }],
  ['雨', 'freq', { reading: 'あめ', frequency: 5 }],
]);
const MINI_KANJI = JSON.stringify([['雨', 'ウ', 'あめ あま', 'n', ['rain']]]);

function miniZip(): Uint8Array {
  return buildStoredZip([
    { name: 'index.json', content: MINI_INDEX },
    { name: 'term_bank_1.json', content: MINI_TERMS },
    { name: 'term_meta_bank_1.json', content: MINI_META },
    { name: 'kanji_bank_1.json', content: MINI_KANJI },
  ]);
}

describe('yomitan bank v3 解析（clean-room）', () => {
  it('解析词条/读音/词性/释义/声调/汉字，跳过纯图片词条', async () => {
    const { extractZip } = await import(
      '../modules/library/application/pdf-import/archive.js'
    );
    // 注：跨模块引用已在 module-boundaries allowlist 登记（复用解包器）
    const files = extractZip(miniZip()).map((e) => ({ path: e.path, data: e.data }));
    const parsed = parseYomitanDictionary(files, 'yt');
    expect(parsed.index.title).toBe('MiniTest');
    expect(parsed.entries.map((e) => e.headword)).toEqual(['雨', '食べる', '雨']);
    const ame = parsed.entries.find((e) => e.headword === '雨' && e.reading === 'あめ');
    expect(ame?.meanings).toEqual(['rain', 'precipitation']);
    expect(ame?.partOfSpeech).toBe('名词');
    const taberu = parsed.entries.find((e) => e.headword === '食べる');
    // 相邻文本节点各自成义（不臆造拼接）
    expect(taberu?.meanings).toEqual(['to eat', 'food']);
    expect(taberu?.partOfSpeech).toBe('一段动词');
    // 声调走覆盖行（安装时回填），解析阶段只出 pitchRows
    const amePitch = parsed.pitchRows.find((r) => r.term === '雨');
    expect(JSON.parse(amePitch!.pitchJson)).toMatchObject({ pitch: { label: '①' } });
    expect(parsed.stats.pitchMeta).toBe(2);
    expect(parsed.stats.freqMeta).toBe(1);
    expect(parsed.stats.mediaSkipped).toBe(1);
    expect(parsed.stats.kanji).toBe(1);
    const kanji = parsed.entries.find((e) => e.headword === '雨' && e.partOfSpeech === 'kanji');
    expect(kanji?.meanings).toEqual(['rain']);
  });

  it('拒绝非 v3 / 缺 index / 坏 bank', () => {
    const files = (name: string, content: string) => [{ path: name, data: new TextEncoder().encode(content) }];
    expect(() =>
      parseYomitanDictionary(files('index.json', JSON.stringify({ title: 'x', format: 2, revision: 'r' })), 'yt')
    ).toThrow();
    expect(() => parseYomitanDictionary([], 'yt')).toThrow();
    expect(() =>
      parseYomitanDictionary(files('index.json', MINI_INDEX).concat([{ path: 'term_bank_1.json', data: new TextEncoder().encode('{{{') }]), 'yt')
    ).toThrow();
  });

  it('pitchPositionsLabel：0→⓪，超范围保留数字', () => {
    expect(pitchPositionsLabel([0])).toBe('⓪');
    expect(pitchPositionsLabel([1, 3])).toBe('①/③');
    expect(pitchPositionsLabel([])).toBe('？');
    expect(slugifyTitle('Kanjium Pitch Accents')).toBe('kanjium-pitch-accents');
  });
});

describe('yomitan 安装（事务替换 + 声调回填）', () => {
  const meta: YomitanInstallMeta = {
    id: 'yomitan-custom-minitest',
    language: 'ja',
    provider: 'MiniTest',
    version: 't1',
    sourceUrl: 'local-file',
    licenseName: 'test',
    licenseUrl: '',
    attribution: 'test',
    minEntryCount: 1,
  };

  it('词条入库 + 声调回填 pronunciation_json', async () => {
    const sqlite = memDb();
    const res = await installYomitanFromBytes(sqlite, meta, miniZip());
    expect(isOk(res)).toBe(true);
    const rows = sqlite
      .query<{ headword: string; pronunciation_json: string | null }, []>(
        'SELECT headword, pronunciation_json FROM local_dictionary_entries ORDER BY headword'
      )
      .all();
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const ame = rows.find((r) => r.headword === '雨' && r.pronunciation_json);
    expect(ame).toBeDefined();
    expect(JSON.parse(ame!.pronunciation_json as string)).toMatchObject({ pitch: { label: '①' } });
    // 自定义包不在 catalog：断言安装返回值（entryCount 来自 sources 行）
    const pkgs = listDictionaryPackages(sqlite);
    expect(pkgs.find((p) => p.id === meta.id)).toBeUndefined();
  });

  it('自定义安装返回值携带 entryCount', async () => {
    const sqlite = memDb();
    const res = await installYomitanFromBytes(sqlite, meta, miniZip());
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.installed).toBe(true);
    expect(res.value.entryCount).toBeGreaterThanOrEqual(3);
  });

  it('meta-only 包：无词条时按声调行计数并回填已有词条', async () => {    const sqlite = memDb();
    sqlite.prepare(`INSERT INTO local_dictionary_entries (
      id, language, headword, reading, romanization, meanings_json,
      pronunciation_json, part_of_speech, source_id, source_label, license_note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'seed-ame', 'ja', '雨', 'あめ', null, JSON.stringify(['下雨']), null, null, 'seed', 'seed', 'seed', new Date().toISOString()
    );
    const metaOnly = buildStoredZip([
      { name: 'index.json', content: JSON.stringify({ title: 'MetaOnly', format: 3, revision: 'm1' }) },
      {
        name: 'term_meta_bank_1.json',
        content: JSON.stringify([['雨', 'pitch', { reading: 'あめ', pitches: [{ position: 2 }] }]]),
      },
    ]);
    const res = await installYomitanFromBytes(sqlite, { ...meta, id: 'yomitan-meta-only', minEntryCount: 1 }, metaOnly);
    expect(isOk(res)).toBe(true);
    const row = sqlite
      .query<{ pronunciation_json: string }, []>(
        "SELECT pronunciation_json FROM local_dictionary_entries WHERE id = 'seed-ame'"
      )
      .get();
    expect(JSON.parse(row!.pronunciation_json)).toMatchObject({ pitch: { label: '②' } });
  });

  it('重复安装幂等（包内重复键/reinstall 不抛唯一约束）', async () => {
    const sqlite = memDb();
    const first = await installYomitanFromBytes(sqlite, meta, miniZip());
    expect(isOk(first)).toBe(true);
    const second = await installYomitanFromBytes(sqlite, meta, miniZip());
    expect(isOk(second)).toBe(true);
  });

  it('backfill 不覆盖已有发音、不猜读音', () => {    const sqlite = memDb();
    const now = new Date().toISOString();
    sqlite.prepare(`INSERT INTO local_dictionary_entries (
      id, language, headword, reading, romanization, meanings_json,
      pronunciation_json, part_of_speech, source_id, source_label, license_note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'w1', 'ja', '橋', 'はし', null, JSON.stringify(['桥']), JSON.stringify({ ipa: 'x' }), null, 's', 's', 's', now
    );
    sqlite.prepare(`INSERT INTO local_dictionary_entries (
      id, language, headword, reading, romanization, meanings_json,
      pronunciation_json, part_of_speech, source_id, source_label, license_note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'w2', 'ja', '橋', 'はし', null, JSON.stringify(['桥']), null, null, 's', 's', 's', now
    );
    sqlite.prepare(`INSERT INTO dictionary_term_meta (term, reading, language, pitch_json, source_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run('橋', 'はし', 'ja', JSON.stringify({ label: '②' }), 'm', now);
    const n = backfillPitchPronunciation(sqlite, 'ja');
    expect(n).toBe(1);
    const kept = sqlite
      .query<{ pronunciation_json: string }, []>(
        "SELECT pronunciation_json FROM local_dictionary_entries WHERE id = 'w1'"
      )
      .get();
    expect(JSON.parse(kept!.pronunciation_json)).toEqual({ ipa: 'x' });
  });
});

describe('Kanjium 真包（live，网络可达时）', () => {
  it('下载并解析：12 万+ 声调行，meta-only', async () => {
    let zipBytes: Uint8Array;
    try {
      const response = await fetch(
        'https://raw.githubusercontent.com/yomidevs/yomitan/dictionaries/kanjium_pitch_accents.zip'
      );
      if (!response.ok) {
        console.warn('[yomitan-test] Kanjium 下载失败，跳过 live 断言');
        return;
      }
      zipBytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      console.warn('[yomitan-test] 无网络，跳过 live 断言');
      return;
    }
    const { extractZip } = await import('../modules/library/application/pdf-import/archive.js');
    const files = extractZip(zipBytes).map((e) => ({ path: e.path, data: e.data }));
    const parsed = parseYomitanDictionary(files, 'yt');
    expect(parsed.index.format).toBe(3);
    expect(parsed.entries).toHaveLength(0);
    expect(parsed.pitchRows.length).toBeGreaterThan(100_000);
    // 抽查：時（とき）应有声调
    const toki = parsed.pitchRows.filter((r) => r.term === '時');
    expect(toki.length).toBeGreaterThan(0);
  }, 120000);
});
