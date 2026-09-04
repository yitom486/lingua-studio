import { z } from 'zod';

export const KanaTypeSchema = z.enum([
  'SEION',       // 清音 (46)
  'DAKUON',      // 浊音 (20)
  'HANDAKUON',   // 半浊音 (5)
  'YOON',        // 拗音 (36)
  'SPECIAL',     // 拨音/促音
]);
export type KanaType = z.infer<typeof KanaTypeSchema>;

export const KanaItemSchema = z.object({
  id: z.string(),
  type: KanaTypeSchema,
  hiragana: z.string(),
  katakana: z.string(),
  romaji: z.string(),
  row: z.string(), // あ行, か行...
  col: z.string(), // あ段, い段...
  mnemonic: z.string().optional(), // 字源与记忆技巧
  audioText: z.string(),
  sortOrder: z.number().int(),
});
export type KanaItem = z.infer<typeof KanaItemSchema>;

export const KanaPracticeInputSchema = z.object({
  kanaId: z.string(),
  isCorrect: z.boolean(),
  scriptType: z.enum(['HIRAGANA', 'KATAKANA', 'ROMAJI']).default('HIRAGANA'),
  timeSpentMs: z.number().nonnegative().default(0),
});
export type KanaPracticeInput = z.infer<typeof KanaPracticeInputSchema>;
