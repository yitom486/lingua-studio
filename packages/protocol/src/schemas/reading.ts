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
  language: z.enum(['JA', 'EN']).default('JA'),
  sourceLabel: z.string(),
  sourceUrl: z.string().optional(),
  body: z.string().min(1),
  questions: z.array(ReadingQuestionSchema),
  createdAt: z.string().optional(),
});
export type ReadingPassageSet = z.infer<typeof ReadingPassageSetSchema>;

export const GenerateReadingSetInputSchema = z.object({
  origin: ReadingPassageOriginSchema.default('ai'),
  difficulty: z.number().int().min(1).max(5).default(2),
  language: z.enum(['JA', 'EN']).default('JA'),
  topic: z.string().default('日常生活'),
});
export type GenerateReadingSetInput = z.infer<typeof GenerateReadingSetInputSchema>;

export const SubmitReadingPracticeSchema = z.object({
  setId: z.string(),
  score: z.number().int().min(0),
  totalQuestions: z.number().int().min(1),
  language: z.enum(['JA', 'EN']).default('JA'),
});
export type SubmitReadingPractice = z.infer<typeof SubmitReadingPracticeSchema>;
