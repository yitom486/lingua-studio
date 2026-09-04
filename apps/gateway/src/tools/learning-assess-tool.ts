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
  action: z.enum(['grade', 'diagnose']).optional(),
  questionId: z.string().optional(),
  prompt: z.string(),
  standardAnswer: z.string(),
  userSubmission: z.string(),
  testedSkillId: z.string().optional(),
  language: z.enum(['ja', 'en', 'ko']).optional(),
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

export class LearningAssessTool
  implements ToolDefinition<LearningAssessInput, LearningAssessOutput>
{
  public readonly name = 'learning.assess';
  public readonly description =
    '智能评测与诊断引擎：对客观题或主观造句/翻译进行多维语法诊断、母语负迁移分析与地道润色建议。';
  public readonly location = ToolLocations.SERVER;
  public readonly permission = ToolPermissions.READ;
  public readonly schema = LearningAssessInputSchema;

  constructor(private readonly learnerRepo: LearnerRepository) {}

  public async execute(
    input: LearningAssessInput,
    context: ToolExecutionContext
  ): Promise<Result<LearningAssessOutput, BusinessError>> {
    try {
      const action = input.action ?? 'grade';
      const testedSkillId = input.testedSkillId ?? 'general';
      const language = input.language ?? 'ja';
      const { prompt, standardAnswer, userSubmission } = input;
      const cleanSub = userSubmission.trim();
      const cleanStd = standardAnswer.trim();

      // 精确匹配
      const isExactMatch = cleanSub === cleanStd;
      if (isExactMatch) {
        return ok({
          isCorrect: true,
          score: 100,
          accuracyRate: 1.0,
          grammarFeedback: '完全契合标准范例，句式结构与用词规范严谨。',
          nativeNuanceAdvice: '表达地道自然，用词与语境调性高度吻合。',
          refinementSuggestion: cleanStd,
          mistakeDetected: false,
        });
      }

      // 母语负迁移与语法诊断规则
      let negativeTransferTag: string | undefined;
      let grammarFeedback = '整体语义通顺，但助词或动词接续与母语思维有所偏差。';
      let nativeNuanceAdvice = '建议遵循日语“名词 + 格助词 + 谓语”的标准语序节奏。';
      let score = 75;

      if (language === 'ja') {
        // 中文负迁移：在表示存在的句子里直译“在”为「で」
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
      }

      const isCorrect = score >= 80;

      return ok({
        isCorrect,
        score,
        accuracyRate: Number((score / 100).toFixed(2)),
        grammarFeedback,
        nativeNuanceAdvice,
        refinementSuggestion: cleanStd,
        mistakeDetected: !isCorrect,
        negativeTransferTag,
      });
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
}
