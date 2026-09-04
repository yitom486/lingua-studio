import { z } from 'zod';

export const DocumentSourceKindSchema = z.enum([
  'user_import',
  'system',
  'ai_generated',
  'news',
]);
export type DocumentSourceKind = z.infer<typeof DocumentSourceKindSchema>;

export const DocumentItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  sourceKind: DocumentSourceKindSchema,
  language: z.string().default('ja'),
  content: z.string(),
  astJson: z.string().optional(),
  topic: z.string().optional(),
  difficulty: z.number().int().optional(),
  sourceUrl: z.string().optional(),
  sourcePublisher: z.string().optional(),
  examTag: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DocumentItem = z.infer<typeof DocumentItemSchema>;

export const AnnotationKindSchema = z.enum([
  'KEY_POINT',
  'VOCAB',
  'GRAMMAR',
  'EXAM_TRAP',
  'PARAPHRASE',
]);
export type AnnotationKind = z.infer<typeof AnnotationKindSchema>;

export const AnnotationItemSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  userId: z.string(),
  kind: AnnotationKindSchema,
  quote: z.string(),
  note: z.string().optional(),
  startOffset: z.number().int().default(0),
  endOffset: z.number().int().default(0),
  createdBy: z.enum(['USER', 'AGENT']).default('USER'),
  flashcardId: z.string().optional(),
  createdAt: z.string(),
});
export type AnnotationItem = z.infer<typeof AnnotationItemSchema>;

export const CreateAnnotationInputSchema = z.object({
  documentId: z.string(),
  kind: AnnotationKindSchema.default('KEY_POINT'),
  quote: z.string().min(1, '批注摘录不可为空'),
  note: z.string().optional(),
  startOffset: z.number().int().default(0),
  endOffset: z.number().int().default(0),
  createdBy: z.enum(['USER', 'AGENT']).default('USER'),
});
export type CreateAnnotationInput = z.infer<typeof CreateAnnotationInputSchema>;

export const ConvertAnnotationToCardInputSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  tag: z.string().default('课文批注'),
  pos: z.string().default('重点词句'),
  phonetic: z.string().optional(),
});
export type ConvertAnnotationToCardInput = z.infer<typeof ConvertAnnotationToCardInputSchema>;
