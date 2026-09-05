import { ok, err, isOk, type Result, BusinessError } from '@study-studio/shared';
import type {
  PracticeBlockSpec,
  PracticeBlockKind,
  GradingMode,
  PracticePlanTemplate,
  PracticePlanRun,
  PracticeItemAttempt,
} from '@study-studio/protocol';

/**
 * P5：可配置练习计划领域纯函数。
 *
 * 不触碰数据库与 UI；只负责规格校验、运行冻结、完成判定与持久化 JSON 的安全反序列化。
 * 所有终态作答仍由仓储原子写入既有 quiz_attempts/错题/打卡，这里不重复计数逻辑。
 */

/** 主观题批量上限：单块 20 题 */
export const SUBJECTIVE_BATCH_MAX_COUNT = 20;
/** 主观题批量字数上限：单块 5000 字 */
export const SUBJECTIVE_BATCH_MAX_CHARS = 5000;

/** 客观题块（默认 AUTO_IMMEDIATE，不应配 AI 批改） */
const OBJECTIVE_KINDS: ReadonlySet<PracticeBlockKind> = new Set([
  'VOCAB_REVIEW',
  'VOCAB_NEW',
  'QUIZ',
]);

/** 必须人工/AI 批改的主观题块（不应配 AUTO_IMMEDIATE） */
const SUBJECTIVE_KINDS: ReadonlySet<PracticeBlockKind> = new Set([
  'TRANSLATION',
  'WRITING',
]);

/** 仅词汇类块允许指定 vocabularySource */
const VOCAB_KINDS: ReadonlySet<PracticeBlockKind> = new Set(['VOCAB_REVIEW', 'VOCAB_NEW']);

const KIND_SET = new Set<string>([
  'VOCAB_REVIEW',
  'VOCAB_NEW',
  'QUIZ',
  'TRANSLATION',
  'DICTATION',
  'READING',
  'WRITING',
]);

const GRADING_SET = new Set<string>(['AUTO_IMMEDIATE', 'AI_IMMEDIATE', 'AI_BATCH']);

export function isPracticeBlockKind(value: unknown): value is PracticeBlockKind {
  return typeof value === 'string' && KIND_SET.has(value);
}

export function isGradingMode(value: unknown): value is GradingMode {
  return typeof value === 'string' && GRADING_SET.has(value);
}

/**
 * 校验单个练习块规格。返回合并后的错误列表（空表示通过）。
 * 规则：
 * - count 1-30; AI_BATCH 主观题块上限 20 题。
 * - 客观题块（VOCAB_* 与 QUIZ）不应配 AI 批改（建议 AUTO_IMMEDIATE）。
 * - 主观题块（TRANSLATION/WRITING）不应配 AUTO_IMMEDIATE。
 * - vocabularySource 仅 VOCAB_* 块允许；translationDirection 仅 TRANSLATION 块允许。
 */
export function validateBlockSpec(block: PracticeBlockSpec): Result<PracticeBlockSpec, BusinessError> {
  const problems: string[] = [];

  if (!Number.isInteger(block.count) || block.count < 1 || block.count > 30) {
    problems.push('题量必须在 1–30 之间');
  }

  // 批量上限：主观题 AI_BATCH 不超过 20 题
  if (
    block.gradingMode === 'AI_BATCH' &&
    SUBJECTIVE_KINDS.has(block.kind) &&
    block.count > SUBJECTIVE_BATCH_MAX_COUNT
  ) {
    problems.push(`主观题批量批改单块上限 ${SUBJECTIVE_BATCH_MAX_COUNT} 题`);
  }

  // 客观题不应走 AI 批改
  if (OBJECTIVE_KINDS.has(block.kind) && block.gradingMode !== 'AUTO_IMMEDIATE') {
    problems.push('客观题块应使用即时自动判定（AUTO_IMMEDIATE）');
  }

  // 主观题不应走 AUTO_IMMEDIATE
  if (SUBJECTIVE_KINDS.has(block.kind) && block.gradingMode === 'AUTO_IMMEDIATE') {
    problems.push('主观题块不能使用即时自动判定（AUTO_IMMEDIATE）');
  }

  // vocabularySource 仅词汇类
  if (block.vocabularySource && !VOCAB_KINDS.has(block.kind)) {
    problems.push('vocabularySource 仅适用于词汇类块（VOCAB_REVIEW/VOCAB_NEW）');
  }

  // translationDirection 仅 TRANSLATION
  if (block.translationDirection && block.kind !== 'TRANSLATION') {
    problems.push('translationDirection 仅适用于 TRANSLATION 块');
  }

  if (problems.length > 0) {
    return err(
      new BusinessError('E_INVALID_BLOCK_SPEC', problems.join('；'), 'VALIDATION')
    );
  }
  return ok(block);
}

/** 校验整份模板（块数 1–8、id 不重复、逐块校验）。 */
export function validatePracticePlanTemplate(
  template: PracticePlanTemplate
): Result<PracticePlanTemplate, BusinessError> {
  if (!Array.isArray(template.blocks) || template.blocks.length < 1 || template.blocks.length > 8) {
    return err(
      new BusinessError('E_INVALID_TEMPLATE', '模板须包含 1–8 个练习块', 'VALIDATION')
    );
  }
  const ids = new Set<string>();
  for (const block of template.blocks) {
    if (ids.has(block.id)) {
      return err(
        new BusinessError('E_INVALID_TEMPLATE', `练习块 id 重复：${block.id}`, 'VALIDATION')
      );
    }
    ids.add(block.id);
    const res = validateBlockSpec(block);
    if (!isOk(res)) {
      return err(
        new BusinessError(
          'E_INVALID_TEMPLATE',
          `块「${block.id}」不合法：${res.error.userMessage}`,
          'VALIDATION'
        )
      );
    }
  }
  return ok(template);
}

/**
 * 从模板冻结一次执行会话：深拷贝块规格、记录 revision，改模板后旧 run 不变。
 */
export function freezeRunFromTemplate(params: {
  template: PracticePlanTemplate;
  runId: string;
  startedAt?: string;
}): PracticePlanRun {
  const { template, runId, startedAt } = params;
  return {
    id: runId,
    userId: template.userId,
    language: template.language,
    templateId: template.id,
    templateRevision: template.revision,
    // 深拷贝块规格，避免与模板共享引用
    blocks: template.blocks.map((b) => ({ ...b, skillIds: b.skillIds ? [...b.skillIds] : undefined, questionFormats: b.questionFormats ? [...b.questionFormats] : undefined, translationDirection: b.translationDirection ? { ...b.translationDirection } : undefined })),
    status: 'IN_PROGRESS',
    startedAt: startedAt ?? new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * 判定运行是否全部完成：所有块的尝试均处于 SUBMITTED 或 GRADED。
 * （SUBMITTED 表示已提交但等待 AI 批改，仍算作「用户侧完成」。）
 */
export function isRunComplete(
  attempts: PracticeItemAttempt[],
  expectedItemIds: string[]
): boolean {
  if (expectedItemIds.length === 0) return false;
  const doneById = new Map<string, PracticeItemAttempt>();
  for (const a of attempts) {
    if (a.status === 'SUBMITTED' || a.status === 'GRADED') {
      doneById.set(a.itemId, a);
    }
  }
  return expectedItemIds.every((id) => doneById.has(id));
}

/** 安全反序列化块规格；损坏输入返回 null，绝不臆造步骤。 */
export function parsePracticeBlockSpec(raw: unknown): PracticeBlockSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== 'string' || !isPracticeBlockKind(rec.kind)) return null;
  if (typeof rec.count !== 'number' || !Number.isFinite(rec.count)) return null;
  if (!isGradingMode(rec.gradingMode)) return null;
  const block: PracticeBlockSpec = {
    id: rec.id,
    kind: rec.kind,
    count: rec.count,
    gradingMode: rec.gradingMode,
  };
  if (typeof rec.title === 'string') block.title = rec.title;
  if (typeof rec.difficulty === 'number' && rec.difficulty >= 1 && rec.difficulty <= 5) {
    block.difficulty = rec.difficulty;
  }
  if (Array.isArray(rec.skillIds) && rec.skillIds.every((s) => typeof s === 'string')) {
    block.skillIds = rec.skillIds as string[];
  }
  if (typeof rec.topic === 'string') block.topic = rec.topic;
  if (
    Array.isArray(rec.questionFormats) &&
    rec.questionFormats.every((q) => typeof q === 'string')
  ) {
    block.questionFormats = rec.questionFormats as PracticeBlockSpec['questionFormats'];
  }
  if (
    rec.translationDirection &&
    typeof rec.translationDirection === 'object' &&
    typeof (rec.translationDirection as Record<string, unknown>).sourceLanguage === 'string' &&
    typeof (rec.translationDirection as Record<string, unknown>).targetLanguage === 'string'
  ) {
    block.translationDirection = rec.translationDirection as {
      sourceLanguage: string;
      targetLanguage: string;
    };
  }
  if (
    typeof rec.vocabularySource === 'string' &&
    (rec.vocabularySource === 'DUE_CARDS' ||
      rec.vocabularySource === 'COLLECTED_WORDS' ||
      rec.vocabularySource === 'TOPIC_WORDS')
  ) {
    block.vocabularySource = rec.vocabularySource;
  }
  return block;
}

/** 安全反序列化模板块数组。 */
export function parsePracticeBlockSpecs(raw: unknown): PracticeBlockSpec[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const blocks: PracticeBlockSpec[] = [];
  for (const item of raw) {
    const b = parsePracticeBlockSpec(item);
    if (!b) return null;
    blocks.push(b);
  }
  return blocks;
}
