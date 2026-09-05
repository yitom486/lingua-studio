import { eq, and, or, desc, inArray } from 'drizzle-orm';
import {
  ok,
  err,
  type Result,
  BusinessError,
  translateToBusinessError,
  nowIso,
  isOk,
} from '@study-studio/shared';
import type { QuizAttemptRecord } from '@study-studio/learner-core';
import type { Flashcard } from '@study-studio/protocol';
import {
  flashcards,
  quizAttempts,
  quizQuestions,
  INITIAL_CARD_SEEDS,
  INITIAL_EN_CARD_SEEDS,
} from '../../db/index.js';
import type { RepoDeps } from './repo-context.js';
import { normalizeTrackLanguage, inferLanguageFromSkillId } from './language.js';
import { resolveActiveLanguage } from './profile-internals.js';

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

/**
 * 获取题库题目列表 (从 SQLite quiz_questions 表读取)
 */
export async function getQuestions(
  deps: RepoDeps,
  userId: string,
  limit: number = 50,
  langOverride?: string,
  filter?: {
    types?: string[] | undefined;
    difficulty?: number | undefined;
    skillIds?: string[] | undefined;
  }
): Promise<Result<any[], BusinessError>> {
  try {
    const language = langOverride
      ? normalizeTrackLanguage(langOverride)
      : await resolveActiveLanguage(deps, userId);
    const conds = [
      or(eq(quizQuestions.userId, userId), eq(quizQuestions.userId, 'default_user')),
      eq(quizQuestions.language, language),
    ];
    // P5-E4：装配按块选题——题型 / 难度 / 技能过滤
    if (filter?.types && filter.types.length > 0) {
      conds.push(inArray(quizQuestions.type, filter.types));
    }
    if (typeof filter?.difficulty === 'number') {
      conds.push(eq(quizQuestions.difficulty, filter.difficulty));
    }
    if (filter?.skillIds && filter.skillIds.length > 0) {
      conds.push(inArray(quizQuestions.testedSkillId, filter.skillIds));
    }
    let rows = await deps.db
      .select()
      .from(quizQuestions)
      .where(and(...conds))
      .orderBy(desc(quizQuestions.createdAt))
      .limit(limit);

    let mapped = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      type: r.type,
      category: r.category,
      prompt: r.prompt,
      content: r.content,
      options: r.options ? JSON.parse(r.options) : undefined,
      chunks: r.chunks ? JSON.parse(r.chunks) : undefined,
      correctAnswer: r.correctAnswer,
      explanation: r.explanation,
      testedSkill: r.testedSkillId,
      testedSkillId: r.testedSkillId,
      difficulty: r.difficulty,
      createdAt: r.createdAt,
    }));

    // 防串语：历史上曾把 EN 题误写入 ko 分区；按 skillId 前缀再过滤一次
    mapped = mapped.filter((q) => {
      const skill = String(q.testedSkillId || q.testedSkill || '');
      if (!skill) return true;
      return inferLanguageFromSkillId(skill) === language;
    });

    return ok(mapped);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'getQuestions',
        entityId: userId,
      })
    );
  }
}

/**
 * 保存或更新单道题目至 SQLite quiz_questions
 */
export async function saveQuestion(
  deps: RepoDeps,
  question: any
): Promise<Result<void, BusinessError>> {
  try {
    const skillId = question.testedSkill || question.testedSkillId || '';
    const ownerId = question.userId || 'default_user';
    const language = normalizeTrackLanguage(
      question.language ?? (await resolveActiveLanguage(deps, ownerId))
    );
    const existing = await deps.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.id, question.id))
      .limit(1);

    const optionsStr = question.options
      ? typeof question.options === 'string'
        ? question.options
        : JSON.stringify(question.options)
      : null;
    const chunksStr = question.chunks
      ? typeof question.chunks === 'string'
        ? question.chunks
        : JSON.stringify(question.chunks)
      : null;

    if (existing.length > 0) {
      await deps.db
        .update(quizQuestions)
        .set({
          language,
          type: question.type,
          category: question.category,
          prompt: question.prompt,
          content: question.content,
          options: optionsStr,
          chunks: chunksStr,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          testedSkillId: skillId,
          difficulty: question.difficulty ?? 3,
        })
        .where(eq(quizQuestions.id, question.id));
    } else {
      await deps.db.insert(quizQuestions).values({
        id: question.id,
        userId: question.userId || 'default_user',
        language,
        type: question.type,
        category: question.category,
        prompt: question.prompt,
        content: question.content,
        options: optionsStr,
        chunks: chunksStr,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        testedSkillId: skillId,
        difficulty: question.difficulty ?? 3,
        createdAt: question.createdAt || nowIso(),
      });
    }

    return ok(undefined);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'saveQuestion',
        entityId: question.id,
      })
    );
  }
}

/**
 * 批量保存题目至 SQLite
 */
export async function saveQuestions(
  deps: RepoDeps,
  questions: any[]
): Promise<Result<void, BusinessError>> {
  for (const q of questions) {
    const res = await saveQuestion(deps, q);
    if (!isOk(res)) return res;
  }
  return ok(undefined);
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

export async function recordQuizAttempt(
  deps: RepoDeps,
  attempt: QuizAttemptRecord
): Promise<Result<void, BusinessError>> {
  try {
    await deps.db.insert(quizAttempts).values({
      id: attempt.id,
      userId: attempt.userId,
      language: inferLanguageFromSkillId(attempt.testedSkillId),
      questionId: attempt.questionId,
      userAnswer: attempt.userAnswer,
      isCorrect: attempt.isCorrect,
      score: attempt.score,
      timeSpentMs: attempt.timeSpentMs,
      testedSkillId: attempt.testedSkillId,
      createdAt: attempt.createdAt,
    });

    // 自动累计每日做题任务足迹
    await deps.repo.recordDailyActivity(attempt.userId, { quizzes: 1 });

    return ok(undefined);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'recordQuizAttempt',
        entityId: attempt.id,
      })
    );
  }
}
