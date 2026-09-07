import { Hono } from 'hono';
import { isOk } from '@study-studio/shared';
import type { AnkiCardFormat } from '@study-studio/learner-core';
import { formatBusinessErrorResponse } from '../../../errors/http-error-handler.js';
import { narrowSaveCardFormatInput } from '../persistence/card-formats.js';
import { narrowCardSourceEntry } from '../application/card-preview.js';
import type { GatewayDeps } from '../../../transport/http/gateway-deps.js';

/** 卡片模板域路由（呈现资产 CRUD + 预览；FSRS 调度仍走 review 域）。 */
export function createCardFormatRoutes(deps: GatewayDeps) {
  return (
    new Hono()
      .get('/api/flashcards/formats', async (c) => {
        const res = await deps.repo.listCardFormats();
        if (isOk(res)) return c.json({ formats: res.value });
        return formatBusinessErrorResponse(c, res.error, 'cardFormatsList');
      })
      // 保存模板（id 以路径为准；校验不通过拒绝写入并明说第一条问题）。
      .put('/api/flashcards/formats/:id', async (c) => {
        try {
          const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
          const narrowed = narrowSaveCardFormatInput({ ...(body ?? {}), id: c.req.param('id') });
          if (!narrowed) {
            return formatBusinessErrorResponse(
              c,
              new Error('模板结构不正确：请检查名称、字段映射与正反面模板'),
              'cardFormatSave'
            );
          }
          const res = await deps.repo.saveCardFormat(narrowed);
          if (isOk(res)) return c.json({ format: res.value });
          return formatBusinessErrorResponse(c, res.error, 'cardFormatSave');
        } catch (e) {
          return formatBusinessErrorResponse(c, e, 'cardFormatSave');
        }
      })
      // 恢复内置版本（仅内置 id；自定义模板拒绝并明说）。
      .post('/api/flashcards/formats/:id/reset', async (c) => {
        const res = await deps.repo.resetCardFormat(c.req.param('id'));
        if (isOk(res)) return c.json({ format: res.value });
        return formatBusinessErrorResponse(c, res.error, 'cardFormatReset');
      })
      // 预览（草稿只渲染不入库；与 flashcards.render Tool 同命令）。
      .post('/api/flashcards/preview', async (c) => {
        try {
          const body = (await c.req.json().catch(() => null)) as {
            formatId?: unknown;
            inlineFormat?: unknown;
            entry?: unknown;
          } | null;
          const entry = narrowCardSourceEntry(body?.entry);
          if (!entry) {
            return formatBusinessErrorResponse(
              c,
              new Error('预览条目不正确：需要 headword 与 meanings'),
              'cardPreview'
            );
          }
          const res = await deps.repo.previewCardFormat({
            ...(typeof body?.formatId === 'string' ? { formatId: body.formatId } : {}),
            ...(body?.inlineFormat && typeof body.inlineFormat === 'object'
              ? { inlineFormat: body.inlineFormat as AnkiCardFormat }
              : {}),
            entry,
          });
          if (isOk(res)) return c.json(res.value);
          return formatBusinessErrorResponse(c, res.error, 'cardPreview');
        } catch (e) {
          return formatBusinessErrorResponse(c, e, 'cardPreview');
        }
      })
  );
}
