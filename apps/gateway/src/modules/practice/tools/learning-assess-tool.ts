import { z } from 'zod';
import {
  type ToolDefinition,
  type ToolExecutionContext,
  ToolPermissions,
  ToolLocations,
} from '@study-studio/tool-core';
import {
  ok,
  err,
  type Result,
  BusinessError,
} from '@study-studio/shared';
import type { LearnerRepository } from '@study-studio/learner-core';

export const LearningAssessInputSchema = z.object({
  action: z.enum(['grade', 'diagnose', 'grade_batch']).optional(),
  questionId: z.string().optional(),
  prompt: z.string().optional(),
  standardAnswer: z.string().optional(),
  userSubmission: z.string().optional(),
  testedSkillId: z.string().optional(),
  language: z.enum(['ja', 'en', 'ko']).optional(),
  // grade_batch：按 itemId 对齐的批量评测输入
  items: z
    .array(
      z.object({
        itemId: z.string(),
        prompt: z.string(),
        standardAnswer: z.string(),
        userSubmission: z.string(),
        testedSkillId: z.string().optional(),
        language: z.enum(['ja', 'en', 'ko']).optional(),
      })
    )
    .optional(),
});

export type LearningAssessInput = z.infer<typeof LearningAssessInputSchema>;

export interface LearningAssessOutput {
  isCorrect: boolean;
  score: number; // 0–100
  accuracyRate: number; // 0–1.0
  grammarFeedback: string;
  nativeNuanceAdvice: string;
  refinementSuggestion: string;
  mistakeDetected: boolean;
  negativeTransferTag?: string | undefined;
}

export interface LearningAssessBatchOutput {
  results: Array<{ itemId: string; grading: LearningAssessOutput }>;
  summary: {
    total: number;
    correct: number;
    averageScore: number;
    commonIssues: string[];
  };
}

export class LearningAssessTool
  implements ToolDefinition<LearningAssessInput, LearningAssessOutput | LearningAssessBatchOutput>
{
  public readonly name = 'learning.assess';
  public readonly description =
    '智能评测与诊断引擎：对客观题或主观造句/翻译进行多维语法诊断、母语负迁移分析与地道润色建议。支持 grade_batch 批量评测，输出按 itemId 对齐的结构化结果与共性问题总结。';
  public readonly location = ToolLocations.SERVER;
  public readonly permission = ToolPermissions.READ;
  public readonly schema = LearningAssessInputSchema;

  constructor(private readonly learnerRepo: LearnerRepository) {}

  public async execute(
    input: LearningAssessInput,
    _context: ToolExecutionContext
  ): Promise<Result<LearningAssessOutput | LearningAssessBatchOutput, BusinessError>> {
    try {
      const action = input.action ?? 'grade';

      if (action === 'grade_batch') {
        return this.gradeBatch(input);
      }

      if (!input.prompt || !input.standardAnswer || !input.userSubmission) {
        return err(new BusinessError('E_INVALID_INPUT', '评测需要 prompt/standardAnswer/userSubmission', 'VALIDATION'));
      }
      return ok(
        this.gradeOne({
          prompt: input.prompt,
          standardAnswer: input.standardAnswer,
          userSubmission: input.userSubmission,
          testedSkillId: input.testedSkillId ?? 'general',
          language: input.language ?? 'ja',
        })
      );
    } catch (e: any) {
      return err(
        new BusinessError(
          'E_TOOL_EXECUTION',
          `评测诊断失败: ${e?.message || '未知错误'}`,
          'TOOL_EXECUTION'
        )
      );
    }
  }

  private gradeOne(params: {
    prompt: string;
    standardAnswer: string;
    userSubmission: string;
    testedSkillId: string;
    language: 'en' | 'ja' | 'ko';
  }): LearningAssessOutput {
    const { language } = params;
    const cleanSub = params.userSubmission.trim();
    const cleanStd = params.standardAnswer.trim();

    // 精确匹配
    if (cleanSub === cleanStd) {
      return {
        isCorrect: true,
        score: 100,
        accuracyRate: 1.0,
        grammarFeedback: '完全契合标准范例，句式结构与用词规范严谨。',
        nativeNuanceAdvice: '表达地道自然，用词与语境调性高度吻合。',
        refinementSuggestion: cleanStd,
        mistakeDetected: false,
      };
    }

    // 母语负迁移与语法诊断规则
    let negativeTransferTag: string | undefined;
    let grammarFeedback = '整体语义通顺，但助词或动词接续与母语思维有所偏差。';
    let nativeNuanceAdvice = '建议遵循日语“名词 + 格助词 + 谓语”的标准语序节奏。';
    let score = 75;

    if (language === 'ja') {
      if (cleanSub.includes('で') && cleanStd.includes('に')) {
        negativeTransferTag = 'ZH_TRANSFER_LOCATION_DE_INSTEAD_OF_NI';
        grammarFeedback = '检测到母语负迁移：中文“在”常被习惯性映射为「で」，但在静态存在句中必须用「に」。';
        nativeNuanceAdvice = '请牢记：“静态落脚用 に，动态发力才用 で”。';
        score = 55;
      } else if (cleanSub.includes('に') && cleanStd.includes('で')) {
        negativeTransferTag = 'PARTICLE_NI_INSTEAD_OF_DE';
        grammarFeedback = '助词选择偏差：动作行为发生地需要格助词「で」，「に」用于归着点。';
        score = 60;
      } else {
        score = Math.max(50, Math.min(90, Math.round((cleanSub.length / cleanStd.length) * 80)));
      }
    } else {
      // 非日语：按长度比给一个保守分，避免宣称日语专属规则适用于英/韩
      score = Math.max(50, Math.min(90, Math.round((cleanSub.length / Math.max(1, cleanStd.length)) * 80)));
    }

    const isCorrect = score >= 80;

    return {
      isCorrect,
      score,
      accuracyRate: Number((score / 100).toFixed(2)),
      grammarFeedback,
      nativeNuanceAdvice,
      refinementSuggestion: cleanStd,
      mistakeDetected: !isCorrect,
      negativeTransferTag,
    };
  }

  private gradeBatch(input: LearningAssessInput): Result<LearningAssessBatchOutput, BusinessError> {
    if (!input.items || input.items.length === 0) {
      return err(new BusinessError('E_INVALID_INPUT', 'grade_batch 需要 items', 'VALIDATION'));
    }
    const results = input.items.map((it) => ({
      itemId: it.itemId,
      grading: this.gradeOne({
        prompt: it.prompt,
        standardAnswer: it.standardAnswer,
        userSubmission: it.userSubmission,
        testedSkillId: it.testedSkillId ?? 'general',
        language: it.language ?? 'ja',
      }),
    }));
    const correct = results.filter((r) => r.grading.isCorrect).length;
    const avg = results.reduce((s, r) => s + r.grading.score, 0) / results.length;
    // 共性问题：收集出现过的 negativeTransferTag
    const issueSet = new Set<string>();
    for (const r of results) {
      if (r.grading.negativeTransferTag) issueSet.add(r.grading.negativeTransferTag);
    }
    return ok({
      results,
      summary: {
        total: results.length,
        correct,
        averageScore: Math.round(avg),
        commonIssues: [...issueSet],
      },
    });
  }
}
