import { z } from 'zod';

export const CardTypeSchema = z.enum(['VOCABULARY', 'GRAMMAR', 'CONFUSION_PAIR']);
export type CardType = z.infer<typeof CardTypeSchema>;

export const CardReviewRatingSchema = z.enum(['AGAIN', 'HARD', 'GOOD', 'EASY']);
export type CardReviewRating = z.infer<typeof CardReviewRatingSchema>;

export const CardReviewPayloadSchema = z.object({
  cardId: z.string(),
  rating: CardReviewRatingSchema,
  timeSpentMs: z.number().nonnegative(),
});
export type CardReviewPayload = z.infer<typeof CardReviewPayloadSchema>;

export const FlashcardSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: CardTypeSchema,
  front: z.string(),
  back: z.string(),
  phonetic: z.string().optional(),
  audioUrl: z.string().optional(),
  tags: z.array(z.string()),
  /** 讲透时间（M2 学习门：NEW 卡须先讲透才进练习池；review 首刷不强制）。 */
  studiedAt: z.string().optional(),
  fsrs: z.object({
    stability: z.number(),
    difficulty: z.number(),
    reps: z.number(),
    lapses: z.number(),
    lastReviewedAt: z.string().optional(),
    dueAt: z.string(),
    state: z.enum(['NEW', 'LEARNING', 'REVIEW', 'RELEARNING']),
  }),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;
