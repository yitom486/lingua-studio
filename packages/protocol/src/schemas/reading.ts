import { z } from 'zod';

export const ReadingPassageOriginSchema = z.enum(['ai', 'news', 'user_import']);
export type ReadingPassageOrigin = z.infer<typeof ReadingPassageOriginSchema>;

export const ReadingQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string().min(1),
  options: z.array(
    z.object({
      key: z.string(),
      text: z.string(),
    })
  ),
  correctAnswer: z.string(),
  explanation: z.string(),
});
export type ReadingQuestion = z.infer<typeof ReadingQuestionSchema>;

export const ReadingPassageSetSchema = z.object({
  id: z.string(),
  origin: ReadingPassageOriginSchema,
  title: z.string().min(1),
  topic: z.string().default('综合'),
  difficulty: z.number().int().min(1).max(5).default(2),
  /** JA | EN | KO（KO 为扩展预留；初期内容可仍为英文媒体脚手架） */
  language: z.enum(['JA', 'EN', 'KO']).default('EN'),
  sourceLabel: z.string(),
  sourceUrl: z.string().optional(),
  body: z.string().min(1),
  questions: z.array(ReadingQuestionSchema),
  createdAt: z.string().optional(),
  /**
   * 结构化来源类型，供 UI 与持久层判定展示与版权策略（P3-B）。
   * - full_text: 命中原文页正文（仅当前会话返回，不持久化整篇第三方正文）
   * - rss_summary: 公开 RSS 摘要（可持久化，附原文链接）
   * - offline_template: 全部来源失败后的合规学习模板
   * - ai: AI 自适应生成篇目
   * - user_import: 用户自行导入
   * 缺省时由 origin/sourceLabel 兜底推断，保证旧数据兼容。
   */
  sourceKind: z
    .enum(['full_text', 'rss_summary', 'offline_template', 'ai', 'user_import'])
    .optional(),
  /**
   * 抓取状态，仅当 origin==='news' 时有意义（P3-B）。
   * - ok: 成功获取
   * - network_failed: HTTP/网络失败
   * - empty: 源可用但无条目
   * - timeout: 超时
   */
  fetchStatus: z.enum(['ok', 'network_failed', 'empty', 'timeout']).optional(),
  /** 命中的 RSS 发布方（如 BBC News / NHK ONE / 연합뉴스），用于来源署名展示 */
  publisher: z.string().optional(),
});
export type ReadingPassageSet = z.infer<typeof ReadingPassageSetSchema>;

export const GenerateReadingSetInputSchema = z.object({
  origin: ReadingPassageOriginSchema.default('ai'),
  difficulty: z.number().int().min(1).max(5).default(2),
  language: z.enum(['JA', 'EN', 'KO']).default('EN'),
  topic: z.string().default('education and media literacy'),
});
export type GenerateReadingSetInput = z.infer<typeof GenerateReadingSetInputSchema>;

export const SubmitReadingPracticeSchema = z.object({
  setId: z.string(),
  score: z.number().int().min(0),
  totalQuestions: z.number().int().min(1),
  language: z.enum(['JA', 'EN', 'KO']).default('EN'),
});
export type SubmitReadingPractice = z.infer<typeof SubmitReadingPracticeSchema>;
