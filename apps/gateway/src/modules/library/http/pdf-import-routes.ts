import { Hono } from 'hono';
import { BusinessError, isOk } from '@study-studio/shared';
import { formatBusinessErrorResponse } from '../../../errors/http-error-handler.js';
import { convertPdfToAst, MAX_PDF_BYTES } from '../application/pdf-import/pdf-import-service.js';

/**
 * PDF 导入路由：前端上传 PDF → 网关分类/提取/结构化 → 返回 TextbookAST。
 * 持久化复用前端既有 useImportTextbookMutation（POST /api/documents/:userId），
 * 本路由只做 PDF→AST（无状态转换），不直接写库。
 */
export function createPdfImportRoutes() {
  return new Hono().post('/api/documents/:userId/import-pdf', async (c) => {
    try {
      const userId = c.req.param('userId');
      if (!userId) {
        return formatBusinessErrorResponse(
          c,
          new BusinessError('E_INVALID_INPUT', '缺少用户标识', 'VALIDATION')
        );
      }
      let file: File | null = null;
      let startPage: number | undefined;
      let endPage: number | undefined;
      try {
        const body = await c.req.parseBody();
        const candidate = body['file'];
        if (candidate instanceof File) file = candidate;
        const sp = body['startPage'];
        const ep = body['endPage'];
        if (typeof sp === 'string' && /^\d+$/.test(sp)) startPage = Number(sp);
        if (typeof ep === 'string' && /^\d+$/.test(ep)) endPage = Number(ep);
      } catch {
        return formatBusinessErrorResponse(
          c,
          new BusinessError('E_INVALID_INPUT', '上传体不是合法 multipart，请用 file 字段上传 PDF', 'VALIDATION')
        );
      }
      if (!file) {
        return formatBusinessErrorResponse(
          c,
          new BusinessError('E_INVALID_INPUT', '未收到 PDF 文件（file 字段为空）', 'VALIDATION')
        );
      }
      if (file.size === 0 || file.size > MAX_PDF_BYTES) {
        return formatBusinessErrorResponse(
          c,
          new BusinessError('E_INVALID_INPUT', 'PDF 文件过大（上限 20MB），请拆分后再导入', 'VALIDATION')
        );
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      // 选页（大书按课分段）：起止页合法才组 pages，否则全书
      let pages: number[] | undefined;
      if (startPage !== undefined && endPage !== undefined && startPage >= 1 && endPage >= startPage) {
        pages = [];
        for (let p = startPage; p <= endPage; p++) pages.push(p);
      }
      const res = await convertPdfToAst(
        {},
        {
          userId,
          filename: file.name || 'upload.pdf',
          bytes,
          ...(pages ? { pages } : {}),
        }
      );
      if (!isOk(res)) return formatBusinessErrorResponse(c, res.error);
      return c.json({
        book: res.value.book,
        classification: res.value.classification,
        stats: res.value.stats,
      });
    } catch (e) {
      return formatBusinessErrorResponse(c, e, 'importPdfDocument');
    }
  });
}
