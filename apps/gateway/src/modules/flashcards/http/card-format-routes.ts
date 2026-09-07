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
      .post('/api/flashcards/preview', async (c) => {        try {
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
      // AnkiConnect 状态（开关 + 端点 + 本机 Anki 版本探测，不抛）。
      .get('/api/flashcards/anki/status', async (c) => {
        try {
          const settings = await deps.repo.getAnkiPushSettings();
          let ankiVersion: number | null = null;
          if (settings.enabled) {
            const { createAnkiClient, getAnkiVersion } = await import(
              '../application/anki-connect.js'
            );
            try {
              const probed = await getAnkiVersion(createAnkiClient(settings.endpoint));
              if (isOk(probed)) ankiVersion = probed.value;
            } catch {
              ankiVersion = null;
            }
          }
          return c.json({ ...settings, connected: ankiVersion !== null, ankiVersion });
        } catch (e) {
          return formatBusinessErrorResponse(c, e, 'ankiStatus');
        }
      })
      // AnkiConnect 开关/端点（默认关闭；endpoint 仅本机回环）。
      .put('/api/flashcards/anki/settings', async (c) => {
        try {
          const body = (await c.req.json().catch(() => null)) as {
            enabled?: unknown;
            endpoint?: unknown;
          } | null;
          const res = await deps.repo.saveAnkiPushSettings({
            ...(typeof body?.enabled === 'boolean' ? { enabled: body.enabled } : {}),
            ...(typeof body?.endpoint === 'string' ? { endpoint: body.endpoint } : {}),
          });
          if (isOk(res)) return c.json(res.value);
          return formatBusinessErrorResponse(c, res.error, 'ankiSettings');
        } catch (e) {
          return formatBusinessErrorResponse(c, e, 'ankiSettings');
        }
      })
      // 推送生词卡到本机 Anki（与 flashcards.anki_push Tool 同命令；TTS 凭证随请求来、用完即弃）。
      .post('/api/flashcards/anki/push', async (c) => {
        try {
          const body = (await c.req.json().catch(() => null)) as {
            userId?: unknown;
            cardId?: unknown;
            formatId?: unknown;
            deckName?: unknown;
            tts?: unknown;
          } | null;
          if (typeof body?.cardId !== 'string' || !body.cardId) {
            return formatBusinessErrorResponse(
              c,
              new Error('缺少生词卡 id，请先加入生词本再推送'),
              'ankiPush'
            );
          }
          const tts = narrowAnkiPushTts(body?.tts);
          const res = await deps.repo.pushCardToAnki({
            userId: typeof body?.userId === 'string' && body.userId ? body.userId : 'default_user',
            cardId: body.cardId,
            ...(typeof body?.formatId === 'string' ? { formatId: body.formatId } : {}),
            ...(typeof body?.deckName === 'string' ? { deckName: body.deckName } : {}),
            ...(tts ? { tts } : {}),
          });
          if (isOk(res)) return c.json(res.value);
          return formatBusinessErrorResponse(c, res.error, 'ankiPush');
        } catch (e) {
          return formatBusinessErrorResponse(c, e, 'ankiPush');
        }
      })
  );
}

/** 推送 TTS 凭证收窄（provider 必填；其余缺省；Key 只存本次调用内存）。 */
function narrowAnkiPushTts(input: unknown):
  | {
      provider: string;
      baseUrl?: string;
      region?: string;
      apiKey?: string;
      voice?: string;
      model?: string;
      rate?: number;
      gender?: 'FEMALE' | 'MALE';
    }
  | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const v = input as Record<string, unknown>;
  if (typeof v['provider'] !== 'string' || !v['provider']) return undefined;
  const out: {
    provider: string;
    baseUrl?: string;
    region?: string;
    apiKey?: string;
    voice?: string;
    model?: string;
    rate?: number;
    gender?: 'FEMALE' | 'MALE';
  } = { provider: v['provider'] };
  for (const key of ['baseUrl', 'region', 'apiKey', 'voice', 'model'] as const) {
    if (typeof v[key] === 'string' && v[key]) out[key] = v[key] as string;
  }
  if (typeof v['rate'] === 'number') out.rate = v['rate'];
  if (v['gender'] === 'FEMALE' || v['gender'] === 'MALE') out.gender = v['gender'];
  return out;
}
