import { z } from 'zod';

export const HangulTypeSchema = z.enum([
  'CONSONANT', // 子音 (14)
  'VOWEL', // 基本母音 (10；ㅐㅔㅚㅟ 暂留此类以保兼容)
  'YVOWEL', // y 系母音 (4)：ㅑㅕㅛㅠ
  'COMPOUND', // 复合母音 (7)：ㅒㅖㅘㅙㅝㅞㅢ（ㅐㅔㅚㅟ 已在 VOWEL，不重复）
  'CODA', // 收音代表音 (7)：ㄱㄴㄷㄹㅁㅂㅇ 的 받침读法与变音要点
]);
export type HangulType = z.infer<typeof HangulTypeSchema>;

export const HangulItemSchema = z.object({
  id: z.string(),
  type: HangulTypeSchema,
  /** 谚文字母本身（如 ㄱ / ㅏ）。 */
  jamo: z.string(),
  /** 字母名（如 기역 / 아）。 */
  name: z.string(),
  /** 修正罗马字（如 g / a）。 */
  romanization: z.string(),
  row: z.string(), // 자음 / 모음
  col: z.string(), // 软腭音 / 舌尖音 / 天·地·人…
  mnemonic: z.string().optional(), // 构形与记忆技巧
  audioText: z.string(),
  sortOrder: z.number().int(),
});
export type HangulItem = z.infer<typeof HangulItemSchema>;

export const HangulPracticeInputSchema = z.object({
  hangulId: z.string(),
  isCorrect: z.boolean(),
  scriptType: z.enum(['CONSONANT', 'VOWEL', 'YVOWEL', 'COMPOUND', 'CODA', 'ROMANIZATION']).default('CONSONANT'),
});
export type HangulPracticeInput = z.infer<typeof HangulPracticeInputSchema>;

/** 回写画像用的谚文脚本分类（含兼容档 ROMANIZATION）。 */
export type HangulScriptType = HangulPracticeInput['scriptType'];
