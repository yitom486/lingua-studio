import { Hono } from 'hono';
import { BusinessError, isOk } from '@study-studio/shared';
import { parseTextbookAST } from '@study-studio/protocol';
import { formatBusinessErrorResponse } from '../../../errors/http-error-handler.js';
import type { GatewayDeps } from '../../../transport/http/gateway-deps.js';
import { enrichBookLessons } from '../application/pdf-import/vocab-enrich.js';

/**
 * 课文生词/文法 AI 抽取：POST /api/documents/:userId/:documentId/enrich { lessonId? }。
 * 只抽尚无生词的课（已有词不覆盖）；模型输出经接地校验，非法条目丢弃计数。
 */
export function createDocumentEnrichRoutes(deps: GatewayDeps) {
  return new Hono().post('/api/documents/:userId/:documentId/enrich', async (c) => {
    try {
      const userId = c.req.param('userId');
      const documentId = c.req.param('documentId');
      let lessonId: string | undefined;
      try {
        const body = (await c.req.json().catch(() => null)) as { lessonId?: unknown } | null;
        if (typeof body?.lessonId === 'string' && body.lessonId) lessonId = body.lessonId;
      } catch {
        // 无 body = 整本抽取
      }
      const got = await deps.repo.getDocumentById(documentId);
      if (!isOk(got)) return formatBusinessErrorResponse(c, got.error);
      const doc = got.value;
      if (!doc || doc.userId !== userId) {
        return formatBusinessErrorResponse(
          c,
          new BusinessError('E_NOT_FOUND', '未找到指定的教材或文档', 'LEARNER_STATE')
        );
      }
      if (!doc.astJson) {
        return formatBusinessErrorResponse(
          c,
          new BusinessError('E_INVALID_INPUT', '该文档没有结构化课文，无法抽生词', 'VALIDATION')
        );
      }
      let astRaw: unknown;
      try {
        astRaw = JSON.parse(doc.astJson);
      } catch {
        return formatBusinessErrorResponse(
          c,
          new BusinessError('E_INVALID_INPUT', '该文档课文结构已损坏，无法抽生词', 'VALIDATION')
        );
      }
      const parsed = parseTextbookAST(astRaw);
      if (!parsed.ok) return formatBusinessErrorResponse(c, parsed.error);
      const enriched = await enrichBookLessons(
        deps.server.agentAdapter,
        parsed.value,
        lessonId ? [lessonId] : undefined
      );
      if (!enriched.ok) return formatBusinessErrorResponse(c, enriched.error);
      const now = new Date().toISOString();
      const saved = await deps.repo.saveDocument({
        ...doc,
        astJson: JSON.stringify(enriched.value.book),
        updatedAt: now,
      });
      if (!isOk(saved)) return formatBusinessErrorResponse(c, saved.error);
      return c.json({
        enrichedLessons: enriched.value.enrichedLessons,
        vocabularies: enriched.value.vocabularies,
        grammarPoints: enriched.value.grammarPoints,
        dropped: enriched.value.dropped,
      });
    } catch (e) {
      return formatBusinessErrorResponse(c, e, 'enrichDocument');
    }
  });
}
