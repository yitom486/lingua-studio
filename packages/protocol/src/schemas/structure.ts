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
  /** markdown 标题级别（# 数量；解析层给了才有） */
  level: z.number().int().min(1).max(6).optional(),
  /** 以下为版式特征（解析层给了才有；只描述观测，不做判定） */
  /** 相对正文字号比（1.5 = 大 50%）；<=0 或缺失视为未知 */
  relSize: z.number().positive().max(10).optional(),
  /** 是否加粗（含下划线等强调，一律只记观测） */
  bold: z.boolean().optional(),
  /** 是否水平居中 */
  centered: z.boolean().optional(),
  /** 是否独立成行（上下皆为空白） */
  standalone: z.boolean().optional(),
  /** 是否带编号（第N課/①/1./Lesson 3 等） */
  hasNumbering: z.boolean().optional(),
  /** 标签化 PDF 的结构角色（H1..H6/P；无标签文档为空） */
  structRole: z.string().max(16).optional(),
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
