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
      try {
        const body = await c.req.parseBody();
        const candidate = body['file'];
        if (candidate instanceof File) file = candidate;
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
      const res = await convertPdfToAst({}, { userId, filename: file.name || 'upload.pdf', bytes });
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
