import { z } from 'zod';

export const QuizQuestionTypeSchema = z.enum([
  'MULTIPLE_CHOICE',
  'FILL_IN_BLANK',
  'SENTENCE_REORDER',
  'TRANSLATION',
  'LISTENING_DICTATION',
]);
export type QuizQuestionType = z.infer<typeof QuizQuestionTypeSchema>;

export const GeneratedQuestionSchema = z.object({
  id: z.string(),
  type: QuizQuestionTypeSchema,
  prompt: z.string(),
  content: z.string(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string(),
  acceptableVariants: z.array(z.string()).optional(),
  explanation: z.string(),
  testedSkillId: z.string(),
  difficultyTier: z.number().min(1).max(5).default(3),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export const QuizSubmitPayloadSchema = z.object({
  questionId: z.string(),
  userSubmission: z.string(),
  timeSpentMs: z.number().nonnegative(),
});
export type QuizSubmitPayload = z.infer<typeof QuizSubmitPayloadSchema>;

export const ErrorDiagnosisSchema = z.object({
  category: z.enum([
    'PARTICLE',
    'TENSE',
    'WORD_CHOICE',
    'SYNTAX',
    'COLLOCATION',
    'PRONUNCIATION',
    'OTHER',
  ]),
  description: z.string(),
  motherTongueInterference: z.string().optional(),
});
export type ErrorDiagnosis = z.infer<typeof ErrorDiagnosisSchema>;

export const QuizGradingResultSchema = z.object({
  questionId: z.string(),
  isCorrect: z.boolean(),
  score: z.number().min(0).max(100),
  correctAnswer: z.string(),
  userSubmission: z.string(),
  explanation: z.string(),
  errorDiagnosis: ErrorDiagnosisSchema.optional(),
  refinementSuggestion: z.string().optional(),
  followUpTip: z.string().optional(),
  mistakeRecorded: z.boolean().default(false),
});
export type QuizGradingResult = z.infer<typeof QuizGradingResultSchema>;
