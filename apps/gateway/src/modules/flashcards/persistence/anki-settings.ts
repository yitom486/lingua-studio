import { eq } from 'drizzle-orm';
import {
  ok,
  err,
  type Result,
  BusinessError,
  translateToBusinessError,
  nowIso,
} from '@study-studio/shared';
import { ankiSettings } from '../../../infrastructure/db/index.js';
import type { RepoDeps } from '../../../infrastructure/persistence/repo-context.js';

/**
 * AnkiConnect 推送开关持久化（默认关闭；读侧永不抛，损坏行回退默认）。
 * endpoint 常量与校验落持久层（R4：上层 application 复用此处，不反向依赖）。
 */

export const ANKI_CONNECT_DEFAULT_ENDPOINT = 'http://127.0.0.1:8765';

/** endpoint 解析与收窄（仅 http(s) 本机回环；环境变量覆盖须同样收敛）。 */
export function resolveAnkiEndpoint(raw: string | undefined): string {
  const candidate = (raw ?? '').trim() || ANKI_CONNECT_DEFAULT_ENDPOINT;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new BusinessError(
      'E_INVALID_INPUT',
      'AnkiConnect 地址不正确，形如 http://127.0.0.1:8765',
      'VALIDATION',
      false
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BusinessError(
      'E_INVALID_INPUT',
      'AnkiConnect 只允许 http(s) 本机地址',
      'VALIDATION',
      false
    );
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    throw new BusinessError(
      'E_INVALID_INPUT',
      'AnkiConnect 只允许连接本机 Anki（localhost/127.0.0.1），不访问远程地址',
      'SECURITY',
      false
    );
  }
  return url.toString().replace(/\/$/, '');
}

export interface AnkiPushSettings {
  enabled: boolean;
  endpoint: string;
}

const SETTINGS_ID = 'default';

export async function getAnkiSettings(deps: RepoDeps): Promise<AnkiPushSettings> {
  try {
    const rows = await deps.db.select().from(ankiSettings).where(eq(ankiSettings.id, SETTINGS_ID));
    const row = rows[0];
    if (!row) return { enabled: false, endpoint: ANKI_CONNECT_DEFAULT_ENDPOINT };
    let endpoint = ANKI_CONNECT_DEFAULT_ENDPOINT;
    try {
      endpoint = resolveAnkiEndpoint(row.endpoint);
    } catch {
      endpoint = ANKI_CONNECT_DEFAULT_ENDPOINT;
    }
    return { enabled: row.enabled === 1, endpoint };
  } catch {
    return { enabled: false, endpoint: ANKI_CONNECT_DEFAULT_ENDPOINT };
  }
}

export async function saveAnkiSettings(
  deps: RepoDeps,
  patch: { enabled?: boolean; endpoint?: string }
): Promise<Result<AnkiPushSettings, BusinessError>> {
  try {
    const current = await getAnkiSettings(deps);
    const next: AnkiPushSettings = {
      enabled: patch.enabled ?? current.enabled,
      endpoint: current.endpoint,
    };
    if (patch.endpoint !== undefined) {
      try {
        next.endpoint = resolveAnkiEndpoint(patch.endpoint);
      } catch (e) {
        if (e instanceof BusinessError) return err(e);
        return err(translateToBusinessError(e, 'saveAnkiSettings'));
      }
    }
    const existing = await deps.db
      .select({ id: ankiSettings.id })
      .from(ankiSettings)
      .where(eq(ankiSettings.id, SETTINGS_ID));
    const values = {
      id: SETTINGS_ID,
      enabled: next.enabled ? 1 : 0,
      endpoint: next.endpoint,
      updatedAt: nowIso(),
    };
    if (existing.length > 0) {
      await deps.db.update(ankiSettings).set(values).where(eq(ankiSettings.id, SETTINGS_ID));
    } else {
      await deps.db.insert(ankiSettings).values(values);
    }
    return ok(next);
  } catch (e) {
    return err(translateToBusinessError(e, 'saveAnkiSettings'));
  }
}
