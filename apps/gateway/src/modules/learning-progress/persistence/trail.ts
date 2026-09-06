import { and, count, eq } from 'drizzle-orm';
import {
  ok,
  err,
  isOk,
  type Result,
  BusinessError,
  translateToBusinessError,
} from '@study-studio/shared';
import { flashcards, quizAttempts } from '../../../infrastructure/db/index.js';
import type { RepoDeps } from '../../../infrastructure/persistence/repo-context.js';
import type { TrackLanguage } from '../../../infrastructure/persistence/language.js';

/**
 * 新手带路（Beginner Trail）：零基础按天解锁的分阶段清单。
 * 定义为网关侧静态规则（与 proposeTemplateFromSnapshot 同源做法，见 STATIC #37）；
 * 进度全部取自既有学习资产（画像指标 / 闪卡数 / 做题数），不新增表、不写新状态。
 */

export type TrailCriterionKind = 'kana' | 'hangul' | 'cards' | 'quiz' | 'reading';
export type TrailTarget = 'KANA' | 'HANGUL' | 'CARDS' | 'QUIZ' | 'READING';

export interface TrailStageDef {
  id: string;
  /** 建议节奏（第 N 天）；解锁只看前置完成情况，不锁日历 */
  day: string;
  title: string;
  hint: string;
  tab: TrailTarget;
  criterion: { kind: TrailCriterionKind; goal: number };
}

export interface TrailStageStatus extends TrailStageDef {
  progress: number;
  done: boolean;
  locked: boolean;
  current: boolean;
}

export interface BeginnerTrail {
  track: TrackLanguage;
  complete: boolean;
  stages: TrailStageStatus[];
}

const JA_TRAIL: TrailStageDef[] = [
  {
    id: 'ja-1',
    day: '第 1 天',
    title: '开口跟读',
    hint: '去五十音工作室，点字母听发音并跟读，再随手做 3 道小测',
    tab: 'KANA',
    criterion: { kind: 'kana', goal: 3 },
  },
  {
    id: 'ja-2',
    day: '第 2 天',
    title: '清音小测',
    hint: '把 46 个清音认一遍，正确率不重要，先混个脸熟',
    tab: 'KANA',
    criterion: { kind: 'kana', goal: 15 },
  },
  {
    id: 'ja-3',
    day: '第 3 天',
    title: '收藏生词',
    hint: '查词或把单词转成生词卡，攒够 3 张',
    tab: 'CARDS',
    criterion: { kind: 'cards', goal: 3 },
  },
  {
    id: 'ja-4',
    day: '第 4 天',
    title: '第一次做题',
    hint: '做 3 道自适应题，错了会自动进错题本',
    tab: 'QUIZ',
    criterion: { kind: 'quiz', goal: 3 },
  },
  {
    id: 'ja-5',
    day: '第 5 天',
    title: '精读第一篇',
    hint: '读完一篇短文，划词即转生词卡',
    tab: 'READING',
    criterion: { kind: 'reading', goal: 1 },
  },
];

const KO_TRAIL: TrailStageDef[] = [
  {
    id: 'ko-1',
    day: '第 1 天',
    title: '开口跟读',
    hint: '去谚文工作室，点字母听发音并跟读，再随手做 3 道小测',
    tab: 'HANGUL',
    criterion: { kind: 'hangul', goal: 3 },
  },
  {
    id: 'ko-2',
    day: '第 2 天',
    title: '子音小测',
    hint: '把 14 个子音认一遍，正确率不重要，先混个脸熟',
    tab: 'HANGUL',
    criterion: { kind: 'hangul', goal: 15 },
  },
  {
    id: 'ko-3',
    day: '第 3 天',
    title: '收藏生词',
    hint: '查词或把单词转成生词卡，攒够 3 张',
    tab: 'CARDS',
    criterion: { kind: 'cards', goal: 3 },
  },
  {
    id: 'ko-4',
    day: '第 4 天',
    title: '第一次做题',
    hint: '做 3 道自适应题，错了会自动进错题本',
    tab: 'QUIZ',
    criterion: { kind: 'quiz', goal: 3 },
  },
  {
    id: 'ko-5',
    day: '第 5 天',
    title: '精读第一篇',
    hint: '读完一篇 TOPIK 短文，划词即转生词卡',
    tab: 'READING',
    criterion: { kind: 'reading', goal: 1 },
  },
];

const EN_TRAIL: TrailStageDef[] = [
  {
    id: 'en-1',
    day: '第 1 天',
    title: '收藏生词',
    hint: '查 3 个词转成生词卡，复习从此有米下锅',
    tab: 'CARDS',
    criterion: { kind: 'cards', goal: 3 },
  },
  {
    id: 'en-2',
    day: '第 2 天',
    title: '第一次做题',
    hint: '做 3 道自适应题，让系统摸清你的水平',
    tab: 'QUIZ',
    criterion: { kind: 'quiz', goal: 3 },
  },
  {
    id: 'en-3',
    day: '第 3 天',
    title: '精读第一篇',
    hint: '读完一篇外媒短文，划词即转生词卡',
    tab: 'READING',
    criterion: { kind: 'reading', goal: 1 },
  },
];

export function getTrailStages(track: TrackLanguage): TrailStageDef[] {
  if (track === 'ko') return KO_TRAIL;
  if (track === 'en') return EN_TRAIL;
  return JA_TRAIL;
}

/** 画像指标前缀（与 skillMatchesTrack 同源：ja 轨道读 jp.*）。 */
function metricPrefix(track: TrackLanguage): string {
  if (track === 'ko') return 'ko.';
  if (track === 'en') return 'en.';
  return 'jp.';
}

async function countUserCards(deps: RepoDeps, userId: string, track: TrackLanguage): Promise<number> {
  const rows = await deps.db
    .select({ n: count() })
    .from(flashcards)
    .where(and(eq(flashcards.userId, userId), eq(flashcards.language, track)));
  return rows[0]?.n ?? 0;
}

async function countQuizAttempts(
  deps: RepoDeps,
  userId: string,
  track: TrackLanguage
): Promise<number> {
  const rows = await deps.db
    .select({ n: count() })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.language, track)));
  return rows[0]?.n ?? 0;
}

/**
 * 聚合新手带路进度：画像指标取字母/阅读尝试数，卡片/做题走计数查询。
 * 任一上游失败即整体转业务错（带路面无半吊子数据）。
 */
export async function getBeginnerTrail(
  deps: RepoDeps,
  userId: string,
  track: TrackLanguage
): Promise<Result<BeginnerTrail, BusinessError>> {
  try {
    // 画像指标按语种分区存放（skill_metrics.language），必须用带路轨道覆盖 profile 默认语种
    const snapshotRes = await deps.repo.getProfileSnapshot(userId, track);
    if (!isOk(snapshotRes)) return err(snapshotRes.error);
    const metrics = snapshotRes.value.allMetrics ?? [];

    const prefix = metricPrefix(track);
    const kanaAttempts = metrics
      .filter((m) => m.id.startsWith('jp.kana.'))
      .reduce((sum, m) => sum + m.totalAttempts, 0);
    const hangulAttempts = metrics
      .filter((m) => m.id.startsWith('ko.hangul.'))
      .reduce((sum, m) => sum + m.totalAttempts, 0);
    const readingAttempts = metrics
      .filter((m) => m.id === `${prefix}reading.comprehension`)
      .reduce((sum, m) => sum + m.totalAttempts, 0);
    const [cardCount, quizCount] = await Promise.all([
      countUserCards(deps, userId, track),
      countQuizAttempts(deps, userId, track),
    ]);

    const counts: Record<TrailCriterionKind, number> = {
      kana: kanaAttempts,
      hangul: hangulAttempts,
      cards: cardCount,
      quiz: quizCount,
      reading: readingAttempts,
    };

    const stages = getTrailStages(track);
    let currentAssigned = false;
    const statuses: TrailStageStatus[] = stages.map((stage, index) => {
      const raw = counts[stage.criterion.kind] ?? 0;
      const progress = Math.min(raw, stage.criterion.goal);
      const done = raw >= stage.criterion.goal;
      const prevDone = stages.slice(0, index).every((s) => {
        const c = counts[s.criterion.kind] ?? 0;
        return c >= s.criterion.goal;
      });
      const locked = !prevDone;
      const current = !done && !locked && !currentAssigned;
      if (current) currentAssigned = true;
      return { ...stage, progress, done, locked, current };
    });

    return ok({ track, complete: statuses.every((s) => s.done), stages: statuses });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'getBeginnerTrail',
        entityId: userId,
      })
    );
  }
}
