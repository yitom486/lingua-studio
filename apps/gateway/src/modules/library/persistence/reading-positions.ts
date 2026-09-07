import {
  ok,
  err,
  type Result,
  BusinessError,
  translateToBusinessError,
  nowIso,
} from '@study-studio/shared';
import type { RepoDeps } from '../../../infrastructure/persistence/repo-context.js';

/**
 * 阅读位置域：每用户每文档一条（upsert），locator 为不透明 JSON（lessonId/offset/page 由前端组装）。
 * 只记“看到哪”，不解析语义；quote 级锚定仍走 annotations 表。
 */

export interface ReadingPosition {
  userId: string;
  documentId: string;
  locator: Record<string, unknown>;
  updatedAt: string;
}

function parseLocator(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* 损坏值回退空对象，读侧永不抛 */
  }
  return {};
}

/** 保存阅读位置（narrow 失败拒绝；document 归属不校验——位置是私有游标，错 id 只影响自己）。 */
export async function saveReadingPosition(
  deps: RepoDeps,
  userId: string,
  documentId: string,
  locator: unknown
): Promise<Result<ReadingPosition, BusinessError>> {
  const uid = userId.trim();
  if (!uid || uid.length > 64) {
    return err(new BusinessError('E_INVALID_INPUT', 'userId 非法', 'VALIDATION'));
  }
  const docId = documentId.trim();
  if (!docId || docId.length > 128) {
    return err(new BusinessError('E_INVALID_INPUT', 'documentId 非法', 'VALIDATION'));
  }
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) {
    return err(new BusinessError('E_INVALID_INPUT', 'locator 必须为对象', 'VALIDATION'));
  }
  const raw = JSON.stringify(locator).slice(0, 4000);
  const now = nowIso();
  try {
    deps.sqlite
      .query(
        `INSERT INTO reading_positions (user_id, document_id, locator, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, document_id) DO UPDATE SET
           locator = excluded.locator, updated_at = excluded.updated_at`
      )
      .run(uid, docId, raw, now);
    return ok({ userId: uid, documentId: docId, locator: parseLocator(raw), updatedAt: now });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'saveReadingPosition',
        entityId: docId,
      })
    );
  }
}

/** 读取阅读位置（无记录返回 null，不算错）。 */
export async function getReadingPosition(
  deps: RepoDeps,
  userId: string,
  documentId: string
): Promise<Result<ReadingPosition | null, BusinessError>> {
  const uid = userId.trim();
  const docId = documentId.trim();
  if (!uid || !docId) {
    return err(new BusinessError('E_INVALID_INPUT', 'userId 或 documentId 非法', 'VALIDATION'));
  }
  try {
    const row = deps.sqlite
      .query(
        `SELECT user_id AS user_id, document_id AS document_id,
                locator AS locator, updated_at AS updated_at
         FROM reading_positions WHERE user_id = ? AND document_id = ?`
      )
      .get(uid, docId) as {
      user_id: string;
      document_id: string;
      locator: string;
      updated_at: string;
    } | null;
    if (!row) return ok(null);
    return ok({
      userId: row.user_id,
      documentId: row.document_id,
      locator: parseLocator(row.locator),
      updatedAt: row.updated_at,
    });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'getReadingPosition',
        entityId: docId,
      })
    );
  }
}
