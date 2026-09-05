import type { TrackLanguage } from './language.js';

/** 各域共享的纯工具函数（由 drizzle-learner-repository.ts 原文件级函数搬迁而来，行为不变）。 */

export function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getYesterdayString(todayStr: string): string {
  const d = new Date(`${todayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function safeJsonParse(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function defaultLanguageProfileSeed(language: TrackLanguage) {
  if (language === 'ja') {
    return { studyGoal: 'JLPT_N2', learnerLevel: 'BEGINNER', overallLevel: 'N3-' };
  }
  if (language === 'ko') {
    return { studyGoal: 'TOPIK_I', learnerLevel: 'BEGINNER', overallLevel: 'A1' };
  }
  return { studyGoal: 'CET6', learnerLevel: 'BEGINNER', overallLevel: 'B1' };
}
