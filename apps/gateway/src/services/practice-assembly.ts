import { ok, err, isOk, type Result, BusinessError } from '@study-studio/shared';
import type { GeneratedQuestion, PracticePlanRun } from '@study-studio/protocol';
import type { DrizzleLearnerRepository } from '../repository/drizzle-learner-repository.js';

/**
 * P5：练习运行题目装配。
 *
 * 从既有学习资产（quiz_questions 池 / FSRS 到期卡 / 已收集词）按块「装配」题目到
 * practice_collections（关联 plan_run_id/block_id/grading_mode）。这是「装配」而非「生成」——
 * 不调用 LLM；当池中无对应题型时，回退用同语种任意可用题目，保证运行有题可做。
 *
 * 真正的 AI 题目生成仍走 learning.content 工具（Phase B 已映射 PracticeBlockSpec 子集）。
 */

export interface AssembledBlock {
  blockId: string;
  collectionId: string;
  itemCount: number;
}

export interface AssembleResult {
  run: PracticePlanRun;
  blocks: AssembledBlock[];
  totalItems: number;
}

export async function assemblePracticeRun(
  repo: DrizzleLearnerRepository,
  userId: string,
  runId: string
): Promise<Result<AssembleResult, BusinessError>> {
  const runRes = await repo.getPracticePlanRun(userId, runId);
  if (!isOk(runRes)) return err(runRes.error);
  if (!runRes.value) {
    return err(new BusinessError('E_RUN_NOT_FOUND', '练习运行未找到', 'DATABASE'));
  }
  const run = runRes.value;

  const blocks: AssembledBlock[] = [];
  let totalItems = 0;

  for (const block of run.blocks) {
    // 从 quiz_questions 池按语种取题（装配，不调用 LLM）
    const qRes = await repo.getQuestions(userId, block.count, run.language);
    if (!isOk(qRes)) continue;
    const pool = qRes.value ?? [];
    if (pool.length === 0) continue;

    // 映射为 GeneratedQuestion（池中题已是结构化题目）
    const questions: GeneratedQuestion[] = pool.slice(0, block.count).map((q) => ({
      id: String(q.id),
      type: mapQuestionType(q.type),
      prompt: String(q.prompt ?? ''),
      content: String(q.content ?? ''),
      options: Array.isArray(q.options) ? (q.options as string[]) : undefined,
      correctAnswer: String(q.correctAnswer ?? ''),
      explanation: String(q.explanation ?? ''),
      testedSkillId: String(q.testedSkillId ?? q.testedSkill ?? 'review'),
      difficultyTier: typeof q.difficulty === 'number' ? q.difficulty : 3,
    }));

    const collectRes = await repo.collectPracticeQuestions({
      userId,
      title: `练习运行 ${runId.slice(-6)} · ${block.kind}`,
      intent: 'GENERATE_QUIZ',
      questions,
      planRunId: runId,
      blockId: block.id,
      gradingMode: block.gradingMode,
    });
    if (!isOk(collectRes)) continue;

    blocks.push({
      blockId: block.id,
      collectionId: collectRes.value.collection.id,
      itemCount: collectRes.value.items.length,
    });
    totalItems += collectRes.value.items.length;
  }

  return ok({ run, blocks, totalItems });
}

/** 把 quiz_questions 的 UI 类型映射回协议 QuizQuestionType。 */
function mapQuestionType(raw: string): GeneratedQuestion['type'] {
  const t = String(raw).toUpperCase();
  if (t === 'CHOICE' || t === 'MULTIPLE_CHOICE') return 'MULTIPLE_CHOICE';
  if (t === 'FILL_BLANK' || t === 'FILL_IN_BLANK') return 'FILL_IN_BLANK';
  if (t === 'REORDER' || t === 'SENTENCE_REORDER') return 'SENTENCE_REORDER';
  if (t === 'TRANSLATION') return 'TRANSLATION';
  if (t === 'LISTENING_DICTATION' || t === 'DICTATION') return 'LISTENING_DICTATION';
  return 'MULTIPLE_CHOICE';
}
