import { describe, it, expect, beforeEach } from 'bun:test';
import {
  DICTIONARY_PACKAGE_CATALOG,
  KENGDIC_SOURCE_ID,
  JMDICT_E_SOURCE_ID,
  OEWN_2025_SOURCE_ID,
  listDictionaryPackages,
  installDictionaryPackage,
  parseKengdicTsv,
} from '../services/dictionary-packages.js';
import { DrizzleLearnerRepository } from '../repository/drizzle-learner-repository.js';
import { isOk, generateId } from '@study-studio/shared';
import type { Flashcard } from '@study-studio/protocol';

// 构造一份足够大的 mock Kengdic TSV（≥ minEntryCount=50_000）以通过完整性校验
function makeMockKengdicTsv(rows = 50_001): string {
  const lines: string[] = ['id\tsurface\thanja\tgloss\tlevel\tcreated\tsource'];
  for (let i = 1; i <= rows; i++) {
    // 用一组可检索的真实韩语词 + 唯一 id，保证 search 能命中
    const surface = i === 1 ? '안녕하세요' : `단어${i}`;
    const gloss = i === 1 ? 'hello; greeting' : `word number ${i}`;
    lines.push(
      `${i}\t${surface}\t\t${gloss}\t\t2006-01-16T09:52:46Z\tengdic-${i}@ezcorean:${i}`
    );
  }
  return lines.join('\n');
}

function makeMockFetcher(tsv: string): typeof fetch {
  const impl = async (_url: string): Promise<Response> => {
    return {
      ok: true,
      status: 200,
      async arrayBuffer() {
        return new TextEncoder().encode(tsv).buffer;
      },
    } as unknown as Response;
  };
  return impl as unknown as typeof fetch;
}

function makeFailingFetcher(status = 503): typeof fetch {
  const impl = async (_url: string): Promise<Response> => {
    return { ok: false, status } as unknown as Response;
  };
  return impl as unknown as typeof fetch;
}

describe('P3-A 词典包 manifest/catalog', () => {
  it('目录登记三种语种包，每个 manifest 含许可证/署名/来源 URL', () => {
    expect(DICTIONARY_PACKAGE_CATALOG.length).toBeGreaterThanOrEqual(3);
    const ids = DICTIONARY_PACKAGE_CATALOG.map((m) => m.id);
    expect(ids).toContain(OEWN_2025_SOURCE_ID);
    expect(ids).toContain(JMDICT_E_SOURCE_ID);
    expect(ids).toContain(KENGDIC_SOURCE_ID);

    for (const m of DICTIONARY_PACKAGE_CATALOG) {
      expect(m.licenseName.length).toBeGreaterThan(0);
      expect(m.licenseUrl.startsWith('https://creativecommons.org/')).toBe(true);
      expect(m.attribution.length).toBeGreaterThan(0);
      expect(m.sourceUrl.startsWith('http')).toBe(true);
      expect(['oewn-xml', 'jmdict-xml', 'kengdic-tsv']).toContain(m.parser);
    }
  });

  it('JMdict manifest 已登记但 installerReady=false（解析器待实现）', () => {
    const jmdict = DICTIONARY_PACKAGE_CATALOG.find((m) => m.id === JMDICT_E_SOURCE_ID);
    expect(jmdict).toBeDefined();
    expect(jmdict?.installerReady).toBe(false);
    expect(jmdict?.licenseName).toBe('CC BY-SA 4.0');
  });

  it('Kengdic manifest 标记为可安装', () => {
    const kengdic = DICTIONARY_PACKAGE_CATALOG.find((m) => m.id === KENGDIC_SOURCE_ID);
    expect(kengdic).toBeDefined();
    expect(kengdic?.installerReady).toBe(true);
    expect(kengdic?.language).toBe('ko');
  });
});

describe('P3-A Kengdic TSV 解析器', () => {
  it('解析 TSV 行为扁平词条，跳过空 surface/gloss，拆分多释义', () => {
    const tsv = [
      'id\tsurface\thanja\tgloss\tlevel\tcreated\tsource',
      '1\t안녕하세요\t\thello; greeting\t\t2006-01-16T09:52:46Z\tx@ezcorean:1',
      '2\t\t\tempty surface\t\t2006-01-16T09:52:46Z\tx@ezcorean:2',
      '3\t단어\t\t\t\t2006-01-16T09:52:46Z\tx@ezcorean:3',
      '4\t학교\t學校\tschool\tA\t2006-01-16T09:52:46Z\tx@ezcorean:4',
    ].join('\n');
    const entries = parseKengdicTsv(tsv);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.headword).toBe('안녕하세요');
    expect(entries[0]?.meanings).toEqual(['hello', 'greeting']);
    expect(entries[1]?.headword).toBe('학교');
    expect(entries[1]?.meanings).toEqual(['school']);
  });
});

describe('P3-A 词典包安装与来源追溯', () => {
  let repo: DrizzleLearnerRepository;

  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
  });

  it('未知 packageId → E_NOT_FOUND', async () => {
    const res = await installDictionaryPackage(repo.getRawDb(), 'no-such-package');
    expect(isOk(res)).toBe(false);
    if (!isOk(res)) {
      expect(res.error.code).toBe('E_NOT_FOUND');
      expect(res.error.userMessage).toContain('不存在');
    }
  });

  it('JMdict（installerReady=false）→ 友好错误，不下载', async () => {
    const fetcher = jestLikeFailingFetcher();
    const res = await installDictionaryPackage(
      repo.getRawDb(),
      JMDICT_E_SOURCE_ID,
      fetcher
    );
    expect(isOk(res)).toBe(false);
    if (!isOk(res)) {
      expect(res.error.code).toBe('E_DICTIONARY_PACKAGE_INSTALLER_NOT_READY');
      expect(res.error.userMessage).toContain('解析器尚在实现中');
      expect(res.error.userMessage).not.toMatch(/ECONN|fetch failed/i);
    }
  });

  it('下载失败 → 不改库（dictionary_sources 仍为空，可读失败原因）', async () => {
    const res = await installDictionaryPackage(
      repo.getRawDb(),
      KENGDIC_SOURCE_ID,
      makeFailingFetcher(503)
    );
    expect(isOk(res)).toBe(false);
    if (!isOk(res)) {
      // 可读失败原因，不泄漏底层栈
      expect(res.error.userMessage.length).toBeGreaterThan(0);
      expect(res.error.userMessage).not.toMatch(/at\s+\w+\.\w+|stack trace/i);
    }
    // 库未被写入
    const pkgs = listDictionaryPackages(repo.getRawDb()).filter((p) => p.installed);
    expect(pkgs).toHaveLength(0);
  });

  it('Kengdic 安装成功 → 来源可追溯（许可证/署名/条目数），搜索可命中', async () => {
    const tsv = makeMockKengdicTsv();
    const res = await installDictionaryPackage(
      repo.getRawDb(),
      KENGDIC_SOURCE_ID,
      makeMockFetcher(tsv)
    );
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      expect(res.value.installed).toBe(true);
      expect(res.value.language).toBe('ko');
      expect(res.value.licenseName).toBe('CC BY-SA 3.0 / LGPL 2.0');
      expect(res.value.entryCount).toBeGreaterThanOrEqual(50_000);
      expect(res.value.attribution).toContain('Joe Speigle');
    }

    // listDictionaryPackages 反映已安装状态
    const kengdicPkg = listDictionaryPackages(repo.getRawDb()).find(
      (p) => p.id === KENGDIC_SOURCE_ID
    );
    expect(kengdicPkg?.installed).toBe(true);
    expect(kengdicPkg?.entryCount).toBeGreaterThanOrEqual(50_000);

    // dictionary_sources 来源可追溯
    const sourceRow = repo
      .getRawDb()
      .query('SELECT id, license_name, license_url, attribution, entry_count FROM dictionary_sources WHERE id = ?')
      .get(KENGDIC_SOURCE_ID) as any;
    expect(sourceRow).toBeDefined();
    expect(sourceRow?.license_name).toBe('CC BY-SA 3.0 / LGPL 2.0');
    expect(sourceRow?.attribution).toContain('Joe Speigle');

    // 搜索可命中
    const searchRes = await repo.searchLocalDictionary('ko', '안녕하세요');
    expect(isOk(searchRes)).toBe(true);
    if (isOk(searchRes)) {
      expect(searchRes.value.length).toBeGreaterThan(0);
      expect(searchRes.value[0]?.headword).toBe('안녕하세요');
      expect(searchRes.value[0]?.meanings).toContain('hello');
      expect(searchRes.value[0]?.licenseNote).toContain('CC BY-SA 3.0');
    }
  });

  it('Kengdic 词条可收集为 FSRS 卡（下载/搜索/收集闭环）', async () => {
    const tsv = makeMockKengdicTsv();
    await installDictionaryPackage(
      repo.getRawDb(),
      KENGDIC_SOURCE_ID,
      makeMockFetcher(tsv)
    );

    // 搜索
    const searchRes = await repo.searchLocalDictionary('ko', '안녕하세요');
    expect(isOk(searchRes)).toBe(true);
    if (!isOk(searchRes)) return;
    const entry = searchRes.value[0]!;

    // 收集为 FSRS 卡
    const card: Flashcard = {
      id: generateId('card'),
      userId: 'student_ko_01',
      type: 'VOCABULARY',
      front: entry.headword,
      back: entry.meanings.join('; '),
      tags: ['ko', 'kengdic'],
      fsrs: {
        stability: 2.5,
        difficulty: 4.8,
        reps: 0,
        lapses: 0,
        dueAt: new Date().toISOString(),
        state: 'NEW',
      },
    };
    const saveRes = await repo.saveCard(card);
    expect(isOk(saveRes)).toBe(true);

    // 卡片已写入 flashcards 表（直接查 DB，避免 resolveActiveLanguage 复杂度）
    const cardRow = repo
      .getRawDb()
      .query('SELECT id, front, back FROM flashcards WHERE id = ?')
      .get(card.id) as any;
    expect(cardRow).toBeDefined();
    expect(cardRow?.front).toBe(entry.headword);
  });
});

// 辅助：用于「不应下载」断言的 fetcher（若被调用则抛错）
function jestLikeFailingFetcher(): typeof fetch {
  const impl = async (): Promise<Response> => {
    throw new Error('JMdict 安装器未就绪，fetcher 不应被调用');
  };
  return impl as unknown as typeof fetch;
}
