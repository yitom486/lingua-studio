import { z } from 'zod';

/**
 * P4-C：AI 学习分析能力产品化协议。
 *
 * Gateway 组装不可变学习快照，经 AgentAdapter 请求模型，结果以结构化建议返回。
 * AI 结论不能直接覆盖分数/FSRS/掌握度——分析报告只含「建议」，任何状态变更仍由领域命令执行。
 * 模型不可用时回退上次可信分析或本地规则建议。
 */

export const LearningAnalysisSourceSchema = z.enum(['ai', 'cached', 'local-rules']);

export const LearningSuggestionKindSchema = z.enum([
  'WEAKNESS',
  'PLAN',
  'TIP',
  'ENCOURAGEMENT',
]);

export const LearningSuggestionSchema = z.object({
  kind: LearningSuggestionKindSchema,
  title: z.string(),
  detail: z.string(),
  /** 关联技能 id（WEAKNESS 类建议可附带） */
  skillId: z.string().optional(),
});

export const LearningAnalysisReportSchema = z.object({
  userId: z.string(),
  language: z.string(),
  /** 建议来源：ai=本次模型生成；cached=缓存命中（上次可信）；local-rules=模型不可用时的本地规则回退 */
  source: LearningAnalysisSourceSchema,
  suggestions: z.array(LearningSuggestionSchema),
  /** 一句话总览，供 UI 顶部展示 */
  summary: z.string(),
  generatedAt: z.string(),
  /** 生成本次报告所用模型（source=local-rules 时缺省） */
  model: z.string().optional(),
  /** 缓存过期时间（ISO）；过期后下次请求触发重算 */
  expiresAt: z.string().optional(),
});

export type LearningAnalysisSource = z.infer<typeof LearningAnalysisSourceSchema>;
export type LearningSuggestionKind = z.infer<typeof LearningSuggestionKindSchema>;
export type LearningSuggestion = z.infer<typeof LearningSuggestionSchema>;
export type LearningAnalysisReport = z.infer<typeof LearningAnalysisReportSchema>;
