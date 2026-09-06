import { eq, and, or, like, sql } from 'drizzle-orm';
import {
  ok,
  err,
  type Result,
  BusinessError,
  translateToBusinessError,
  generateId,
  nowIso,
} from '@study-studio/shared';
import type { Flashcard } from '@study-studio/protocol';
import { localDictionaryEntries, flashcards } from '../../../infrastructure/db/index.js';
import type { RepoDeps } from '../../../infrastructure/persistence/repo-context.js';
import type { TrackLanguage } from '../../../infrastructure/persistence/language.js';
import { normalizeTrackLanguage } from '../../../infrastructure/persistence/language.js';

/**
 * 词典域（由 DrizzleLearnerRepository 搬迁而来，行为不变）。
 * 词典内容保持公共只读资产；收集操作只创建用户自己的 FSRS 状态。
 */

export interface LocalDictionaryEntry {
  id: string;
  language: TrackLanguage;
  headword: string;
  reading?: string | undefined;
  romanization?: string | undefined;
  meanings: string[];
  pronunciation?: Record<string, unknown> | undefined;
  partOfSpeech?: string | undefined;
  sourceLabel: string;
  licenseNote: string;
  /** 活用形还原注记（如「食べた」→「食べる（た形）」），直击中时为空 */
  inflectionNote?: string | undefined;
}

/** 词典资产被收集为用户 FSRS 生词卡后的领域结果；不依赖任何具体界面。 */
export interface DictionaryEntryCollection {
  card: Flashcard;
  created: boolean;
}

type LocalDictionaryRow = typeof localDictionaryEntries.$inferSelect;

/** DB 行 → 领域条目（读侧永不抛；meanings 解析失败回退空数组）。 */
function toLocalDictionaryEntry(row: LocalDictionaryRow): LocalDictionaryEntry {
  let meanings: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.meaningsJson);
    if (Array.isArray(parsed)) {
      meanings = parsed.filter((m): m is string => typeof m === 'string');
    }
  } catch {
    meanings = [];
  }
  const entry: LocalDictionaryEntry = {
    id: row.id,
    language: row.language as TrackLanguage,
    headword: row.headword,
    meanings,
    sourceLabel: row.sourceLabel,
    licenseNote: row.licenseNote,
  };
  if (row.reading) entry.reading = row.reading;
  if (row.romanization) entry.romanization = row.romanization;
  if (row.pronunciationJson) {
    try {
      entry.pronunciation = JSON.parse(row.pronunciationJson) as Record<string, unknown>;
    } catch {
      entry.pronunciation = undefined;
    }
  }
  if (row.partOfSpeech) entry.partOfSpeech = row.partOfSpeech;
  return entry;
}

import { deinflectJa } from './deinflect.js';

/**
 * 查询本地、可再分发的词典资产。第三方词典只可作为外链兜底，绝不在此抓取。
 */
export async function searchLocalDictionary(
  deps: RepoDeps,
  language: TrackLanguage,
  query: string,
  limit = 20
): Promise<Result<LocalDictionaryEntry[], BusinessError>> {
  try {
    const normalized = query.trim();
    if (!normalized) return ok([]);

    const pattern = `%${normalized}%`;
    const rows = await deps.db
      .select()
      .from(localDictionaryEntries)
      .where(
        and(
          eq(localDictionaryEntries.language, language),
          or(
            like(localDictionaryEntries.headword, pattern),
            like(localDictionaryEntries.reading, pattern),
            like(localDictionaryEntries.romanization, pattern)
          )
        )
      )
      .limit(Math.min(Math.max(limit, 1), 50));

    const direct = rows.map(toLocalDictionaryEntry);
    if (direct.length > 0 || language !== 'ja') return ok(direct);

    // 日语直击为空时尝试活用形还原（食べた→食べる）：候选逐个精确查，命中即注记来源
    for (const candidate of deinflectJa(normalized)) {
      const hitRows = await deps.db
        .select()
        .from(localDictionaryEntries)
        .where(
          and(
            eq(localDictionaryEntries.language, language),
            or(
              eq(localDictionaryEntries.headword, candidate.base),
              eq(localDictionaryEntries.reading, candidate.base)
            )
          )
        )
        .limit(Math.min(Math.max(limit, 1), 50));
      if (hitRows.length > 0) {
        return ok(
          hitRows.map((row) => ({
            ...toLocalDictionaryEntry(row),
            inflectionNote: `「${normalized}」活用自「${candidate.base}」（${candidate.note}）`,
          }))
        );
      }
    }
    return ok(direct);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'searchLocalDictionary',
        entityId: query,
      })
    );
  }
}

/**
 * 随机抽取本地词典条目（假名单词听写等“系统随机出题”场景用）。
 * 返回原始条目；假名可用性等过滤由调用方按需完成。
 */
export async function sampleLocalDictionaryEntries(
  deps: RepoDeps,
  language: TrackLanguage,
  limit = 10
): Promise<Result<LocalDictionaryEntry[], BusinessError>> {
  try {
    const rows = await deps.db
      .select()
      .from(localDictionaryEntries)
      .where(eq(localDictionaryEntries.language, language))
      .orderBy(sql`RANDOM()`)
      .limit(Math.min(Math.max(limit, 1), 50));
    return ok(rows.map(toLocalDictionaryEntry));
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'sampleLocalDictionaryEntries',
        entityId: language,
      })
    );
  }
}

/**
 * 将一个已安装的本地词典条目收集为用户生词卡。
 */
export async function collectDictionaryEntry(
  deps: RepoDeps,
  userId: string,
  entryId: string
): Promise<Result<DictionaryEntryCollection, BusinessError>> {
  try {
    const entryRows = await deps.db
      .select()
      .from(localDictionaryEntries)
      .where(eq(localDictionaryEntries.id, entryId))
      .limit(1);
    const entry = entryRows[0];
    if (!entry) {
      return err(
        new BusinessError('E_NOT_FOUND', '该词典条目不存在或对应词典包尚未安装。', 'LEARNER_STATE')
      );
    }

    const existingRows = await deps.db
      .select()
      .from(flashcards)
      .where(
        and(
          eq(flashcards.userId, userId),
          eq(flashcards.sourceEntryId, entry.id)
        )
      )
      .limit(1);
    const existing = existingRows[0];
    if (existing) {
      return ok({
        created: false,
        card: {
          id: existing.id,
          userId: existing.userId,
          type: existing.type as Flashcard['type'],
          front: existing.front,
          back: existing.back,
          phonetic: existing.phonetic ?? undefined,
          audioUrl: existing.audioUrl ?? undefined,
          tags: JSON.parse(existing.tags) as string[],
          fsrs: JSON.parse(existing.fsrs),
        },
      });
    }

    const meanings = JSON.parse(entry.meaningsJson) as string[];
    const reading = entry.reading ?? entry.romanization ?? undefined;
    const now = nowIso();
    const card: Flashcard = {
      id: generateId('card_dict'),
      userId,
      type: 'VOCABULARY',
      front: entry.headword,
      back: meanings.join('；'),
      phonetic: reading,
      tags: ['词典生词', entry.partOfSpeech ?? '词汇', entry.sourceLabel],
      fsrs: {
        stability: 1,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        dueAt: now,
        state: 'NEW',
      },
    };
    await deps.db.insert(flashcards).values({
      id: card.id,
      userId,
      language: normalizeTrackLanguage(entry.language),
      type: card.type,
      front: card.front,
      back: card.back,
      phonetic: card.phonetic ?? null,
      audioUrl: null,
      sourceEntryId: entry.id,
      tags: JSON.stringify(card.tags),
      fsrs: JSON.stringify(card.fsrs),
    });
    return ok({ card, created: true });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'collectDictionaryEntry',
        entityId: entryId,
      })
    );
  }
}
