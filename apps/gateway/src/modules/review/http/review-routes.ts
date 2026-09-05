import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { isOk, BusinessError } from '@study-studio/shared';
import { scheduleNextReview } from '@study-studio/learner-core';
import { formatBusinessErrorResponse } from '../../../errors/http-error-handler.js';
import type { GatewayDeps } from '../../../transport/http/gateway-deps.js';

/** 复习域路由：FSRS 闪卡存取与复习（G2 迁移，行为不变）。 */
export function createReviewRoutes(deps: GatewayDeps) {
  return new Hono()
  // 3. FSRS 闪卡存取
  .get('/api/cards/:userId', async (c) => {
    const userId = c.req.param('userId');
    const lang = c.req.query('lang');
    const res = await deps.repo.getDueCards(userId, undefined, lang ? { language: lang } : undefined);
    if (isOk(res)) return c.json(res.value);
    return formatBusinessErrorResponse(c, res.error);
  })
  .post(
    '/api/cards/:userId',
    validator('json', (value) => value as Record<string, unknown> | Record<string, unknown>[]),
    async (c) => {
      try {
        const body = c.req.valid('json');
        const cardsToSave = Array.isArray(body) ? body : [body];
        for (const card of cardsToSave) {
          await deps.repo.saveCard(card as any);
        }
        return c.json({ success: true, count: cardsToSave.length });
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'saveCards');
      }
    }
  )
  // 3a. 卡片复习评分：Gateway 为唯一 FSRS 计算与持久化者，前端只传 rating
  .post(
    '/api/cards/:userId/:cardId/review',
    validator('json', (value) => value as { rating?: unknown }),
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const cardId = c.req.param('cardId');
        const { rating } = c.req.valid('json');
        if (rating !== 'AGAIN' && rating !== 'HARD' && rating !== 'GOOD' && rating !== 'EASY') {
          return formatBusinessErrorResponse(
            c,
            new BusinessError('E_INVALID_INPUT', '请提供有效的复习评分。', 'VALIDATION'),
            'reviewCard'
          );
        }
        const cardsRes = await deps.repo.getDueCards(userId, 200);
        if (!isOk(cardsRes)) return formatBusinessErrorResponse(c, cardsRes.error, 'reviewCard');
        const targetCard = cardsRes.value.find((card) => card.id === cardId);
        if (!targetCard) {
          return formatBusinessErrorResponse(
            c,
            new BusinessError('E_NOT_FOUND', '未找到待复习卡片，请刷新后重试。', 'LEARNER_STATE'),
            'reviewCard'
          );
        }
        const currentFsrs = {
          stability: targetCard.fsrs.stability,
          difficulty: targetCard.fsrs.difficulty,
          reps: targetCard.fsrs.reps,
          lapses: targetCard.fsrs.lapses,
          dueAt: targetCard.fsrs.dueAt,
          state: targetCard.fsrs.state,
          ...(targetCard.fsrs.lastReviewedAt
            ? { lastReviewedAt: targetCard.fsrs.lastReviewedAt }
            : {}),
        };
        const nextFsrs = scheduleNextReview(currentFsrs, rating);
        const saveRes = await deps.repo.saveCard({ ...targetCard, fsrs: nextFsrs });
        if (!isOk(saveRes)) return formatBusinessErrorResponse(c, saveRes.error, 'reviewCard');
        await deps.repo.recordDailyActivity(userId, { cards: 1 });
        return c.json({
          success: true,
          cardId,
          nextFsrs,
          nextReviewDays: Math.max(1, Math.round(nextFsrs.stability)),
        });
      } catch (e: unknown) {
        return formatBusinessErrorResponse(c, e, 'reviewCard');
      }
    }
  )
;
}
