import { describe, expect, test } from 'bun:test';
import { gzipSync } from 'node:zlib';
import { detectDocScript, markdownToAst } from '../modules/library/application/pdf-import/markdown-to-ast.js';
import {
  convertPdfToAst,
  importPdfDocument,
} from '../modules/library/application/pdf-import/pdf-import-service.js';
import { extractTarGz, extractZip } from '../modules/library/application/pdf-import/archive.js';
import { assertArtifactUrlAllowed, currentRuntimePlatform } from '../modules/library/application/pdf-import/pdf-artifacts.js';
import { fetchRuntimeArtifact } from '../modules/library/application/pdf-import/pdf-runtime.js';
import { isOk } from '@study-studio/shared';

const JA_MD = `# 第 1 课
李さん：はじめまして。李です。
森：はじめまして。森です。どうぞよろしく。
「ありがとうございます」
## 第 2 课
王：これは本ですか。
李：はい、それは本です。
`;

describe('markdownToAst', () => {
  test('标题切课、说话人前缀成句、引号成句', () => {
    const res = markdownToAst(JA_MD, { title: '标日初上', bookId: 'pdf-test' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.language).toBe('JA');
    expect(res.value.lessons.length).toBe(2);
    expect(res.value.lessons[0]?.dialogues.length).toBe(3);
    expect(res.value.lessons[0]?.dialogues[0]).toMatchObject({
      speaker: '李さん',
      japanese: 'はじめまして。李です。',
    });
    expect(res.value.lessons[0]?.dialogues[2]?.speaker).toBe('课文');
    // 生词/语法不臆造
    expect(res.value.lessons[0]?.vocabularies).toEqual([]);
    expect(res.value.lessons[0]?.grammarPoints).toEqual([]);
  });

  test('无标题整篇一课', () => {
    const res = markdownToAst('おはようございます。\nこんにちは。', { bookId: 'pdf-one' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.lessons.length).toBe(1);
    expect(res.value.lessons[0]?.dialogues.length).toBe(2);
  });

  test('韩语/英语语种判定', () => {
    const ko = markdownToAst('친구와 카페에서 한국어를 공부합니다.', { bookId: 'k' });
    expect(ko.ok && ko.value.language).toBe('KO');
    const en = markdownToAst('The professor suggested that each student write.', { bookId: 'e' });
    expect(en.ok && en.value.language).toBe('EN');
  });

  test('空输入与纯目录返回 E_CONTENT_EMPTY（不编造）', () => {
    expect(markdownToAst('', {}).ok).toBe(false);
    expect(markdownToAst('目录\n1 ...... 5\n2 ...... 9', {}).ok).toBe(false);
  });

  test('detectDocScript 混写行不误判中文为主', () => {
    expect(detectDocScript('注意助词で表示场所')).toBe('JA');
    expect(detectDocScript('纯中文讲解无假名')).toBe('JA'); // 无信号回退默认
  });
});

function stubInspector(result: {
  pdfType: string;
  pageCount: number;
  markdown?: string | null;
  pagesNeedingOcr?: number[];
  ocrMarkdown?: string | null;
}) {
  return async () => ({
    processPdf: () => ({
      pdfType: result.pdfType,
      pageCount: result.pageCount,
      markdown: result.markdown ?? null,
      pagesNeedingOcr: result.pagesNeedingOcr ?? [],
      confidence: 0.9,
    }),
    processPdfWithOcr: async () => ({
      markdown: result.ocrMarkdown ?? null,
      pagesRoutedToOcr: result.pagesNeedingOcr ?? [],
      pagesRecommendingHosted: [],
    }),
  });
}

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

describe('convertPdfToAst', () => {
  test('文字版直提：分类透传 + AST + 统计', async () => {
    const res = await convertPdfToAst(
      { loadInspector: stubInspector({ pdfType: 'TextBased', pageCount: 3, markdown: JA_MD }) },
      { userId: 'u1', filename: '标日.pdf', bytes: PDF_HEAD }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.classification.pdfType).toBe('TextBased');
    expect(res.value.classification.ocrUsed).toBe(false);
    expect(res.value.stats.lessons).toBe(2);
    expect(res.value.book.title).toBe('标日');
  });

  test('扫描版走 OCR：ocrUsed=true', async () => {
    const res = await convertPdfToAst(
      {
        loadInspector: stubInspector({
          pdfType: 'Scanned',
          pageCount: 1,
          markdown: null,
          pagesNeedingOcr: [1],
          ocrMarkdown: JA_MD,
        }),
      },
      { userId: 'u1', filename: 'scan.pdf', bytes: PDF_HEAD }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.classification.ocrUsed).toBe(true);
  });

  test('OCR 无输出 → E_OCR_LANG_UNSUPPORTED（韩语包缺口如实报错）', async () => {
    const res = await convertPdfToAst(
      {
        loadInspector: stubInspector({
          pdfType: 'Scanned',
          pageCount: 1,
          markdown: null,
          pagesNeedingOcr: [1],
          ocrMarkdown: '',
        }),
      },
      { userId: 'u1', filename: 'ko-scan.pdf', bytes: PDF_HEAD }
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('E_OCR_LANG_UNSUPPORTED');
  });

  test('非 PDF 魔数 / 超页 / 非 pdf 后缀拒绝', async () => {
    const bad = await convertPdfToAst(
      { loadInspector: stubInspector({ pdfType: 'TextBased', pageCount: 1, markdown: JA_MD }) },
      { userId: 'u1', filename: 'a.pdf', bytes: new Uint8Array([1, 2, 3]) }
    );
    expect(bad.ok).toBe(false);
    const txt = await convertPdfToAst(
      { loadInspector: stubInspector({ pdfType: 'TextBased', pageCount: 1, markdown: JA_MD }) },
      { userId: 'u1', filename: 'a.txt', bytes: PDF_HEAD }
    );
    expect(txt.ok).toBe(false);
    const many = await convertPdfToAst(
      { loadInspector: stubInspector({ pdfType: 'TextBased', pageCount: 61, markdown: JA_MD }) },
      { userId: 'u1', filename: 'big.pdf', bytes: PDF_HEAD }
    );
    expect(many.ok).toBe(false);
  });
});

describe('importPdfDocument', () => {
  test('转换 + 经仓储入库（单写路径不断言库实现）', async () => {
    const saved: unknown[] = [];
    const res = await importPdfDocument(
      {
        saveDocument: async (doc) => {
          saved.push(doc);
          const { ok } = await import('@study-studio/shared');
          return ok(doc);
        },
        loadInspector: stubInspector({ pdfType: 'TextBased', pageCount: 1, markdown: JA_MD }),
      },
      { userId: 'u1', filename: '标日.pdf', bytes: PDF_HEAD }
    );
    expect(isOk(res)).toBe(true);
    expect(saved.length).toBe(1);
  });
});

describe('archive', () => {
  test('tar.gz 回环：官方包布局可解', () => {
    // 手工组装最小 ustar（单文件 package/index.js）
    const payload = Buffer.from('module.exports = 1;');
    const header = Buffer.alloc(512);
    header.write('package/index.js', 0);
    header.write('0000777', 100);
    header.write('0000000', 108);
    header.write('0000000', 116);
    header.write(payload.length.toString(8).padStart(11, '0'), 124);
    header.write('00000000000', 136);
    header[156] = 48; // '0'
    header.write('ustar', 257);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i]!;
    header.write(sum.toString(8).padStart(6, '0'), 148);
    header[154] = 0;
    const tar = Buffer.concat([header, payload, Buffer.alloc(512 - (payload.length % 512))]);
    const entries = extractTarGz(gzipSync(tar));
    expect(entries.length).toBe(1);
    expect(entries[0]?.path).toBe('package/index.js');
    expect(Buffer.from(entries[0]?.data ?? []).toString()).toBe('module.exports = 1;');
  });

  test('zip 越界路径由写盘层拦截（此处验解析不抛）', () => {
    // 仅验非法输入被拒，不构造完整 zip
    expect(() => extractZip(new Uint8Array([1, 2, 3, 4]))).toThrow();
    expect(() => extractTarGz(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});

describe('artifacts', () => {
  test('白名单外 URL 拒绝下载', async () => {
    const res = await fetchRuntimeArtifact('https://evil.example.com/x.tgz', {
      fetchImpl: (async () => {
        throw new Error('must not fetch');
      }) as unknown as typeof fetch,
      sha256: '00',
    });
    expect(res.ok).toBe(false);
  });

  test('data: URL + integrity 校验走通（无网络）', async () => {
    const { createHash } = await import('node:crypto');
    const body = new TextEncoder().encode('hello-artifact');
    const b64 = createHash('sha512').update(body).digest('base64');
    const url = `data:application/octet-stream;base64,${Buffer.from(body).toString('base64')}`;
    const res = await fetchRuntimeArtifact(url, {
      integrity: `sha512-${b64}`,
    });
    expect(res.ok).toBe(true);
  });

  test('当前平台可解析；未知平台抛错不猜', () => {
    expect(() => currentRuntimePlatform('win32', 'x64')).not.toThrow();
    expect(() => currentRuntimePlatform('plan9', 'x64')).toThrow();
  });

  test('assertArtifactUrlAllowed 仅放行三处官方源', () => {
    expect(() =>
      assertArtifactUrlAllowed('https://registry.npmjs.org/@firecrawl/pdf-inspector/-/x.tgz')
    ).not.toThrow();
    expect(() => assertArtifactUrlAllowed('https://registry.npmjs.org.evil.com/x')).toThrow();
  });
});
