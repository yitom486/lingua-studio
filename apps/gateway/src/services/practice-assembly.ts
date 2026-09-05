import { ok, err, isOk, type Result, BusinessError } from '@study-studio/shared';
import type { GeneratedQuestion, PracticeBlockSpec, PracticePlanRun } from '@study-studio/protocol';
import type { DrizzleLearnerRepository } from '../repository/drizzle-learner-repository.js';

/**
 * P5：练习运行题目装配。
 *
 * 从既有学习资产（quiz_questions 池）按块「装配」题目到 practice_collections
 * （关联 plan_run_id/block_id/grading_mode）。这是「装配」而非「生成」——不调用 LLM。
 *
 * P5-E4 按块规格选题：
 * 1. 块的 questionFormats（或 kind 默认题型）映射为 DB 题型过滤，先按 difficulty 精选；
 * 2. 难度过严时放宽难度但保留题型；题型完全无题时回退同语种任意可用题；
 * 3. 跨块去重：同一 run 内同一道题不重复装入两个块；
 * 4. 题池彻底为空时不再静默跳块，而是记入 skippedBlocks 由 UI 显式提示。
 *
 * 真正的 AI 题目生成仍走 learning.content 工具（差距 4 待接线）。
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
  /** 因题池为空而未能装配的块（显式上报，UI 据此提示） */
  skippedBlocks: Array<{ blockId: string; kind: string }>;
}

/** 块规格 → quiz_questions 池可接受的 DB 题型集合。 */
export function acceptedDbTypesForBlock(block: PracticeBlockSpec): string[] {
  const formats =
    block.questionFormats && block.questionFormats.length > 0
      ? block.questionFormats
      : defaultFormatsForKind(block.kind);
  return [...new Set(formats.map(quizTypeToDbType))];
}

function defaultFormatsForKind(kind: PracticeBlockSpec['kind']): GeneratedQuestion['type'][] {
  switch (kind) {
    case 'QUIZ':
      return ['MULTIPLE_CHOICE', 'FILL_IN_BLANK', 'SENTENCE_REORDER'];
    case 'VOCAB_REVIEW':
    case 'VOCAB_NEW':
      return ['MULTIPLE_CHOICE', 'FILL_IN_BLANK'];
    case 'TRANSLATION':
    case 'WRITING':
      return ['TRANSLATION'];
    case 'DICTATION':
      return ['LISTENING_DICTATION'];
    case 'READING':
      return ['MULTIPLE_CHOICE', 'FILL_IN_BLANK'];
    default:
      return ['MULTIPLE_CHOICE', 'FILL_IN_BLANK', 'SENTENCE_REORDER'];
  }
}

function quizTypeToDbType(t: GeneratedQuestion['type']): string {
  switch (t) {
    case 'MULTIPLE_CHOICE':
      return 'CHOICE';
    case 'FILL_IN_BLANK':
      return 'FILL_BLANK';
    case 'SENTENCE_REORDER':
      return 'REORDER';
    case 'TRANSLATION':
      return 'TRANSLATION';
    case 'LISTENING_DICTATION':
      return 'DICTATION';
    default:
      return 'CHOICE';
  }
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
  const skippedBlocks: Array<{ blockId: string; kind: string }> = [];
  // 同一 run 内跨块去重：同一道题不重复装入
  const usedQuestionIds = new Set<string>();
  let totalItems = 0;

  for (const block of run.blocks) {
    const wantedTypes = acceptedDbTypesForBlock(block);
    const fetchLimit = block.count * 4 + 8;

    // 1) 题型 + 难度精选
    let pool: any[] = [];
    const typedRes = await repo.getQuestions(userId, fetchLimit, run.language, {
      types: wantedTypes,
      difficulty: block.difficulty,
    });
    if (isOk(typedRes)) pool = typedRes.value ?? [];

    // 2) 难度过严 → 放宽难度，保留题型
    if (pool.length < block.count && typeof block.difficulty === 'number') {
      const relaxedRes = await repo.getQuestions(userId, fetchLimit, run.language, {
        types: wantedTypes,
      });
      if (isOk(relaxedRes)) {
        const relaxedPool = relaxedRes.value ?? [];
        if (relaxedPool.length > pool.length) pool = relaxedPool;
      }
    }

    // 3) 题型无题 → 回退同语种任意可用题
    if (pool.length === 0) {
      const anyRes = await repo.getQuestions(userId, fetchLimit, run.language);
      if (isOk(anyRes)) pool = anyRes.value ?? [];
    }

    const selected = pool.filter((q) => !usedQuestionIds.has(String(q.id))).slice(0, block.count);
    if (selected.length === 0) {
      skippedBlocks.push({ blockId: block.id, kind: block.kind });
      continue;
    }
    for (const q of selected) usedQuestionIds.add(String(q.id));

    // 映射为 GeneratedQuestion（池中题已是结构化题目）
    const questions: GeneratedQuestion[] = selected.map((q) => ({
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

  return ok({ run, blocks, totalItems, skippedBlocks });
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
