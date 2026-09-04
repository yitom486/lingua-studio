import { z } from 'zod';
import { GeneratedQuestionSchema } from './quiz.js';

export const PracticeLayoutHintSchema = z.enum([
  'SPLIT_PASSAGE_QUESTIONS',
  'SINGLE_COLUMN',
]);
export type PracticeLayoutHint = z.infer<typeof PracticeLayoutHintSchema>;

export const PracticeCollectionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  intent: z.string(),
  layoutHint: PracticeLayoutHintSchema.optional(),
  sourceRef: z.string().optional(),
  createdAt: z.string(),
});
export type PracticeCollection = z.infer<typeof PracticeCollectionSchema>;

export const PracticeItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  collectionId: z.string(),
  question: GeneratedQuestionSchema,
  skillIds: z.array(z.string()).default([]),
  sourceRef: z.string().optional(),
  passageDocumentId: z.string().optional(),
  sortOrder: z.number().int().nonnegative().default(0),
  collectedAt: z.string(),
});
export type PracticeItem = z.infer<typeof PracticeItemSchema>;

export const CreatePracticeCollectionInputSchema = z.object({
  userId: z.string(),
  title: z.string().min(1),
  intent: z.string().default('GENERATE_QUIZ'),
  layoutHint: PracticeLayoutHintSchema.optional(),
  sourceRef: z.string().optional(),
  questions: z.array(GeneratedQuestionSchema).min(1).max(20),
});
export type CreatePracticeCollectionInput = z.infer<
  typeof CreatePracticeCollectionInputSchema
>;

/** 用户勾选练习队列条目 → 显式转入 FSRS（≠ collect 自动建卡） */
export const ConvertPracticeItemsToCardsInputSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1).max(50),
});
export type ConvertPracticeItemsToCardsInput = z.infer<
  typeof ConvertPracticeItemsToCardsInputSchema
>;

export const ConvertPracticeItemsToCardsResultSchema = z.object({
  createdCount: z.number().int().nonnegative(),
  cardIds: z.array(z.string()),
  skippedItemIds: z.array(z.string()).default([]),
});
export type ConvertPracticeItemsToCardsResult = z.infer<
  typeof ConvertPracticeItemsToCardsResultSchema
>;
