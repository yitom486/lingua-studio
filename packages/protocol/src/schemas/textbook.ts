import { z } from 'zod';
import { ok, err, Result, BusinessError } from '@study-studio/shared';

export const TextbookVocabularySchema = z.object({
  id: z.string(),
  kanji: z.string(),
  kana: z.string(),
  romaji: z.string().optional(),
  pos: z.string().default('名词'),
  pitchAccent: z.string().default('⓪'),
  chinese: z.string(),
  example: z
    .object({
      japanese: z.string(),
      chinese: z.string(),
    })
    .optional(),
});
export type TextbookVocabulary = z.infer<typeof TextbookVocabularySchema>;

export const TextbookGrammarSchema = z.object({
  id: z.string(),
  title: z.string(),
  connection: z.string(),
  explanation: z.string(),
  examples: z.array(
    z.object({
      japanese: z.string(),
      chinese: z.string(),
    })
  ),
});
export type TextbookGrammar = z.infer<typeof TextbookGrammarSchema>;

export const DialogueWordSchema = z.object({
  surface: z.string(),
  reading: z.string().optional(),
  meaning: z.string().optional(),
  pos: z.string().optional(),
});
export type DialogueWord = z.infer<typeof DialogueWordSchema>;

export const DialogueLineSchema = z.object({
  speaker: z.string(),
  japanese: z.string(),
  chinese: z.string(),
  words: z.array(DialogueWordSchema).optional(),
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const ExerciseItemSchema = z.object({
  id: z.string(),
  type: z.enum(['CHOICE', 'FILL_BLANK', 'TRANSLATION']),
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  answer: z.string(),
  explanation: z.string().optional(),
});
export type ExerciseItem = z.infer<typeof ExerciseItemSchema>;

export const TextbookLessonSchema = z.object({
  id: z.string(),
  lessonNumber: z.number().int().positive(),
  title: z.string(),
  summary: z.string().optional(),
  vocabularies: z.array(TextbookVocabularySchema),
  grammarPoints: z.array(TextbookGrammarSchema),
  dialogues: z.array(DialogueLineSchema),
  exercises: z.array(ExerciseItemSchema).optional().default([]),
});
export type TextbookLesson = z.infer<typeof TextbookLessonSchema>;

export const TextbookASTSchema = z.object({
  id: z.string(),
  title: z.string(),
  shortTitle: z.string(),
  level: z.string().default('N5'),
  publisher: z.string().optional(),
  description: z.string().optional(),
  totalLessons: z.number().int().positive().optional(),
  lessons: z.array(TextbookLessonSchema).min(1),
});
export type TextbookAST = z.infer<typeof TextbookASTSchema>;

/**
 * 安全解析教材 AST 数据，遵循 Result<T, BusinessError> 规范
 */
export function parseTextbookAST(raw: unknown): Result<TextbookAST, BusinessError> {
  const parsed = TextbookASTSchema.safeParse(raw);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return err(
      new BusinessError(
        'E_INVALID_TEXTBOOK_AST',
        `教材结构化格式不符合规范: ${errorDetails}`,
        'VALIDATION'
      )
    );
  }
  return ok(parsed.data);
}
