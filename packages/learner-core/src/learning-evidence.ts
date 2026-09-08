import type { SkillMetric, TargetLanguage } from './types.js';

/** 仅描述记录到的练习表现，不估算整体语言能力或考试等级。 */
export function summarizeLearningEvidence(metrics: SkillMetric[], language: TargetLanguage) {
  const prefix = language === 'ja' ? 'jp.' : language + '.';
  const skills = metrics.filter(m => m.id.startsWith(prefix) &&
    Number.isInteger(m.totalAttempts) && m.totalAttempts > 0 &&
    Number.isInteger(m.correctAttempts) && m.correctAttempts >= 0 && m.correctAttempts <= m.totalAttempts
  ).map(m => ({ skillId: m.id, name: m.name, attempts: m.totalAttempts,
    correct: m.correctAttempts, accuracy: m.correctAttempts / m.totalAttempts,
    ...(m.lastPracticedAt ? { lastPracticedAt: m.lastPracticedAt } : {}) }));
  const attempts = skills.reduce((n, s) => n + s.attempts, 0);
  const correct = skills.reduce((n, s) => n + s.correct, 0);
  return { status: attempts > 0 ? 'observed' as const : 'unassessed' as const,
    attempts, correct, accuracy: attempts > 0 ? correct / attempts : null,
    observedSkillCount: skills.length, skills,
    limitation: '仅为已练内容的累计正确率；未测能力未知，不能推断总体掌握度、字符覆盖率或 JLPT/CEFR 等级。' };
}
