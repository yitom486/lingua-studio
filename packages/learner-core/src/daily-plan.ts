import type { TargetLanguage } from './types.js';

export const DAILY_PLAN_STEP_KINDS = [
  'NEW_WORDS',
  'CARDS',
  'GRAMMAR',
  'READING',
  'QUIZ',
  'MISTAKES',
  'PRACTICE_PLAN',
] as const;

export type DailyPlanStepKind = (typeof DAILY_PLAN_STEP_KINDS)[number];

export type DailyPlanNavigateTarget = 'CARDS' | 'QUIZ' | 'READING' | 'MISTAKES' | 'PRACTICE_PLAN';

/** P5-E3：练习计划 run 步骤的确定性 id（同一天多次读取/完成状态稳定） */
export const PRACTICE_PLAN_STEP_ID = 'step_practice_plan';

/** 持久化模板：不含 live `done`，当日顺序稳定 */
export interface DailyPlanStepTemplate {
  id: string;
  kind: DailyPlanStepKind;
  title: string;
  summary: string;
  navigateTo: DailyPlanNavigateTarget;
  skillId?: string | undefined;
  skillName?: string | undefined;
  targetCount?: number | undefined;
}

export interface DailyPlanStep extends DailyPlanStepTemplate {
  done: boolean;
  currentCount: number;
}

export interface DailyStudyPlan {
  id: string;
  userId: string;
  language: TargetLanguage;
  planDate: string;
  steps: DailyPlanStep[];
  completedCount: number;
  totalCount: number;
  createdAt: string;
}

export interface DailyPlanSignals {
  track: TargetLanguage;
  dailyGoalQuizzes: number;
  dailyGoalCards: number;
  dueCardsCount: number;
  unresolvedMistakesCount: number;
  topWeakness?: { skillId: string; name: string } | undefined;
}

export interface DailyPlanProgressSignals {
  quizzesCount: number;
  cardsReviewedCount: number;
  readingCount: number;
  mistakesResolvedCount: number;
  unresolvedMistakesCount: number;
  completedStepIds: string[];
  /**
   * P5-E3：练习计划 run 进度（活跃 run 或当日已完成 run 时存在）。
   * 由仓储从 practice_plan_runs / practice_item_attempts 聚合，不在 UI 侧累计。
   */
  practicePlan?: { submittedItems: number; totalItems: number } | undefined;
}

const KIND_SET = new Set<string>(DAILY_PLAN_STEP_KINDS);

export function isDailyPlanStepKind(value: unknown): value is DailyPlanStepKind {
  return typeof value === 'string' && KIND_SET.has(value);
}

/**
 * 按教学顺序组当日步骤（最多 5 项）：
 * 到期闪卡优先复习；无到期则改学新词 → 薄弱语法 → 阅读 → 自适应做题 → 未消错题。
 */
export function buildDailyPlanStepTemplates(signals: DailyPlanSignals): DailyPlanStepTemplate[] {
  const steps: DailyPlanStepTemplate[] = [];
  const quizGoal = Math.max(1, signals.dailyGoalQuizzes);
  const cardGoal = Math.max(1, signals.dailyGoalCards);

  if (signals.dueCardsCount > 0) {
    const targetCount = Math.max(1, Math.min(signals.dueCardsCount, cardGoal));
    steps.push({
      id: 'step_cards',
      kind: 'CARDS',
      title: '复习到期闪卡',
      summary: `按 FSRS 处理今日 ${targetCount} 张到期卡片，巩固已学词汇。`,
      navigateTo: 'CARDS',
      targetCount,
    });
  } else {
    steps.push({
      id: 'step_new_words',
      kind: 'NEW_WORDS',
      title: '查词学新词',
      summary: '词典或阅读划词加入生词本，并复习至少 1 张新卡。',
      navigateTo: 'CARDS',
      targetCount: 1,
    });
  }

  if (signals.topWeakness) {
    steps.push({
      id: 'step_grammar',
      kind: 'GRAMMAR',
      title: `攻克薄弱项 · ${signals.topWeakness.name}`,
      summary: '先看一句规则与例句，再做靶向练习，把薄弱点写回学情。',
      navigateTo: 'QUIZ',
      skillId: signals.topWeakness.skillId,
      skillName: signals.topWeakness.name,
      targetCount: 1,
    });
  }

  steps.push({
    id: 'step_reading',
    kind: 'READING',
    title: '精读一篇',
    summary: '完成一篇阅读理解；划词可直接转入 FSRS 生词本。',
    navigateTo: 'READING',
    targetCount: 1,
  });

  steps.push({
    id: 'step_quiz',
    kind: 'QUIZ',
    title: '自适应练习',
    summary: `完成今日 ${quizGoal} 道练习，把做题记录写回技能雷达。`,
    navigateTo: 'QUIZ',
    targetCount: quizGoal,
  });

  if (signals.unresolvedMistakesCount > 0) {
    steps.push({
      id: 'step_mistakes',
      kind: 'MISTAKES',
      title: '错题回炉',
      summary: `待攻克 ${signals.unresolvedMistakesCount} 道；两连对即可出库。`,
      navigateTo: 'MISTAKES',
      targetCount: 1,
    });
  }

  return steps.slice(0, 5);
}

export function overlayDailyPlanProgress(
  templates: DailyPlanStepTemplate[],
  progress: DailyPlanProgressSignals
): DailyPlanStep[] {
  return templates.map((step) => {
    const currentCount = currentCountForStep(step.kind, progress);
    return {
      ...step,
      currentCount,
      done: isStepDone(step, progress, currentCount),
    };
  });
}

/**
 * P5-E3：把用户练习计划 run 追加为今日计划的真实步骤。
 * - 不占用核心 5 步容量（核心教学顺序 slices 后再追加）；
 * - 确定性 id 保证幂等：已存在则原样返回；
 * - 仓储层在「run 晚于计划冻结创建」时调用，使当日新开的 run 也能出现在计划里。
 */
export function appendPracticePlanStep(
  templates: DailyPlanStepTemplate[],
  totalItems: number
): DailyPlanStepTemplate[] {
  if (templates.some((s) => s.id === PRACTICE_PLAN_STEP_ID)) return templates;
  return [
    ...templates,
    {
      id: PRACTICE_PLAN_STEP_ID,
      kind: 'PRACTICE_PLAN',
      title: '完成练习计划',
      summary: '按自定义块组合完成今日练习运行；全部提交后本步自动完成。',
      navigateTo: 'PRACTICE_PLAN',
      targetCount: Math.max(1, totalItems),
    },
  ];
}

export function summarizeDailyStudyPlan(
  id: string,
  userId: string,
  language: TargetLanguage,
  planDate: string,
  createdAt: string,
  templates: DailyPlanStepTemplate[],
  progress: DailyPlanProgressSignals
): DailyStudyPlan {
  const steps = overlayDailyPlanProgress(templates, progress);
  return {
    id,
    userId,
    language,
    planDate,
    steps,
    completedCount: steps.filter((s) => s.done).length,
    totalCount: steps.length,
    createdAt,
  };
}

export function parseDailyPlanStepTemplates(raw: unknown): DailyPlanStepTemplate[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const templates: DailyPlanStepTemplate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== 'string' || !isDailyPlanStepKind(rec.kind)) return null;
    if (typeof rec.title !== 'string' || typeof rec.summary !== 'string') return null;
    if (
      rec.navigateTo !== 'CARDS' &&
      rec.navigateTo !== 'QUIZ' &&
      rec.navigateTo !== 'READING' &&
      rec.navigateTo !== 'MISTAKES' &&
      rec.navigateTo !== 'PRACTICE_PLAN'
    ) {
      return null;
    }
    const template: DailyPlanStepTemplate = {
      id: rec.id,
      kind: rec.kind,
      title: rec.title,
      summary: rec.summary,
      navigateTo: rec.navigateTo,
    };
    if (typeof rec.skillId === 'string') template.skillId = rec.skillId;
    if (typeof rec.skillName === 'string') template.skillName = rec.skillName;
    if (typeof rec.targetCount === 'number' && Number.isFinite(rec.targetCount)) {
      template.targetCount = rec.targetCount;
    }
    templates.push(template);
  }
  return templates;
}

export function parseCompletedStepIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function currentCountForStep(
  kind: DailyPlanStepKind,
  progress: DailyPlanProgressSignals
): number {
  switch (kind) {
    case 'CARDS':
    case 'NEW_WORDS':
      return progress.cardsReviewedCount;
    case 'READING':
      return progress.readingCount;
    case 'QUIZ':
    case 'GRAMMAR':
      return progress.quizzesCount;
    case 'MISTAKES':
      return progress.mistakesResolvedCount;
    case 'PRACTICE_PLAN':
      return progress.practicePlan?.submittedItems ?? 0;
    default:
      return 0;
  }
}

function isStepDone(
  step: DailyPlanStepTemplate,
  progress: DailyPlanProgressSignals,
  currentCount: number
): boolean {
  if (progress.completedStepIds.includes(step.id)) return true;
  const target = Math.max(1, step.targetCount ?? 1);
  switch (step.kind) {
    case 'CARDS':
    case 'NEW_WORDS':
    case 'READING':
    case 'QUIZ':
      return currentCount >= target;
    case 'GRAMMAR':
      return progress.quizzesCount >= 1;
    case 'MISTAKES':
      return progress.mistakesResolvedCount >= 1 || progress.unresolvedMistakesCount === 0;
    case 'PRACTICE_PLAN': {
      const pp = progress.practicePlan;
      return pp !== undefined && pp.totalItems > 0 && pp.submittedItems >= pp.totalItems;
    }
    default:
      return false;
  }
}
