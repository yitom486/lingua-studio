import { BusinessError, err, generateId, isOk, logger, ok, type Result } from '@study-studio/shared';
import { parseTextbookAST, type DocumentItem, type TextbookAST } from '@study-studio/protocol';
import { ensurePdfRuntime, type PdfInspectorLike } from './pdf-runtime.js';
import { markdownToAst } from './markdown-to-ast.js';
import { extractHeadingsFromMarkdown, extractTocEntries, type PageHeading, type TocEntry } from './extract-headings.js';

/**
 * PDF 导入编排：校验 → 按需运行时 → 分类（文字直提 / 扫描 OCR）→ AST → 入库。
 * 语言与 OCR 覆盖（2026-09-06 spike 实测）：
 * - 文字版：JA/KO/EN 均可直接提取；
 * - 扫描版：JA/EN 走自带 PP-OCRv6；KO 交白卷 → 返回 E_OCR_LANG_UNSUPPORTED，
 *   不臆造、不静默降级。
 */

export const MAX_PDF_BYTES = 200 * 1024 * 1024;
export const MAX_PDF_PAGES = 400;
/** 单次导入最多 OCR 页数（约 0.7s/页；大书请按课分段选页导入） */
export const MAX_OCR_PAGES_PER_IMPORT = 30;
/** 结构预览默认/上限扫描窗口（页） */
export const MAX_MAP_PAGES = 30;

export interface PdfImportInput {
  userId: string;
  filename: string;
  bytes: Uint8Array;
  /** 1-based 选页（不传 = 全书；大书请按课分段） */
  pages?: number[];
}

export interface PdfImportClassification {
  pdfType: string;
  pageCount: number;
  pagesNeedingOcr: number[];
  ocrUsed: boolean;
  selectedPages: number[];
}

export interface PdfImportStats {
  lessons: number;
  dialogues: number;
}

export interface PdfImportOutput {
  document: DocumentItem;
  book: TextbookAST;
  classification: PdfImportClassification;
  stats: PdfImportStats;
}

export interface PdfAstOutput {
  book: TextbookAST;
  markdown: string;
  classification: PdfImportClassification;
  stats: PdfImportStats;
}

export interface PdfImportServiceDeps {
  saveDocument: (doc: DocumentItem) => Promise<Result<DocumentItem, BusinessError>>;
  /** 测试注入：跳过真实下载/原生绑定 */
  loadInspector?: () => Promise<PdfInspectorLike>;
  runtimeDir?: string;
}

function errorMessage(e: unknown): string {
  if (e instanceof BusinessError) return e.userMessage;
  return 'PDF 解析运行时异常，请稍后重试';
}

export interface PdfMapOutput {
  classification: PdfImportClassification;
  window: number[];
  headings: PageHeading[];
  tocEntries: TocEntry[];
}

/**
 * 结构预览（目录感知导入第一步）：扫一个窗口页（默认前 30 页），
 * 返回每页标题 + 目录条目。调用方按标题页选范围，再调 convertPdfToAst 精确导入。
 * 有目录 → 目录条目即 ground truth；无目录 → 分段扫全书标题建地图。
 */
export async function mapPdfPages(
  deps: Pick<PdfImportServiceDeps, 'loadInspector' | 'runtimeDir'>,
  input: PdfImportInput
): Promise<Result<PdfMapOutput, BusinessError>> {
  const check = validatePdfInput(input);
  if (!check.ok) return err(check.error);
  let inspector: PdfInspectorLike;
  try {
    const runtime = await ensurePdfRuntime({
      ...(deps.loadInspector ? { loadInspector: deps.loadInspector } : {}),
      ...(deps.runtimeDir ? { runtimeDir: deps.runtimeDir } : {}),
      needOcr: false,
    });
    inspector = runtime.inspector;
  } catch (e) {
    return err(
      e instanceof BusinessError
        ? e
        : new BusinessError('E_RUNTIME_LOAD', 'PDF 解析运行时准备失败，请检查网络后重试', 'NETWORK')
    );
  }
  let classification: {
    pdfType?: string;
    pageCount?: number;
    pagesNeedingOcr?: number[];
    confidence?: number;
  };
  try {
    classification = inspector.processPdf(input.bytes);
  } catch (e) {
    logger.warn('[pdf-map] processPdf failed', { message: errorMessage(e) });
    return err(new BusinessError('E_PDF_PARSE', 'PDF 解析失败（文件可能加密或已损坏）', 'TOOL_EXECUTION'));
  }
  const pdfType = String(classification.pdfType ?? 'Unknown');
  const pageCount = Number(classification.pageCount ?? 0);
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    return err(new BusinessError('E_PDF_PARSE', 'PDF 页数识别失败，文件可能已损坏', 'TOOL_EXECUTION'));
  }
  const window: number[] = [];
  if (input.pages !== undefined) {
    const cleaned = [...new Set(input.pages)].filter(
      (n) => Number.isInteger(n) && n >= 1 && n <= pageCount
    );
    if (cleaned.length === 0) {
      return err(new BusinessError('E_INVALID_INPUT', `选页超出范围（本书共 ${pageCount} 页）`, 'VALIDATION'));
    }
    cleaned.sort((a, b) => a - b);
    window.push(...cleaned.slice(0, MAX_MAP_PAGES));
  } else {
    for (let p = 1; p <= Math.min(pageCount, MAX_MAP_PAGES); p++) window.push(p);
  }
  const needing = Array.isArray(classification.pagesNeedingOcr)
    ? classification.pagesNeedingOcr.filter((n): n is number => typeof n === 'number')
    : [];
  try {
    const runtime = await ensurePdfRuntime({
      ...(deps.loadInspector ? { loadInspector: deps.loadInspector } : {}),
      ...(deps.runtimeDir ? { runtimeDir: deps.runtimeDir } : {}),
      needOcr: window.some((p) => needing.includes(p)),
    });
    inspector = runtime.inspector;
    const ocr = await inspector.processPdfWithOcr(input.bytes, { pageNumbers: window });
    const perPage = Array.isArray(ocr.pages) ? ocr.pages : [];
    const headings: PageHeading[] = [];
    let combined = '';
    if (perPage.length > 0) {
      for (const pg of perPage) {
        const md = typeof pg.markdown === 'string' ? pg.markdown : '';
        headings.push(...extractHeadingsFromMarkdown(md, pg.pageNumber));
      }
      combined = perPage.map((pg) => (typeof pg.markdown === 'string' ? pg.markdown : '')).join('\n');
    } else {
      combined = typeof ocr.markdown === 'string' ? ocr.markdown : '';
      headings.push(...extractHeadingsFromMarkdown(combined, window[0] ?? 1));
    }
    return ok({
      classification: {
        pdfType,
        pageCount,
        pagesNeedingOcr: needing,
        ocrUsed: window.some((p) => needing.includes(p)),
        selectedPages: window,
      },
      window,
      headings,
      tocEntries: extractTocEntries(combined),
    });
  } catch (e) {
    logger.warn('[pdf-map] map window failed', { message: errorMessage(e) });
    return err(
      e instanceof BusinessError
        ? e
        : new BusinessError('E_PDF_PARSE', '结构预览失败，请稍后重试', 'TOOL_EXECUTION')
    );
  }
}

function validatePdfInput(input: PdfImportInput): Result<void, BusinessError> {
  if (!input.filename.toLowerCase().endsWith('.pdf')) {
    return err(new BusinessError('E_INVALID_INPUT', '只支持 .pdf 文件导入', 'VALIDATION'));
  }
  if (input.bytes.length === 0 || input.bytes.length > MAX_PDF_BYTES) {
    return err(
      new BusinessError('E_INVALID_INPUT', 'PDF 文件过大（上限 200MB），请检查文件', 'VALIDATION')
    );
  }
  const magic = Buffer.from(input.bytes.subarray(0, 5)).toString('latin1');
  if (magic !== '%PDF-') {
    return err(new BusinessError('E_INVALID_INPUT', '文件头不是合法 PDF，请确认文件未损坏', 'VALIDATION'));
  }
  return ok(undefined);
}

export async function convertPdfToAst(
  deps: Pick<PdfImportServiceDeps, 'loadInspector' | 'runtimeDir'>,
  input: PdfImportInput
): Promise<Result<PdfAstOutput, BusinessError>> {
  const valid = validatePdfInput(input);
  if (!valid.ok) return err(valid.error);

  let inspector: PdfInspectorLike;
  try {
    const runtime = await ensurePdfRuntime({
      ...(deps.loadInspector ? { loadInspector: deps.loadInspector } : {}),
      ...(deps.runtimeDir ? { runtimeDir: deps.runtimeDir } : {}),
      needOcr: false,
    });
    inspector = runtime.inspector;
  } catch (e) {
    return err(
      e instanceof BusinessError
        ? e
        : new BusinessError('E_RUNTIME_LOAD', 'PDF 解析运行时准备失败，请检查网络后重试', 'NETWORK')
    );
  }

  let classification: {
    pdfType?: string;
    pageCount?: number;
    markdown?: string | null;
    pagesNeedingOcr?: number[];
    confidence?: number;
  };
  try {
    classification = inspector.processPdf(input.bytes);
  } catch (e) {
    logger.warn('[pdf-import] processPdf failed', { message: errorMessage(e) });
    return err(new BusinessError('E_PDF_PARSE', 'PDF 解析失败（文件可能加密或已损坏）', 'TOOL_EXECUTION'));
  }

  const pdfType = String(classification.pdfType ?? 'Unknown');
  const pageCount = Number(classification.pageCount ?? 0);
  const pagesNeedingOcr = Array.isArray(classification.pagesNeedingOcr)
    ? classification.pagesNeedingOcr.filter((n): n is number => typeof n === 'number')
    : [];
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    return err(new BusinessError('E_PDF_PARSE', 'PDF 页数识别失败，文件可能已损坏', 'TOOL_EXECUTION'));
  }
  if (pageCount > MAX_PDF_PAGES) {
    return err(
      new BusinessError(
        'E_INVALID_INPUT',
        `PDF 共 ${pageCount} 页（上限 ${MAX_PDF_PAGES} 页），请按课分段选页导入`,
        'VALIDATION'
      )
    );
  }

  // 选页校验（1-based；不传 = 全书）
  let selectedPages: number[] | null = null;
  if (input.pages !== undefined) {
    const cleaned = [...new Set(input.pages)].filter(
      (n) => Number.isInteger(n) && n >= 1 && n <= pageCount
    );
    if (cleaned.length === 0) {
      return err(
        new BusinessError('E_INVALID_INPUT', `选页超出范围（本书共 ${pageCount} 页）`, 'VALIDATION')
      );
    }
    if (cleaned.length > MAX_PDF_PAGES) {
      return err(
        new BusinessError('E_INVALID_INPUT', `一次最多导入 ${MAX_PDF_PAGES} 页，请缩小范围`, 'VALIDATION')
      );
    }
    cleaned.sort((a, b) => a - b);
    selectedPages = cleaned;
  }
  const inScope = (n: number) => !selectedPages || selectedPages.includes(n);

  let markdown = '';
  let ocrUsed = false;
  if (selectedPages) {
    // 选页导入：文字页直提 + 扫描页 OCR（Auto 只路由需 OCR 页）
    try {
      const selectedNeeding = pagesNeedingOcr.filter(inScope);
      if (selectedNeeding.length > MAX_OCR_PAGES_PER_IMPORT) {
        return err(
          new BusinessError(
            'E_INVALID_INPUT',
            `所选页中有 ${selectedNeeding.length} 页需 OCR（单次上限 ${MAX_OCR_PAGES_PER_IMPORT} 页），请缩小选页范围`,
            'VALIDATION'
          )
        );
      }
      const runtime = await ensurePdfRuntime({
        ...(deps.loadInspector ? { loadInspector: deps.loadInspector } : {}),
        ...(deps.runtimeDir ? { runtimeDir: deps.runtimeDir } : {}),
        needOcr: selectedNeeding.length > 0,
      });
      inspector = runtime.inspector;
      if (selectedNeeding.length > 0) {
        const ocr = await inspector.processPdfWithOcr(input.bytes, { pageNumbers: selectedPages });
        markdown = typeof ocr.markdown === 'string' ? ocr.markdown : '';
        ocrUsed = true;
      } else {
        const part = await inspector.processPdf(input.bytes, selectedPages);
        markdown = typeof part.markdown === 'string' ? part.markdown : '';
      }
    } catch (e) {
      logger.warn('[pdf-import] selected pages failed', { message: errorMessage(e) });
      return err(
        e instanceof BusinessError
          ? e
          : new BusinessError('E_PDF_PARSE', '选页提取失败，请稍后重试', 'TOOL_EXECUTION')
      );
    }
  } else {
    markdown = typeof classification.markdown === 'string' ? classification.markdown : '';
    if (!markdown.trim() && pagesNeedingOcr.length > 0) {
      if (pagesNeedingOcr.length > MAX_OCR_PAGES_PER_IMPORT) {
        return err(
          new BusinessError(
            'E_INVALID_INPUT',
            `本书 ${pagesNeedingOcr.length} 页需 OCR（单次上限 ${MAX_OCR_PAGES_PER_IMPORT} 页），请按课分段选页导入`,
            'VALIDATION'
          )
        );
      }
      // 扫描页：按需准备 OCR 运行时（PDFium + ORT + 模型，不进安装包）
      try {
        const runtime = await ensurePdfRuntime({
          ...(deps.loadInspector ? { loadInspector: deps.loadInspector } : {}),
          ...(deps.runtimeDir ? { runtimeDir: deps.runtimeDir } : {}),
          needOcr: true,
        });
        inspector = runtime.inspector;
        const ocr = await inspector.processPdfWithOcr(input.bytes);
        markdown = typeof ocr.markdown === 'string' ? ocr.markdown : '';
        ocrUsed = true;
        const hosted = Array.isArray(ocr.pagesRecommendingHosted) ? ocr.pagesRecommendingHosted.length : 0;
        if (hosted > 0) {
          logger.info('[pdf-import] 部分页面 OCR 置信度低，建议改用文字版 PDF', { hosted });
        }
      } catch (e) {
        return err(
          e instanceof BusinessError
            ? e
            : new BusinessError('E_OCR_FAILED', 'OCR 运行时准备失败，请检查网络后重试', 'NETWORK')
        );
      }
    }
  }

  if (!markdown.trim()) {
    return err(
      new BusinessError(
        'E_OCR_LANG_UNSUPPORTED',
        '未能从 PDF 中识别出文字：扫描版韩语暂不支持本地 OCR（模型包无谚文覆盖），请改用文字版 PDF，或等待云端 OCR 接入',
        'TOOL_EXECUTION'
      )
    );
  }

  const title = input.filename.replace(/\.pdf$/i, '');
  const astRes = markdownToAst(markdown, { title });
  if (!astRes.ok) return err(astRes.error);
  // 协议层再验一次：服务绝不向外吐出非法 AST
  const checked = parseTextbookAST(astRes.value);
  if (!checked.ok) return err(checked.error);
  const book = checked.value;

  const stats: PdfImportStats = {
    lessons: book.lessons.length,
    dialogues: book.lessons.reduce((acc, l) => acc + l.dialogues.length, 0),
  };
  logger.info('[pdf-import] 转换成功', { title: book.title, ...stats, ocrUsed });
  return ok({
    book,
    markdown,
    classification: {
      pdfType,
      pageCount,
      pagesNeedingOcr: pagesNeedingOcr.filter(inScope),
      ocrUsed,
      selectedPages: selectedPages ?? [],
    },
    stats,
  });
}

export async function importPdfDocument(
  deps: PdfImportServiceDeps,
  input: PdfImportInput
): Promise<Result<PdfImportOutput, BusinessError>> {
  const converted = await convertPdfToAst(deps, input);
  if (!converted.ok) return err(converted.error);
  const { book, markdown, classification, stats } = converted.value;

  const now = new Date().toISOString();
  const saved = await deps.saveDocument({
    id: generateId('doc'),
    userId: input.userId,
    title: book.title,
    sourceKind: 'user_import',
    language: book.language.toLowerCase(),
    content: markdown.slice(0, 2000),
    astJson: JSON.stringify(book),
    sourcePublisher: 'PDF导入（自有资料）',
    createdAt: now,
    updatedAt: now,
  });
  if (!isOk(saved)) return err(saved.error);
  return ok({ document: saved.value, book, classification, stats });
}
