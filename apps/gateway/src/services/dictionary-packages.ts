import type { Database } from 'bun:sqlite';
import {
  BusinessError,
  err,
  ok,
  type Result,
  translateToBusinessError,
} from '@study-studio/shared';

// ---------------------------------------------------------------------------
// P3-A：词典包 manifest/catalog（受类型约束的包元数据目录）
// 每个包声明来源、版本、许可证、署名与解析器种类；安装按 id 派发到对应安装器。
// 包本体不随应用预装，状态只以 SQLite 的 dictionary_sources 记录为准。
// ---------------------------------------------------------------------------

export const OEWN_2025_URL = 'https://en-word.net/static/english-wordnet-2025.xml.gz';
export const OEWN_2025_SOURCE_ID = 'oewn-2025';
export const JMDICT_E_URL = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz';
export const JMDICT_E_SOURCE_ID = 'jmdict-e';
export const KENGDIC_URL =
  'https://raw.githubusercontent.com/garfieldnate/kengdic/master/kengdic.tsv';
export const KENGDIC_SOURCE_ID = 'kengdic-2021';

/** 解析器种类：决定 installDictionaryPackage 调用哪个安装器 */
export type DictionaryPackageParser = 'oewn-xml' | 'jmdict-xml' | 'kengdic-tsv';

/** 受类型约束的包元数据 manifest */
export interface DictionaryPackageManifest {
  id: string;
  language: 'en' | 'ja' | 'ko';
  provider: string;
  version: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  attribution: string;
  description: string;
  parser: DictionaryPackageParser;
  /** 最小条目数校验：低于此值视为包损坏，取消安装 */
  minEntryCount: number;
  /** 是否已实现安装器；false 时仅 manifest 登记，install 返回友好错误 */
  installerReady: boolean;
}

/** 词典包目录：所有可安装包的权威 manifest 列表 */
export const DICTIONARY_PACKAGE_CATALOG: DictionaryPackageManifest[] = [
  {
    id: OEWN_2025_SOURCE_ID,
    language: 'en',
    provider: 'Open English WordNet',
    version: '2025',
    sourceUrl: OEWN_2025_URL,
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution:
      'Contains data from Open English WordNet 2025 (CC BY 4.0) and Princeton WordNet; attribution is required.',
    description: '通用英语离线释义词典。安装后词条保存在本机 SQLite，可离线检索。',
    parser: 'oewn-xml',
    minEntryCount: 100_000,
    installerReady: true,
  },
  {
    id: JMDICT_E_SOURCE_ID,
    language: 'ja',
    provider: 'JMdict/EDICT (EDRDG, Jim Breen)',
    version: 'daily',
    sourceUrl: JMDICT_E_URL,
    licenseName: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attribution:
      'Contains data from JMdict/EDICT (CC BY-SA 4.0), © James William Breen and the EDRDG. See https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
    description:
      '日语-英语离线词典（EDRDG JMdict_e）。manifest 已登记；XML 解析器待实现（2026-05 起 NG 版并行分发中，暂用 legacy 稳定版）。',
    parser: 'jmdict-xml',
    minEntryCount: 100_000,
    installerReady: false,
  },
  {
    id: KENGDIC_SOURCE_ID,
    language: 'ko',
    provider: 'Kengdic (Joe Speigle, maintained by garfieldnate)',
    version: '2021.9.20',
    sourceUrl: KENGDIC_URL,
    licenseName: 'CC BY-SA 3.0 / LGPL 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/legalcode',
    attribution:
      'Contains data from Kengdic by Joe Speigle (CC BY-SA 3.0 / LGPL 2.0), maintained by garfieldnate. See https://github.com/garfieldnate/kengdic',
    description: '韩语-英语离线词典（约 9 万词条）。安装后词条保存在本机 SQLite，可离线检索。',
    parser: 'kengdic-tsv',
    minEntryCount: 50_000,
    installerReady: true,
  },
];

export type DictionaryPackage = {
  id: string;
  language: 'en' | 'ja' | 'ko';
  provider: string;
  version: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  attribution: string;
  description: string;
  installMode: 'on_demand';
  installed: boolean;
  /** 解析器是否已实现（未实现时仅可查看元数据，不可安装） */
  installerReady: boolean;
  entryCount?: number | undefined;
  installedAt?: string | undefined;
};

type ParsedEntry = {
  id: string;
  headword: string;
  partOfSpeech?: string;
  pronunciation?: string;
  meanings: string[];
};

type InstalledSourceRow = {
  id: string;
  entry_count: number;
  imported_at: string;
};

type Fetcher = typeof fetch;

function decodeXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function readAttribute(tag: string, attribute: string): string | undefined {
  const match = new RegExp(`${attribute}="([^"]*)"`).exec(tag);
  return match?.[1] ? decodeXml(match[1]) : undefined;
}

// ---------------------------------------------------------------------------
// OEWN（英语）解析器
// ---------------------------------------------------------------------------

/** 将 OEWN 的稳定 WN-LMF XML 发布包解析为可导入的扁平词条。 */
export function parseOewnXml(xml: string): ParsedEntry[] {
  const definitions = new Map<string, string>();
  for (const match of xml.matchAll(/<Synset\b([^>]*)>([\s\S]*?)<\/Synset>/g)) {
    const id = readAttribute(match[1]!, 'id');
    const definitionMatch = /<Definition\b[^>]*>([\s\S]*?)<\/Definition>/.exec(match[2]!);
    if (id && definitionMatch) definitions.set(id, decodeXml(definitionMatch[1]!));
  }

  const entries: ParsedEntry[] = [];
  for (const match of xml.matchAll(/<LexicalEntry\b([^>]*)>([\s\S]*?)<\/LexicalEntry>/g)) {
    const id = readAttribute(match[1]!, 'id');
    const body = match[2]!;
    const lemmaTag = /<Lemma\b([^>]*?)(?:\/>|>)/.exec(body)?.[1];
    const headword = lemmaTag ? readAttribute(lemmaTag, 'writtenForm') : undefined;
    if (!id || !headword) continue;

    const meanings = [...body.matchAll(/<Sense\b[^>]*\bsynset="([^"]+)"[^>]*\/?>(?:<\/Sense>)?/g)]
      .map((sense) => definitions.get(sense[1]!))
      .filter((definition): definition is string => Boolean(definition));
    if (meanings.length === 0) continue;

    const entry: ParsedEntry = {
      id,
      headword,
      meanings: [...new Set(meanings)].slice(0, 4),
    };
    const partOfSpeech = readAttribute(lemmaTag!, 'partOfSpeech');
    const pronunciation = /<Pronunciation\b[^>]*>([\s\S]*?)<\/Pronunciation>/.exec(body)?.[1];
    if (partOfSpeech) entry.partOfSpeech = partOfSpeech;
    if (pronunciation) entry.pronunciation = decodeXml(pronunciation);
    entries.push(entry);
  }
  return entries;
}

async function loadOewnXml(fetcher: Fetcher): Promise<string> {
  const response = await fetcher(OEWN_2025_URL);
  if (!response.ok) throw new Error(`OEWN download failed: HTTP ${response.status}`);
  const compressed = new Uint8Array(await response.arrayBuffer());
  return new TextDecoder().decode(Bun.gunzipSync(compressed));
}

// ---------------------------------------------------------------------------
// Kengdic（韩语）解析器
// ---------------------------------------------------------------------------

export interface KengdicRow {
  id: number;
  surface: string;
  hanja: string;
  gloss: string;
  level: string;
  created: string;
  source: string;
}

/**
 * 将 Kengdic TSV（制表符分隔，列：id/surface/hanja/gloss/level/created/source）
 * 解析为可导入的扁平词条。空 surface 或空 gloss 的行跳过。
 */
export function parseKengdicTsv(tsv: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const lines = tsv.split(/\r?\n/);
  let headerSkipped = false;
  for (const line of lines) {
    if (!line) continue;
    if (!headerSkipped) {
      const firstCell = line.split('\t')[0];
      headerSkipped = true;
      if (firstCell === 'id') continue;
    }
    const cols = line.split('\t');
    if (cols.length < 4) continue;
    const surface = cols[1]?.trim();
    const gloss = cols[3]?.trim();
    if (!surface || !gloss) continue;
    // gloss 可能含多条释义（以 ';' 或 '；' 分隔），拆分并去重
    const meanings = gloss
      .split(/[;；]/)
      .map((m) => m.trim())
      .filter(Boolean)
      .slice(0, 4);
    if (meanings.length === 0) continue;
    entries.push({
      id: `kengdic-${cols[0]}`,
      headword: surface,
      meanings,
    });
  }
  return entries;
}

async function loadKengdicTsv(fetcher: Fetcher): Promise<string> {
  const response = await fetcher(KENGDIC_URL);
  if (!response.ok) throw new Error(`Kengdic download failed: HTTP ${response.status}`);
  return new TextDecoder().decode(await response.arrayBuffer());
}

// ---------------------------------------------------------------------------
// 通用安装：事务替换，失败不改库
// ---------------------------------------------------------------------------

function insertEntries(
  sqlite: Database,
  manifest: DictionaryPackageManifest,
  entries: ParsedEntry[],
  now: string
): void {
  sqlite
    .prepare('DELETE FROM local_dictionary_entries WHERE source_id = ?')
    .run(manifest.id);
  const insert = sqlite.prepare(`
    INSERT INTO local_dictionary_entries (
      id, language, headword, reading, romanization, meanings_json,
      pronunciation_json, part_of_speech, source_id, source_label, license_note, created_at
    ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const entry of entries) {
    insert.run(
      `${manifest.id}:${entry.id}`,
      manifest.language,
      entry.headword,
      JSON.stringify(entry.meanings),
      entry.pronunciation ? JSON.stringify({ ipa: entry.pronunciation }) : null,
      entry.partOfSpeech ?? null,
      manifest.id,
      `${manifest.provider} ${manifest.version}`,
      `${manifest.licenseName}. ${manifest.attribution}`,
      now
    );
  }
  sqlite.prepare('DELETE FROM dictionary_sources WHERE id = ?').run(manifest.id);
  sqlite.prepare(`
    INSERT INTO dictionary_sources (
      id, language, provider, version, source_url, license_name, license_url, attribution, entry_count, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    manifest.id,
    manifest.language,
    manifest.provider,
    manifest.version,
    manifest.sourceUrl,
    manifest.licenseName,
    manifest.licenseUrl,
    manifest.attribution,
    entries.length,
    now
  );
}

async function installFromManifest(
  sqlite: Database,
  manifest: DictionaryPackageManifest,
  fetcher: Fetcher,
  load: () => Promise<string>,
  parse: (raw: string) => ParsedEntry[]
): Promise<Result<DictionaryPackage, BusinessError>> {
  try {
    const raw = await load();
    const entries = parse(raw);
    if (entries.length < manifest.minEntryCount) {
      return err(
        new BusinessError(
          'E_DICTIONARY_PACKAGE_INVALID',
          `${manifest.provider} 词典包内容不完整（仅 ${entries.length} 条，预期至少 ${manifest.minEntryCount} 条），已取消安装，现有词典不会被修改。`,
          'VALIDATION'
        )
      );
    }

    const now = new Date().toISOString();
    sqlite.run('BEGIN IMMEDIATE');
    try {
      insertEntries(sqlite, manifest, entries, now);
      sqlite.run('COMMIT');
    } catch (error) {
      sqlite.run('ROLLBACK');
      throw error;
    }

    return ok(listDictionaryPackages(sqlite).find((p) => p.id === manifest.id)!);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'NETWORK',
        action: 'installDictionaryPackage',
        entityId: manifest.id,
      })
    );
  }
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/** 列出可安装词典包；包本体不预装，状态只以 SQLite 的 dictionary_sources 为准。 */
export function listDictionaryPackages(sqlite: Database): DictionaryPackage[] {
  const installedRows = sqlite
    .query<InstalledSourceRow, []>(
      'SELECT id, entry_count, imported_at FROM dictionary_sources'
    )
    .all();
  const installedMap = new Map(installedRows.map((r) => [r.id, r]));
  return DICTIONARY_PACKAGE_CATALOG.map((manifest) => {
    const installed = installedMap.get(manifest.id);
    const pkg: DictionaryPackage = {
      id: manifest.id,
      language: manifest.language,
      provider: manifest.provider,
      version: manifest.version,
      sourceUrl: manifest.sourceUrl,
      licenseName: manifest.licenseName,
      licenseUrl: manifest.licenseUrl,
      attribution: manifest.attribution,
      description: manifest.description,
      installMode: 'on_demand',
      installed: Boolean(installed),
      installerReady: manifest.installerReady,
    };
    if (installed) {
      pkg.entryCount = installed.entry_count;
      pkg.installedAt = installed.imported_at;
    }
    return pkg;
  });
}

/** 下载并以单个 SQLite 事务替换指定词典包。下载失败或解析不完整时不写入部分数据。 */
export async function installDictionaryPackage(
  sqlite: Database,
  packageId: string,
  fetcher: Fetcher = fetch
): Promise<Result<DictionaryPackage, BusinessError>> {
  const manifest = DICTIONARY_PACKAGE_CATALOG.find((m) => m.id === packageId);
  if (!manifest) {
    return err(new BusinessError('E_NOT_FOUND', '请求的词典包不存在。', 'VALIDATION'));
  }
  if (!manifest.installerReady) {
    return err(
      new BusinessError(
        'E_DICTIONARY_PACKAGE_INSTALLER_NOT_READY',
        `词典包「${manifest.provider}」已登记元数据，但解析器尚在实现中，暂不可安装。请等待后续版本。`,
        'VALIDATION'
      )
    );
  }
  if (manifest.parser === 'oewn-xml') {
    return installFromManifest(sqlite, manifest, fetcher, () => loadOewnXml(fetcher), parseOewnXml);
  }
  if (manifest.parser === 'kengdic-tsv') {
    return installFromManifest(sqlite, manifest, fetcher, () => loadKengdicTsv(fetcher), parseKengdicTsv);
  }
  return err(
    new BusinessError('E_UNSUPPORTED', `解析器「${manifest.parser}」尚未实现。`, 'AGENT_RUNTIME')
  );
}

/** 兼容旧 API：直接安装 OEWN 包。 */
export async function installOewnPackage(
  sqlite: Database,
  fetcher: Fetcher = fetch
): Promise<Result<DictionaryPackage, BusinessError>> {
  return installDictionaryPackage(sqlite, OEWN_2025_SOURCE_ID, fetcher);
}

