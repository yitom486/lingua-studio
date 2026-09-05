import { ok, err, isOk, type Result, BusinessError } from '@study-studio/shared';
import type { Flashcard, GeneratedQuestion, PracticeBlockSpec, PracticePlanRun } from '@study-studio/protocol';
import type { DrizzleLearnerRepository } from '../repository/drizzle-learner-repository.js';
import type { LearningContentInput, LearningContentOutput } from '../tools/learning-content-tool.js';

/**
 * P5：练习运行题目装配。
 *
 * 按块语义装配到 practice_collections（关联 plan_run_id/block_id/grading_mode）。
 * P5-E7 块语义链（差距 7 核心）：
 * 1. VOCAB_REVIEW/VOCAB_NEW → 从 FSRS 闪卡装配词义选择题（到期卡优先 / 新卡优先），不复制 FSRS 状态；
 * 2. QUIZ/TRANSLATION/DICTATION/WRITING → 先按题型（+难度）从 quiz_questions 池精选；
 * 3. 池不足 → 经 learning.content `generate_for_block` 模板驱动补齐（不调 LLM，语种模板缺失则跳过）；
 * 4. 仍不足 → 回退同语种任意可用题；
 * 5. 全链为空 → 记入 skippedBlocks 显式上报（不再静默跳块）。
 * 6. 跨块去重：同一 run 内同一道题不重复装入。
 *
 * READING 块 v1 仍回退客观题（阅读篇目套题链路另行接入）。
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

/** learning.content 工具的结构化最小契约（避免装配层依赖完整 ToolDefinition）。 */
export type ContentToolLike = {
  execute(
    input: LearningContentInput,
    context: { userId: string; sessionId: string }
  ): Promise<Result<LearningContentOutput, BusinessError>>;
};

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

const isVocabBlock = (block: PracticeBlockSpec) =>
  block.kind === 'VOCAB_REVIEW' || block.kind === 'VOCAB_NEW';

/** P5-E7：从 FSRS 闪卡装配词义选择题（front→选 back；干扰项取其他卡的 back）。 */
export function buildVocabQuestionsFromCards(
  cards: Flashcard[],
  count: number,
  language: 'en' | 'ja' | 'ko'
): GeneratedQuestion[] {
  const usable = cards.filter((c) => c.front && c.back);
  const out: GeneratedQuestion[] = [];
  const skillPrefix = language === 'ja' ? 'jp' : language;
  for (let i = 0; i < Math.min(count, usable.length); i++) {
    const card = usable[i]!;
    const distractors = usable
      .filter((c) => c.id !== card.id && c.back !== card.back)
      .slice(0, 3);
    if (distractors.length < 2) break;
    const opts = [card.back, ...distractors.map((d) => d.back)];
    const rot = i % opts.length;
    const options = [...opts.slice(rot), ...opts.slice(0, rot)];
    out.push({
      id: `vocab_${card.id}`,
      type: 'MULTIPLE_CHOICE',
      prompt: '选出正确的词义 / 用法',
      content: card.front,
      options,
      correctAnswer: card.back,
      explanation: card.tags.filter(Boolean).join(' · ') || '来自你的 FSRS 生词本',
      testedSkillId: `${skillPrefix}.vocab.review`,
      difficultyTier: 3,
    });
  }
  return out;
}

export async function assemblePracticeRun(
  repo: DrizzleLearnerRepository,
  userId: string,
  runId: string,
  contentTool?: ContentToolLike | undefined
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
    const candidates: GeneratedQuestion[] = [];
    const pushFresh = (list: GeneratedQuestion[]) => {
      for (const q of list) {
        if (!usedQuestionIds.has(q.id)) candidates.push(q);
      }
    };

    // 1) VOCAB 块：从 FSRS 闪卡装配（REVIEW→到期卡优先；NEW→新卡优先）
    if (isVocabBlock(block)) {
      const cardsRes = await repo.getDueCards(userId, block.count * 4 + 8, {
        language: run.language,
        dueOnly: block.kind === 'VOCAB_REVIEW',
      });
      let cards = isOk(cardsRes) ? (cardsRes.value ?? []) : [];
      if (block.kind === 'VOCAB_NEW') {
        cards = cards.filter((c) => c.fsrs.state === 'NEW');
        if (cards.length === 0) cards = isOk(cardsRes) ? (cardsRes.value ?? []) : [];
      }
      pushFresh(buildVocabQuestionsFromCards(cards, block.count, run.language));
    }

    // 2) 题型（+难度）池精选
    if (candidates.length < block.count) {
      const wantedTypes = acceptedDbTypesForBlock(block);
      const fetchLimit = block.count * 4 + 8;
      const typedRes = await repo.getQuestions(userId, fetchLimit, run.language, {
        types: wantedTypes,
        difficulty: block.difficulty,
      });
      let pool = isOk(typedRes) ? (typedRes.value ?? []) : [];
      // 难度过严 → 放宽难度，保留题型
      if (pool.length < block.count && typeof block.difficulty === 'number') {
        const relaxedRes = await repo.getQuestions(userId, fetchLimit, run.language, {
          types: wantedTypes,
        });
        if (isOk(relaxedRes)) {
          const relaxedPool = relaxedRes.value ?? [];
          if (relaxedPool.length > pool.length) pool = relaxedPool;
        }
      }
      pushFresh(pool.map(mapPoolQuestion));
    }

    // 3) 模板驱动生成补齐（不调 LLM；模板缺失自动跳过）
    if (candidates.length < block.count && contentTool && !isVocabBlock(block)) {
      const genRes = await contentTool.execute(
        { action: 'generate_for_block', language: run.language, blocks: [block] },
        { userId, sessionId: 'practice_assembly' }
      );
      if (isOk(genRes)) {
        const first = genRes.value.perBlock?.[0];
        pushFresh(first?.questions ?? []);
      }
    }

    // 4) 同语种任意题兜底
    if (candidates.length < block.count) {
      const anyRes = await repo.getQuestions(userId, block.count * 4 + 8, run.language);
      if (isOk(anyRes)) pushFresh((anyRes.value ?? []).map(mapPoolQuestion));
    }

    const selected = candidates.slice(0, block.count);
    if (selected.length === 0) {
      skippedBlocks.push({ blockId: block.id, kind: block.kind });
      continue;
    }
    for (const q of selected) usedQuestionIds.add(q.id);

    const collectRes = await repo.collectPracticeQuestions({
      userId,
      title: `练习运行 ${runId.slice(-6)} · ${block.kind}`,
      intent: 'GENERATE_QUIZ',
      questions: selected,
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

/** 把 quiz_questions 池行映射为协议 GeneratedQuestion。 */
function mapPoolQuestion(q: any): GeneratedQuestion {
  return {
    id: String(q.id),
    type: mapQuestionType(q.type),
    prompt: String(q.prompt ?? ''),
    content: String(q.content ?? ''),
    options: Array.isArray(q.options) ? (q.options as string[]) : undefined,
    correctAnswer: String(q.correctAnswer ?? ''),
    explanation: String(q.explanation ?? ''),
    testedSkillId: String(q.testedSkillId ?? q.testedSkill ?? 'review'),
    difficultyTier: typeof q.difficulty === 'number' ? q.difficulty : 3,
  };
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
