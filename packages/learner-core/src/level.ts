import type { LearnerLevel } from '@study-studio/protocol';

export const LEVEL_ORDER: LearnerLevel[] = ['NOVICE', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

export const LEVEL_LABELS: Record<LearnerLevel, string> = {
  NOVICE: '入门',
  BEGINNER: '初级',
  INTERMEDIATE: '中级',
  ADVANCED: '高级',
};

/**
 * 等级状态机阈值（初版；调参只改这里）。
 * - 升级线：字母累计准确率/量 + 收藏量；做题取连续 3 个活跃日（每天保底 3 题防刷）。
 * - 维持线 = 升级线 × 0.8（回差：94.9% 不反复横跳）。
 * - “记住”v1 按收藏数计；FSRS stability 口径二期收紧（见注释）。
 */
export const LEVEL_THRESHOLDS = {
  /** 字母累计尝试（五十音/谚文认完标志；与 alphabetBasicsDone 同口径）。 */
  alphabetAttempts: 15,
  alphabetAccuracy: 0.95,
  /** 收藏量：记住的代理指标（v1；v2 收紧为 stability≥7 的卡）。 */
  vocabBeginner: 200,
  vocabIntermediate: 800,
  vocabAdvanced: 2000,
  /** 做题连续活跃日。 */
  sustainDays: 3,
  quizIntermediate: 0.85,
  quizAdvanced: 0.9,
  minQuestionsPerDay: 3,
  /** 维持线系数。 */
  sustainRatio: 0.8,
  /** 定级考通过线。 */
  examPass: 0.8,
  examAlphabetQuestions: 15,
  examVocabQuestions: 20,
} as const;

export interface LevelQuizDay {
  date: string;
  correct: number;
  total: number;
}

export interface LevelEvalInput {
  track: 'ja' | 'en' | 'ko';
  currentLevel: LearnerLevel;
  /** 字母累计准确率/尝试（ja/ko；en 传 null，走收藏线）。 */
  alphabet: { accuracy: number; attempts: number } | null;
  /** 收藏总数（单调，只升不降；掉级不看它）。 */
  collectedCount: number;
  /** 按天做题（90 天内即可，取最近活跃日）。 */
  quizDays: LevelQuizDay[];
  /** 当天考过目标档（豁免当日掉级判定）。 */
  examPassToday: boolean;
}

export interface LevelEvalResult {
  newLevel: LearnerLevel;
  changed: boolean;
  direction: 'up' | 'down' | 'none';
  reason: string;
}

function levelIndex(level: LearnerLevel): number {
  const i = LEVEL_ORDER.indexOf(level);
  return i < 0 ? 0 : i;
}

/** 最近 N 个活跃日（有做题的天；按日期倒序取）。 */
function recentActiveDays(days: LevelQuizDay[], n: number): LevelQuizDay[] {
  return [...days]
    .filter((d) => d.total > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, n);
}

function dayAccuracy(day: LevelQuizDay): number {
  return day.total > 0 ? day.correct / day.total : 0;
}

/** 应得最高档（链式：高档要求低档条件全满足；en 无字母项）。 */
function deservedLevel(input: LevelEvalInput): LearnerLevel {
  const t = LEVEL_THRESHOLDS;
  const alphaOk =
    input.alphabet !== null
      ? input.alphabet.accuracy >= t.alphabetAccuracy &&
        input.alphabet.attempts >= t.alphabetAttempts
      : true;
  const recent3 = recentActiveDays(input.quizDays, t.sustainDays);
  const quiz3 = (line: number): boolean =>
    recent3.length >= t.sustainDays &&
    recent3.every((d) => d.total >= t.minQuestionsPerDay && dayAccuracy(d) >= line);

  const toBeginner =
    alphaOk && input.collectedCount >= t.vocabBeginner;
  const toIntermediate =
    toBeginner && quiz3(t.quizIntermediate) && input.collectedCount >= t.vocabIntermediate;
  const toAdvanced =
    toIntermediate && quiz3(t.quizAdvanced) && input.collectedCount >= t.vocabAdvanced;

  if (toAdvanced) return 'ADVANCED';
  if (toIntermediate) return 'INTERMEDIATE';
  if (toBeginner) return 'BEGINNER';
  return 'NOVICE';
}

/** 维持线检查（只看最近一个活跃日；en 的 BEGINNER 无准确率依据，不掉）。 */
function sustains(level: LearnerLevel, input: LevelEvalInput): boolean {
  const t = LEVEL_THRESHOLDS;
  if (level === 'NOVICE') return true;
  if (level === 'BEGINNER') {
    if (input.alphabet === null) return true;
    return input.alphabet.accuracy >= t.alphabetAccuracy * t.sustainRatio;
  }
  const recent1 = recentActiveDays(input.quizDays, 1)[0];
  if (!recent1) return true; // 今天没练，不判定掉级
  const line = level === 'ADVANCED' ? t.quizAdvanced : t.quizIntermediate;
  return dayAccuracy(recent1) >= line * t.sustainRatio;
}

/**
 * 等级转移求值（纯函数）：
 * - 应得高于当前 → 一次只升一档（慢上）；
 * - 最近活跃日跌破维持线 → 降一档（快下；考试通过当天豁免）；
 * - 否则不动。
 */
export function evaluateLevelTransition(input: LevelEvalInput): LevelEvalResult {
  const current = levelIndex(input.currentLevel);
  const deserved = levelIndex(deservedLevel(input));
  if (deserved > current) {
    const newLevel = LEVEL_ORDER[current + 1]!;
    return {
      newLevel,
      changed: true,
      direction: 'up',
      reason: `连续达标，升至${LEVEL_LABELS[newLevel]}`,
    };
  }
  if (deserved < current && !sustains(input.currentLevel, input) && !input.examPassToday) {
    const newLevel = LEVEL_ORDER[current - 1]!;
    return {
      newLevel,
      changed: true,
      direction: 'down',
      reason: `近期未达${LEVEL_LABELS[input.currentLevel]}维持线，回至${LEVEL_LABELS[newLevel]}`,
    };
  }
  return { newLevel: input.currentLevel, changed: false, direction: 'none', reason: '保持' };
}

/** 升级进度说明（“再稳 N 天升级”，供画像页展示）。 */
export function levelProgressHint(input: LevelEvalInput): string {
  if (input.currentLevel === 'ADVANCED') return '已达最高档，保持即可';
  const t = LEVEL_THRESHOLDS;
  if (input.currentLevel === 'NOVICE') {
    const parts: string[] = [];
    if (input.alphabet !== null) {
      parts.push(
        `字母准确率 ${Math.round(input.alphabet.accuracy * 100)}%/95%（${input.alphabet.attempts} 次）`
      );
    }
    parts.push(`收藏 ${input.collectedCount}/${t.vocabBeginner}`);
    return parts.join(' · ') + ` → ${LEVEL_LABELS.BEGINNER}`;
  }
  const next = LEVEL_ORDER[levelIndex(input.currentLevel) + 1]!;
  const line = next === 'INTERMEDIATE' ? t.quizIntermediate : t.quizAdvanced;
  const needVocab = next === 'INTERMEDIATE' ? t.vocabIntermediate : t.vocabAdvanced;
  const recent3 = recentActiveDays(input.quizDays, t.sustainDays);
  const qualified = recent3.filter(
    (d) => d.total >= t.minQuestionsPerDay && dayAccuracy(d) >= line
  ).length;
  const needDays = Math.max(0, t.sustainDays - qualified);
  const needWords = Math.max(0, needVocab - input.collectedCount);
  const bits: string[] = [];
  if (needDays > 0) bits.push(`再稳 ${needDays} 天（≥${Math.round(line * 100)}%）`);
  if (needWords > 0) bits.push(`再收 ${needWords} 词`);
  if (bits.length === 0) return `已达${LEVEL_LABELS[next]}线，结算即升`;
  return `${bits.join('，')} → ${LEVEL_LABELS[next]}`;
}
