import type { Database } from 'bun:sqlite';
import {
  BusinessError,
  err,
  ok,
  type Result,
  translateToBusinessError,
} from '@study-studio/shared';

export const OEWN_2025_URL = 'https://en-word.net/static/english-wordnet-2025.xml.gz';
export const OEWN_2025_SOURCE_ID = 'oewn-2025';

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

/** 列出可安装词典包；包本体不随应用预装，状态只以 SQLite 的来源记录为准。 */
export function listDictionaryPackages(sqlite: Database): DictionaryPackage[] {
  const installedRows = sqlite
    .query<InstalledSourceRow, [string]>(
      'SELECT id, entry_count, imported_at FROM dictionary_sources WHERE id = ?'
    )
    .all(OEWN_2025_SOURCE_ID);
  const installed = installedRows[0];
  const result: DictionaryPackage = {
    id: OEWN_2025_SOURCE_ID,
    language: 'en',
    provider: 'Open English WordNet',
    version: '2025',
    sourceUrl: OEWN_2025_URL,
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Contains data from Open English WordNet 2025 (CC BY 4.0) and Princeton WordNet; attribution is required.',
    description: '通用英语离线释义词典。安装后词条保存在本机 SQLite，可离线检索。',
    installMode: 'on_demand',
    installed: Boolean(installed),
  };
  if (installed) {
    result.entryCount = installed.entry_count;
    result.installedAt = installed.imported_at;
  }
  return [result];
}

async function loadOewnXml(fetcher: Fetcher): Promise<string> {
  const response = await fetcher(OEWN_2025_URL);
  if (!response.ok) throw new Error(`OEWN download failed: HTTP ${response.status}`);
  const compressed = new Uint8Array(await response.arrayBuffer());
  return new TextDecoder().decode(Bun.gunzipSync(compressed));
}

/**
 * 下载并以单个 SQLite 事务替换 OEWN 词典包。下载失败或解析不完整时不会写入部分数据。
 */
export async function installOewnPackage(
  sqlite: Database,
  fetcher: Fetcher = fetch
): Promise<Result<DictionaryPackage, BusinessError>> {
  try {
    const xml = await loadOewnXml(fetcher);
    const entries = parseOewnXml(xml);
    if (entries.length < 100_000) {
      return err(
        new BusinessError(
          'E_DICTIONARY_PACKAGE_INVALID',
          '英语词典包内容不完整，已取消安装，现有词典不会被修改。',
          'VALIDATION'
        )
      );
    }

    const now = new Date().toISOString();
    sqlite.run('BEGIN IMMEDIATE');
    try {
      sqlite.prepare('DELETE FROM local_dictionary_entries WHERE source_id = ?').run(OEWN_2025_SOURCE_ID);
      const insert = sqlite.prepare(`
        INSERT INTO local_dictionary_entries (
          id, language, headword, reading, romanization, meanings_json,
          pronunciation_json, part_of_speech, source_id, source_label, license_note, created_at
        ) VALUES (?, 'en', ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const entry of entries) {
        insert.run(
          `${OEWN_2025_SOURCE_ID}:${entry.id}`,
          entry.headword,
          JSON.stringify(entry.meanings),
          entry.pronunciation ? JSON.stringify({ ipa: entry.pronunciation }) : null,
          entry.partOfSpeech ?? null,
          OEWN_2025_SOURCE_ID,
          'Open English WordNet 2025',
          'CC BY 4.0. Attribution to the Open English WordNet Team and Princeton WordNet is required.',
          now
        );
      }
      sqlite.prepare('DELETE FROM dictionary_sources WHERE id = ?').run(OEWN_2025_SOURCE_ID);
      sqlite.prepare(`
        INSERT INTO dictionary_sources (
          id, language, provider, version, source_url, license_name, license_url, attribution, entry_count, imported_at
        ) VALUES (?, 'en', 'Open English WordNet', '2025', ?, 'CC BY 4.0', ?, ?, ?, ?)
      `).run(
        OEWN_2025_SOURCE_ID,
        OEWN_2025_URL,
        'https://creativecommons.org/licenses/by/4.0/',
        'Contains data from Open English WordNet 2025 (CC BY 4.0) and Princeton WordNet; attribution is required.',
        entries.length,
        now
      );
      sqlite.run('COMMIT');
    } catch (error) {
      sqlite.run('ROLLBACK');
      throw error;
    }

    return ok(listDictionaryPackages(sqlite)[0]!);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'NETWORK',
        action: 'installOewnPackage',
        entityId: OEWN_2025_SOURCE_ID,
      })
    );
  }
}

export async function installDictionaryPackage(
  sqlite: Database,
  packageId: string,
  fetcher: Fetcher = fetch
): Promise<Result<DictionaryPackage, BusinessError>> {
  if (packageId !== OEWN_2025_SOURCE_ID) {
    return err(new BusinessError('E_NOT_FOUND', '请求的词典包不存在。', 'VALIDATION'));
  }
  return installOewnPackage(sqlite, fetcher);
}
