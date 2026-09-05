import { eq, and } from 'drizzle-orm';
import {
  ok,
  err,
  type Result,
  BusinessError,
  translateToBusinessError,
  nowIso,
} from '@study-studio/shared';
import type { Flashcard } from '@study-studio/protocol';
import {
  flashcards,
  INITIAL_CARD_SEEDS,
  INITIAL_EN_CARD_SEEDS,
} from '../../../infrastructure/db/index.js';
import type { RepoDeps } from '../../../infrastructure/persistence/repo-context.js';
import { normalizeTrackLanguage } from '../../../infrastructure/persistence/language.js';
import { resolveActiveLanguage } from '../../learning-progress/persistence/profile-internals.js';

/**
 * 复习域持久化：FSRS 闪卡存取（G4：由 repository/domains/cards-questions.ts 拆分而来，行为不变）。
 */
/**
 * 卡片/题库域（由 DrizzleLearnerRepository 搬迁而来，行为不变）。
 * 跨域调用一律走 `deps.repo`（接口方法）；同域互调直接调模块函数。
 */

export async function getDueCards(
  deps: RepoDeps,
  userId: string,
  limit: number = 500,
  options?: { dueOnly?: boolean; language?: string }
): Promise<Result<Flashcard[], BusinessError>> {
  try {
    const now = nowIso();
    const language = options?.language
      ? normalizeTrackLanguage(options.language)
      : await resolveActiveLanguage(deps, userId);
    let rows = await deps.db
      .select()
      .from(flashcards)
      .where(and(eq(flashcards.userId, userId), eq(flashcards.language, language)))
      .limit(limit);

    const demoUser = userId === 'student_web_01' || userId === 'default_user';
    if (rows.length === 0 && demoUser && (language === 'ja' || language === 'en')) {
      const seeds = language === 'en' ? INITIAL_EN_CARD_SEEDS : INITIAL_CARD_SEEDS;
      for (const c of seeds) {
        const fsrsObj = {
          stability: c.stability,
          difficulty: 5.0,
          reps: c.reps,
          lapses: 0,
          dueAt: nowIso(),
          state: c.reps > 0 ? 'REVIEW' : 'NEW',
        };
        const tags = [...c.tags];
        if (c.exampleJp) tags.push(c.exampleJp);
        if (c.exampleZh) tags.push(c.exampleZh);

        await deps.db.insert(flashcards).values({
          id: c.id,
          userId,
          language,
          type: c.type,
          front: c.front,
          back: c.back,
          phonetic: c.phonetic ?? null,
          audioUrl: c.audioUrl ?? null,
          tags: JSON.stringify(tags),
          fsrs: JSON.stringify(fsrsObj),
        });
      }
      rows = await deps.db
        .select()
        .from(flashcards)
        .where(and(eq(flashcards.userId, userId), eq(flashcards.language, language)))
        .limit(limit);
    }

    const cards: Flashcard[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      type: r.type as any,
      front: r.front,
      back: r.back,
      phonetic: r.phonetic ?? undefined,
      audioUrl: r.audioUrl ?? undefined,
      tags: JSON.parse(r.tags),
      fsrs: JSON.parse(r.fsrs),
    }));

    // 如果显式要求仅待复习，则过滤到期卡片；否则返回全量卡片（优先展示待复习）
    if (options?.dueOnly) {
      return ok(cards.filter((c) => !c.fsrs.dueAt || c.fsrs.dueAt <= now));
    }

    cards.sort((a, b) => {
      const aDue = !a.fsrs.dueAt || a.fsrs.dueAt <= now;
      const bDue = !b.fsrs.dueAt || b.fsrs.dueAt <= now;
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      return a.id.localeCompare(b.id);
    });

    return ok(cards);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'getDueCards',
        entityId: userId,
      })
    );
  }
}
export async function saveCard(
  deps: RepoDeps,
  card: Flashcard
): Promise<Result<void, BusinessError>> {
  try {
    const existing = await deps.db
      .select()
      .from(flashcards)
      .where(eq(flashcards.id, card.id))
      .limit(1);

    if (existing.length > 0) {
      await deps.db
        .update(flashcards)
        .set({
          language: normalizeTrackLanguage(
            (card as any).language ?? (await resolveActiveLanguage(deps, card.userId))
          ),
          type: card.type,
          front: card.front,
          back: card.back,
          phonetic: card.phonetic ?? null,
          audioUrl: card.audioUrl ?? null,
          tags: JSON.stringify(card.tags),
          fsrs: JSON.stringify(card.fsrs),
        })
        .where(eq(flashcards.id, card.id));
    } else {
      const language = normalizeTrackLanguage(
        (card as any).language ?? (await resolveActiveLanguage(deps, card.userId))
      );
      await deps.db.insert(flashcards).values({
        id: card.id,
        userId: card.userId,
        language,
        type: card.type,
        front: card.front,
        back: card.back,
        phonetic: card.phonetic ?? null,
        audioUrl: card.audioUrl ?? null,
        tags: JSON.stringify(card.tags),
        fsrs: JSON.stringify(card.fsrs),
      });
    }

    return ok(undefined);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'saveCard',
        entityId: card.id,
      })
    );
  }
}
