import { eq, and, asc, desc, or, inArray } from 'drizzle-orm';
import {
  ok,
  err,
  type Result,
  BusinessError,
  translateToBusinessError,
  nowIso,
} from '@study-studio/shared';
import type {
  KanaItem,
  ReadingPassageSet,
  SubmitReadingPractice,
} from '@study-studio/protocol';
import {
  curriculumKana,
  skillMetrics,
  learningContentTemplates,
  documents,
} from '../../db/index.js';
import type { RepoDeps } from './repo-context.js';
import { normalizeTrackLanguage } from './language.js';

/**
 * 课程/阅读域（由 DrizzleLearnerRepository 搬迁而来，行为不变）。
 * 跨域调用一律走 `deps.repo`（接口方法）；同域互调直接调模块函数。
 */

/**
 * 获取五十音课程底座数据，支持按类型过滤
 */
export async function getCurriculumKana(
  deps: RepoDeps,
  type?: string
): Promise<Result<KanaItem[], BusinessError>> {
  try {
    let rows;
    if (type) {
      rows = await deps.db
        .select()
        .from(curriculumKana)
        .where(eq(curriculumKana.type, type))
        .orderBy(asc(curriculumKana.sortOrder));
    } else {
      rows = await deps.db
        .select()
        .from(curriculumKana)
        .orderBy(asc(curriculumKana.sortOrder));
    }

    const items: KanaItem[] = rows.map((r) => ({
      id: r.id,
      type: r.type as any,
      hiragana: r.hiragana,
      katakana: r.katakana,
      romaji: r.romaji,
      row: r.row,
      col: r.col,
      mnemonic: r.mnemonic ?? undefined,
      audioText: r.audioText,
      sortOrder: r.sortOrder,
    }));

    return ok(items);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'getCurriculumKana',
        entityId: type ?? 'ALL',
      })
    );
  }
}

/**
 * 读取 learning.content 内容模板（按 action / language / skill / format 过滤）
 */
export async function listContentTemplates(
  deps: RepoDeps,
  options: {
    action: string;
    language: string;
    skillId?: string | undefined;
    format?: string | undefined;
    genre?: string | undefined;
    limit?: number | undefined;
  }
): Promise<
  Result<
    Array<{
      id: string;
      language: string;
      action: string;
      format: string | null;
      skillId: string | null;
      difficulty: number;
      topic: string | null;
      genre: string | null;
      sortOrder: number;
      payload: Record<string, unknown>;
    }>,
    BusinessError
  >
> {
  try {
    const language = normalizeTrackLanguage(options.language);
    let rows = await deps.db
      .select()
      .from(learningContentTemplates)
      .where(
        and(
          eq(learningContentTemplates.action, options.action),
          eq(learningContentTemplates.language, language)
        )
      )
      .orderBy(asc(learningContentTemplates.sortOrder));

    if (options.format) {
      rows = rows.filter((r) => r.format === options.format);
    }
    if (options.genre) {
      const byGenre = rows.filter((r) => r.genre === options.genre);
      if (byGenre.length > 0) rows = byGenre;
    }
    if (options.skillId) {
      const bySkill = rows.filter((r) => r.skillId === options.skillId);
      if (bySkill.length > 0) {
        rows = bySkill;
      } else if (options.skillId.includes('particle')) {
        const particleRows = rows.filter((r) => r.skillId?.includes('particle'));
        if (particleRows.length > 0) rows = particleRows;
      }
    }

    const mapped = rows.map((r) => ({
      id: r.id,
      language: r.language,
      action: r.action,
      format: r.format,
      skillId: r.skillId,
      difficulty: r.difficulty,
      topic: r.topic,
      genre: r.genre,
      sortOrder: r.sortOrder,
      payload: JSON.parse(r.payload) as Record<string, unknown>,
    }));

    return ok(options.limit ? mapped.slice(0, options.limit) : mapped);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'listContentTemplates',
        entityId: options.action,
      })
    );
  }
}

/**
 * 记录假名练习结果并回写学习者熟练度与每日打卡活动
 */
export async function recordKanaPractice(
  deps: RepoDeps,
  userId: string,
  kanaId: string,
  isCorrect: boolean,
  scriptType: 'HIRAGANA' | 'KATAKANA' | 'ROMAJI' = 'HIRAGANA'
): Promise<Result<{ proficiency: number }, BusinessError>> {
  try {
    const skillId = scriptType === 'KATAKANA' ? 'jp.kana.katakana' : 'jp.kana.hiragana';
    const skillName = scriptType === 'KATAKANA' ? '片假名认读与听写' : '平假名认读与听写';

    const existingRows = await deps.db
      .select()
      .from(skillMetrics)
      .where(and(eq(skillMetrics.userId, userId), eq(skillMetrics.skillId, skillId)))
      .limit(1);

    let totalAttempts = 1;
    let correctAttempts = isCorrect ? 1 : 0;
    let consecutiveErrors = isCorrect ? 0 : 1;

    if (existingRows.length > 0) {
      const row = existingRows[0]!;
      totalAttempts = row.totalAttempts + 1;
      correctAttempts = row.correctAttempts + (isCorrect ? 1 : 0);
      consecutiveErrors = isCorrect ? 0 : row.consecutiveErrors + 1;
    }

    const proficiency = Math.min(
      1.0,
      Math.max(0.05, Number((correctAttempts / totalAttempts).toFixed(2)))
    );

    const status =
      consecutiveErrors >= 2
        ? 'WEAKNESS'
        : proficiency >= 0.85 && totalAttempts >= 5
        ? 'STRENGTH'
        : 'NORMAL';

    await deps.repo.saveSkillMetric(userId, {
      id: skillId,
      dimension: 'VOCABULARY',
      name: skillName,
      proficiency,
      totalAttempts,
      correctAttempts,
      consecutiveErrors,
      status,
      lastPracticedAt: nowIso(),
    });

    // 累计当日学习足迹
    await deps.repo.recordDailyActivity(userId, { quizzes: 1 });

    return ok({ proficiency });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'recordKanaPractice',
        entityId: kanaId,
      })
    );
  }
}

/**
 * 检索阅读理解篇目套题列表 (AI 分级篇目 / 真实新闻)
 */
export async function listReadingSets(
  deps: RepoDeps,
  userId: string,
  origin?: 'ai' | 'news' | 'user_import',
  language?: 'JA' | 'EN' | 'KO'
): Promise<Result<ReadingPassageSet[], BusinessError>> {
  try {
    const userCondition = or(
      eq(documents.userId, userId),
      eq(documents.userId, 'default_user'),
      eq(documents.userId, 'system')
    );

    const rows = await deps.db
      .select()
      .from(documents)
      .where(
        and(
          userCondition,
          inArray(documents.sourceKind, ['ai_generated', 'news', 'user_import'])
        )
      )
      .orderBy(desc(documents.createdAt));

    const sets: ReadingPassageSet[] = rows
      .map((row) => {
        let questions = [];
        if (row.astJson) {
          try {
            const parsed = JSON.parse(row.astJson);
            questions = parsed.questions || [];
          } catch {
            questions = [];
          }
        }
        const itemOrigin =
          row.sourceKind === 'news'
            ? ('news' as const)
            : row.sourceKind === 'ai_generated'
            ? ('ai' as const)
            : ('user_import' as const);

        const upper = row.language.toUpperCase();
        const itemLang =
          upper === 'EN' ? ('EN' as const) : upper === 'KO' ? ('KO' as const) : ('JA' as const);

        return {
          id: row.id,
          origin: itemOrigin,
          title: row.title,
          topic: row.topic || '综合',
          difficulty: (row.difficulty ?? 2) as 1 | 2 | 3 | 4 | 5,
          language: itemLang,
          sourceLabel:
            row.sourcePublisher ||
            (itemOrigin === 'news' ? '合规精选新闻' : 'AI 精选篇目'),
          sourceUrl: row.sourceUrl ?? undefined,
          body: row.content,
          questions,
          createdAt: row.createdAt,
          // P3-B 回填结构化来源元数据
          sourceKind:
            (row.sourceKindDetail as ReadingPassageSet['sourceKind']) ??
            (itemOrigin === 'ai' ? 'ai' : itemOrigin === 'user_import' ? 'user_import' : undefined),
          ...(row.fetchStatus
            ? { fetchStatus: row.fetchStatus as ReadingPassageSet['fetchStatus'] }
            : {}),
          ...(row.newsPublisher ? { publisher: row.newsPublisher } : {}),
        };
      })
      .filter((set) => {
        if (origin && set.origin !== origin) return false;
        if (language && set.language !== language) return false;
        return true;
      });

    return ok(sets);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'listReadingSets',
        entityId: userId,
      })
    );
  }
}

/**
 * 保存或更新阅读理解篇目套题
 */
export async function saveReadingSet(
  deps: RepoDeps,
  userId: string,
  set: ReadingPassageSet
): Promise<Result<ReadingPassageSet, BusinessError>> {
  try {
    const now = nowIso();
    const sourceKind =
      set.origin === 'news' ? 'news' : set.origin === 'ai' ? 'ai_generated' : 'user_import';

    const existing = await deps.db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, set.id))
      .limit(1);

    if (existing.length > 0) {
      await deps.db
        .update(documents)
        .set({
          title: set.title,
          content: set.body,
          astJson: JSON.stringify({ questions: set.questions }),
          topic: set.topic,
          difficulty: set.difficulty,
          sourceUrl: set.sourceUrl ?? null,
          sourcePublisher: set.sourceLabel,
          sourceKindDetail: set.sourceKind ?? null,
          fetchStatus: set.fetchStatus ?? null,
          newsPublisher: set.publisher ?? null,
          updatedAt: now,
        })
        .where(eq(documents.id, set.id));
    } else {
      await deps.db.insert(documents).values({
        id: set.id,
        userId,
        title: set.title,
        sourceKind,
        language: set.language.toLowerCase(),
        content: set.body,
        astJson: JSON.stringify({ questions: set.questions }),
        topic: set.topic,
        difficulty: set.difficulty,
        sourceUrl: set.sourceUrl ?? null,
        sourcePublisher: set.sourceLabel,
        sourceKindDetail: set.sourceKind ?? null,
        fetchStatus: set.fetchStatus ?? null,
        newsPublisher: set.publisher ?? null,
        createdAt: set.createdAt || now,
        updatedAt: now,
      });
    }

    return ok(set);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'saveReadingSet',
        entityId: set.id,
      })
    );
  }
}

/**
 * 记录阅读理解做题成绩，同步更新学情雷达与当日打卡活动
 */
export async function recordReadingPractice(
  deps: RepoDeps,
  userId: string,
  input: SubmitReadingPractice
): Promise<Result<{ proficiency: number }, BusinessError>> {
  try {
    const skillId =
      input.language === 'JA'
        ? 'jp.reading.comprehension'
        : input.language === 'KO'
          ? 'ko.reading.comprehension'
          : 'en.reading.comprehension';
    const skillName =
      input.language === 'JA'
        ? '日语长文阅读与理解'
        : input.language === 'KO'
          ? '韩语阅读理解（扩展预留）'
          : '英语篇章精读与理解';

    const existingRows = await deps.db
      .select()
      .from(skillMetrics)
      .where(and(eq(skillMetrics.userId, userId), eq(skillMetrics.skillId, skillId)))
      .limit(1);

    let totalAttempts = input.totalQuestions;
    let correctAttempts = input.score;
    const isGoodScore = input.score >= Math.ceil(input.totalQuestions * 0.6);
    let consecutiveErrors = isGoodScore ? 0 : 1;

    if (existingRows.length > 0) {
      const row = existingRows[0]!;
      totalAttempts = row.totalAttempts + input.totalQuestions;
      correctAttempts = row.correctAttempts + input.score;
      consecutiveErrors = isGoodScore ? 0 : row.consecutiveErrors + 1;
    }

    const proficiency = Math.min(
      1.0,
      Math.max(0.05, Number((correctAttempts / totalAttempts).toFixed(2)))
    );

    const status =
      consecutiveErrors >= 2
        ? 'WEAKNESS'
        : proficiency >= 0.85 && totalAttempts >= 6
        ? 'STRENGTH'
        : 'NORMAL';

    await deps.repo.saveSkillMetric(userId, {
      id: skillId,
      dimension: 'READING',
      name: skillName,
      proficiency,
      totalAttempts,
      correctAttempts,
      consecutiveErrors,
      status,
      lastPracticedAt: nowIso(),
    });

    // 阅读篇目单独计数；题量仍计入 quizzes 以兼容原有每日目标
    await deps.repo.recordDailyActivity(userId, {
      quizzes: input.totalQuestions,
      reading: 1,
    });

    return ok({ proficiency });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'recordReadingPractice',
        entityId: input.setId,
      })
    );
  }
}
