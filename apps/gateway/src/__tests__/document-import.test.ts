import { describe, expect, it, beforeEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fsp } from 'node:fs';
import { isOk } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../infrastructure/drizzle-learner-repository.js';
import { getMorphAnalyzer } from '../modules/dictionary/persistence/morphology.js';
import { decodeTextBytes } from '../modules/library/application/document-import/text-reader.js';
import {
  xhtmlToMarkdown,
  extractEpubText,
  parseNcxToc,
  parseNavToc,
} from '../modules/library/application/document-import/epub-reader.js';
import {
  guessSourceKind,
  DOCUMENT_SOURCE_KINDS,
} from '../modules/library/application/document-import/document-source.js';
import { LibraryImportTool } from '../modules/library/tools/library-import-tool.js';

// ---------- 最小 stored-zip 构造器（单测自包含） ----------
function buildStoredZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
  const u32 = (n: number) =>
    new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
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
    const lh = concat([
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(0), u32(f.data.length), u32(f.data.length),
      u16(nameBytes.length), u16(0),
      nameBytes,
    ]);
    chunks.push(lh, f.data);
    central.push(
      concat([
        new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
        u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(0), u32(f.data.length), u32(f.data.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset),
        nameBytes,
      ])
    );
    offset += lh.length + f.data.length;
  }
  const cd = concat(central);
  const end = concat([
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16(0), u16(0), u16(central.length), u16(central.length),
    u32(cd.length), u32(offset), u16(0),
  ]);
  return concat([...chunks, cd, end]);
}

function buildEpubBytes(): Uint8Array {
  const enc = new TextEncoder();
  const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>测试电子书</dc:title></metadata><manifest><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx"><itemref idref="cover" linear="no"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`;
  const ncx = `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="n1"><navLabel><text>第一章</text></navLabel><content src="ch1.xhtml"/></navPoint><navPoint id="n2"><navLabel><text>第二章</text></navLabel><content src="ch2.xhtml"/><navPoint id="n3"><navLabel><text>第二节</text></navLabel><content src="ch2.xhtml#s3"/></navPoint></navPoint></navMap></ncx>`;
  const cover = `<html><body><p>封面图 COVER-MARKER</p></body></html>`;
  const ch1 = `<html><head><title>1</title></head><body><h1>第一章</h1><p>彼はご飯を食べる。</p><script>alert(1)</script></body></html>`;
  const ch2 = `<html><body><p>Hello world &amp; friends</p></body></html>`;
  return buildStoredZip([
    { name: 'mimetype', data: enc.encode('application/epub+zip') },
    { name: 'META-INF/container.xml', data: enc.encode(container) },
    { name: 'OEBPS/content.opf', data: enc.encode(opf) },
    { name: 'OEBPS/toc.ncx', data: enc.encode(ncx) },
    { name: 'OEBPS/cover.xhtml', data: enc.encode(cover) },
    { name: 'OEBPS/ch1.xhtml', data: enc.encode(ch1) },
    { name: 'OEBPS/ch2.xhtml', data: enc.encode(ch2) },
  ]);
}

describe('document source kinds', () => {
  it('扩展名推断；未知不猜', () => {
    expect(guessSourceKind('a.pdf')).toBe('pdf');
    expect(guessSourceKind('a.EPUB')).toBe('epub');
    expect(guessSourceKind('a.md')).toBe('text');
    expect(guessSourceKind('a.zip')).toBeUndefined();
    expect(DOCUMENT_SOURCE_KINDS).toEqual(['pdf', 'epub', 'text']);
  });
});

describe('text reader', () => {
  it('BOM 剥离；空拒绝', () => {
    const enc = new TextEncoder();
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode('hello')]);
    expect(decodeTextBytes(withBom, 'a.txt')).toEqual({ title: 'a', markdown: 'hello' });
    expect(() => decodeTextBytes(new Uint8Array([32]), 'a.txt')).toThrow();
  });
});

describe('epub reader', () => {
  it('xhtml 脱衣（标题/段落/实体/script 丢弃）', () => {
    const md = xhtmlToMarkdown('<h1>T</h1><p>a<br>b &amp; c</p><script>x()</script>');
    expect(md).toContain('# T');
    expect(md).toContain('a\nb & c');
    expect(md.includes('x()')).toBe(false);
  });

  it('spine 顺序组装 + 标题', () => {
    const res = extractEpubText(buildEpubBytes(), 't.epub');
    expect(res.title).toBe('测试电子书');
    expect(res.markdown.indexOf('第一章') < res.markdown.indexOf('第二章')).toBe(true);
    expect(res.markdown).toContain('彼はご飯を食べる。');
    expect(res.markdown.includes('alert')).toBe(false);
    // 封面（linear=no）不进正文
    expect(res.markdown.includes('COVER-MARKER')).toBe(false);
    // 目录单元：无碎片优先，spine 顺序
    expect(res.units).toEqual(['第一章', '第二章']);
    // 无标题章由目录标签起课
    expect(res.markdown).toContain('# 第二章');
  });

  it('NCX 嵌套层级解析；EPUB3 nav 回退', () => {
    const ncx = `<ncx><navMap><navPoint id="a"><navLabel><text>卷一</text></navLabel><content src="a.xhtml"/><navPoint id="b"><navLabel><text>第一回</text></navLabel><content src="a.xhtml#r1"/></navPoint></navMap></ncx>`;
    const items = parseNcxToc(ncx, '');
    expect(items).toEqual([
      { label: '卷一', href: 'a.xhtml', level: 0 },
      { label: '第一回', href: 'a.xhtml#r1', level: 1 },
    ]);
    const nav = `<html><body><nav epub:type="toc"><ol><li><a href="x.xhtml">X</a></li></ol></nav></body></html>`;
    expect(parseNavToc(nav, 'OEBPS/nav.xhtml')).toEqual([{ label: 'X', href: 'OEBPS/x.xhtml', level: 0 }]);
    expect(parseNavToc('<html></html>', 'nav.xhtml')).toEqual([]);
  });

  it('坏包/缺 container 友好抛错', () => {
    expect(() => extractEpubText(new Uint8Array([1, 2, 3]), 'x.epub')).toThrow();
    expect(() =>
      extractEpubText(buildStoredZip([{ name: 'a', data: new Uint8Array([1]) }]), 'x.epub')
    ).toThrow();
  });
});

describe('morphology registry', () => {
  it('三语路由 + 门控', () => {
    expect(getMorphAnalyzer('ja')?.verb).toBe('活用自');
    expect(getMorphAnalyzer('en')?.verb).toBe('还原为');
    expect(getMorphAnalyzer('ko')?.verb).toBe('活用自');
    expect(getMorphAnalyzer('ja')?.supports('食べた')).toBe(true);
    expect(getMorphAnalyzer('ja')?.supports('hello')).toBe(false);
    expect(getMorphAnalyzer('en')?.supports('runs')).toBe(true);
    expect(getMorphAnalyzer('ko')?.supports('먹어요')).toBe(true);
    expect(getMorphAnalyzer('ko')?.supports('hello')).toBe(false);
  });
});

describe('document import service', () => {
  let repo: DrizzleLearnerRepository;
  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
  });

  it('EPUB 端到端：任务 done + 文档入库 + 课数', async () => {
    const res = await repo.importDocumentFile({
      userId: 'u1',
      kind: 'epub',
      filename: 't.epub',
      bytes: buildEpubBytes(),
    });
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.task.status).toBe('done');
    expect(res.value.lessons).toBeGreaterThanOrEqual(2);
    expect(res.value.document.title).toContain('测试电子书');
    const task = await repo.getImportTask(res.value.task.id);
    expect(task?.status).toBe('done');
    expect(task?.documentId).toBe(res.value.document.id);
  });

  it('文本直传入库；坏输入任务 failed', async () => {
    const enc = new TextEncoder();
    const okRes = await repo.importDocumentFile({
      userId: 'u1',
      kind: 'text',
      filename: 'note.txt',
      bytes: enc.encode('# 标题\n\nHello world, this is a test note with enough content here.'),
    });
    expect(isOk(okRes)).toBe(true);
    const bad = await repo.importDocumentFile({
      userId: 'u1',
      kind: 'text',
      filename: 'empty.txt',
      bytes: new Uint8Array(0),
    });
    expect(isOk(bad)).toBe(false);
  });

  it('library.import_document Tool（真实文件往返）', async () => {
    const dir = await fsp.mkdtemp(join(tmpdir(), 'ss-doc-tool-'));
    try {
      const file = join(dir, 'n.txt');
      await fsp.writeFile(file, '# T\n\nSome English learning text content for import testing here.');
      const tool = new (await import('../modules/library/tools/library-import-tool.js')).LibraryImportTool(repo);
      expect(tool.name).toBe('library.import_document');
      const res = await tool.execute({ userId: 'u1', kind: 'text', filePath: file }, { userId: 'u1', sessionId: 's' });
      expect(isOk(res)).toBe(true);
      if (!isOk(res)) return;
      expect(res.value.task.status).toBe('done');
      expect(res.value.lessons).toBeGreaterThan(0);
      const missing = await tool.execute({ userId: 'u1', filePath: join(dir, 'no.txt') }, { userId: 'u1', sessionId: 's' });
      expect(isOk(missing)).toBe(false);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
