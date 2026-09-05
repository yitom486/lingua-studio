import { z } from 'zod';
import {
  type ToolDefinition,
  type ToolExecutionContext,
  ToolPermissions,
  ToolLocations,
} from '@study-studio/tool-core';
import { ok, err, type Result, BusinessError } from '@study-studio/shared';
import type { DailyStudyPlan, LearnerRepository } from '@study-studio/learner-core';

export const LearningPlanInputSchema = z.object({
  action: z.enum(['get', 'complete_step']),
  stepId: z.string().optional(),
  date: z.string().optional(),
});
export type LearningPlanInput = z.infer<typeof LearningPlanInputSchema>;

/**
 * 当日学习计划：读取冻结步骤顺序，或把某一步记为已完成。
 * 完成态优先由打卡/FSRS/错题实时叠加；complete_step 用于无法自动计量的步骤。
 */
export class LearningPlanTool implements ToolDefinition<LearningPlanInput, DailyStudyPlan> {
  public readonly name = 'learning.plan';
  public readonly description =
    '获取今日学习计划，或将某一步标记完成。步骤会跳转到闪卡、阅读、做题或错题工作台，不另起独立课程。';
  public readonly location = ToolLocations.SERVER;
  public readonly permission = ToolPermissions.WRITE;
  public readonly schema = LearningPlanInputSchema;

  constructor(private readonly learnerRepo: LearnerRepository) {}

  public async execute(
    input: LearningPlanInput,
    context: ToolExecutionContext
  ): Promise<Result<DailyStudyPlan, BusinessError>> {
    if (input.action === 'get') {
      return this.learnerRepo.getOrCreateDailyStudyPlan(context.userId, input.date);
    }

    if (!input.stepId) {
      return err(new BusinessError('E_INVALID_INPUT', '标记完成需要 stepId', 'VALIDATION'));
    }
    return this.learnerRepo.completeDailyPlanStep(context.userId, input.stepId, input.date);
  }
}
