import { ok, err, isOk, type Result, BusinessError, translateToBusinessError } from '@study-studio/shared';
import type { LearnerRepository } from '@study-studio/learner-core';
import type { PracticeItemAttempt, PracticePlanRun } from '@study-studio/protocol';

/**
 * P5-PhaseD：练习运行汇总与下次建议（可审计、模型不可用回退本地规则）。
 *
 * 不变量：
 * - 只读：只读取 run + attempts，不写任何学习状态。
 * - 模型不可用不伪造：失败时回退本地规则汇总，`source` 标记为 `local`，`failureReason` 记录原因。
 */

export interface RunSummaryReport {
  runId: string;
  userId: string;
  language: 'en' | 'ja' | 'ko';
  source: 'ai' | 'local';
  summary: string;
  totalItems: number;
  submittedCount: number;
  gradedCount: number;
  correctCount: number;
  averageScore: number;
  commonIssues: string[];
  nextPlanSuggestions: string[];
  generatedAt: string;
  failureReason?: string | undefined;
}

export interface SummarizeOptions {
  repo: LearnerRepository;
  userId: string;
  runId: string;
}

/** 读取运行与尝试，生成汇总（本地规则；AI 增强可后续叠加，仍走同一回退）。 */
export async function summarizePracticeRun(
  opts: SummarizeOptions
): Promise<Result<RunSummaryReport, BusinessError>> {
  const { repo, userId, runId } = opts;
  try {
    const runRes = await repo.getPracticePlanRun(userId, runId);
    if (!isOk(runRes)) return runRes;
    if (!runRes.value) {
      return err(new BusinessError('E_RUN_NOT_FOUND', '练习运行未找到', 'DATABASE'));
    }
    const run = runRes.value as PracticePlanRun;

    const attemptsRes = await repo.listPracticeItemAttempts(runId);
    if (!isOk(attemptsRes)) return attemptsRes;
    const attempts = attemptsRes.value as PracticeItemAttempt[];

    return ok(buildLocalRunSummary(run, attempts));
  } catch (error) {
    return err(
      translateToBusinessError(error, { category: 'DATABASE', action: 'summarizePracticeRun', entityId: runId })
    );
  }
}

/** 本地规则汇总：从 attempts 确定性统计。 */
export function buildLocalRunSummary(
  run: PracticePlanRun,
  attempts: PracticeItemAttempt[]
): RunSummaryReport {
  const totalItems = run.blocks.reduce((s, b) => s + b.count, 0);
  const submitted = attempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'GRADED');
  const graded = attempts.filter((a) => a.status === 'GRADED');
  let correct = 0;
  let scoreSum = 0;
  const issueBag = new Map<string, number>();

  for (const a of graded) {
    const g = (a.gradingResult ?? {}) as Record<string, unknown>;
    if (g.isCorrect === true) correct++;
    const score = typeof g.score === 'number' ? g.score : undefined;
    if (typeof score === 'number') scoreSum += score;
    const issues = Array.isArray(g.issues) ? (g.issues as unknown[]) : undefined;
    if (issues) {
      for (const iss of issues) {
        if (typeof iss === 'string') {
          issueBag.set(iss, (issueBag.get(iss) ?? 0) + 1);
        }
      }
    }
  }

  const averageScore = graded.length > 0 ? Math.round((scoreSum / graded.length) * 10) / 10 : 0;
  const commonIssues = [...issueBag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);

  const suggestions: string[] = [];
  if (totalItems > 0 && submitted.length < totalItems) {
    suggestions.push(`尚有 ${totalItems - submitted.length} 题未提交，建议继续完成后复盘。`);
  }
  if (graded.length > 0 && correct / graded.length < 0.6) {
    suggestions.push('正确率偏低，建议针对错题再做一轮靶向练习。');
  }
  if (commonIssues.length > 0) {
    suggestions.push(`高频问题：${commonIssues.join('、')}；下次计划可加相关靶向块。`);
  }
  if (suggestions.length === 0) {
    suggestions.push('本次完成质量良好，可按原计划继续推进。');
  }

  const accuracy = graded.length > 0 ? Math.round((correct / graded.length) * 100) : 0;
  const summary = `共 ${totalItems} 题，已提交 ${submitted.length}，已批改 ${graded.length}，正确 ${correct}（${accuracy}%）。`;

  return {
    runId: run.id,
    userId: run.userId,
    language: run.language,
    source: 'local',
    summary,
    totalItems,
    submittedCount: submitted.length,
    gradedCount: graded.length,
    correctCount: correct,
    averageScore,
    commonIssues,
    nextPlanSuggestions: suggestions,
    generatedAt: new Date().toISOString(),
  };
}
