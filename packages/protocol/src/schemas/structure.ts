import { z } from 'zod';

/**
 * 文档结构分类契约（mini 分流任务的输入输出形状）。
 * 放 protocol：分类路由直接返回这些形状；网关各层只引用不重定义。
 */
export const HeadingKindSchema = z.enum(['lesson', 'section', 'toc', 'noise']);
export type HeadingKind = z.infer<typeof HeadingKindSchema>;

export const HeadingCandidateSchema = z.object({
  page: z.number().int().positive(),
  text: z.string().min(1).max(80),
});
export type HeadingCandidate = z.infer<typeof HeadingCandidateSchema>;

export const StructureClassSchema = z.object({
  /** 必须与输入候选文本逐字相等（接地键） */
  text: z.string().min(1).max(80),
  page: z.number().int().positive(),
  kind: HeadingKindSchema,
  /** 课序号（kind=lesson 时尽量给；解析不出为空） */
  lessonNo: z.string().max(16).nullable().optional(),
  /** 能力板块（仅当标题明显对应已知技能；不确定为空，绝不猜） */
  skillId: z.string().max(64).nullable().optional(),
});
export type StructureClass = z.infer<typeof StructureClassSchema>;
