import { z } from 'zod';
import {
  type ToolDefinition,
  type ToolExecutionContext,
  ToolPermissions,
  ToolLocations,
} from '@study-studio/tool-core';
import type { GeneratedQuestion, PracticeBlockSpec } from '@study-studio/protocol';
import { PracticeBlockSpecSchema } from '@study-studio/protocol';
import {
  ok,
  err,
  type Result,
  BusinessError,
  generateId,
  isOk,
  nowIso,
} from '@study-studio/shared';
import type { LearnerRepository } from '@study-studio/learner-core';
import {
  DrizzleLearnerRepository,
  inferLanguageFromSkillId,
  normalizeTrackLanguage,
} from '../repository/drizzle-learner-repository.js';

export const LearningContentInputSchema = z.object({
  action: z.enum([
    'generate_quiz',
    'explain',
    'example_set',
    'kana_drill',
    'generate_passage',
    'generate_writing_prompt',
    // P5-E7：按练习计划块规格批量生成（模板驱动，不调 LLM；READING 走篇目链路另行接入）
    'generate_for_block',
  ]),
  count: z.number().int().min(1).max(20).optional(),
  format: z
    .enum([
      'MULTIPLE_CHOICE',
      'FILL_IN_BLANK',
      'SENTENCE_REORDER',
      'KANA_READ',
      'READING_MCQ',
      'TRANSLATION',
      'LISTENING_DICTATION',
      'WRITING_PROMPT',
    ])
    .optional(),
  skillIds: z.array(z.string()).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  language: z.enum(['ja', 'en', 'ko']).optional(),
  topic: z.string().optional(),
  /** translation | email | essay | diary | news_response */
  genre: z.string().optional(),
  /** Persist into practice_collections / practice_items when true */
  collect: z.boolean().optional(),
  collectionTitle: z.string().optional(),
  /** generate_for_block：块规格列表（逐块映射到既有生成路径） */
  blocks: z.array(PracticeBlockSpecSchema).optional(),
});

export type LearningContentInput = z.infer<typeof LearningContentInputSchema>;

export interface LearningContentOutput {
  action: string;
  language: string;
  summary: string;
  questions?: GeneratedQuestion[] | undefined;
  examples?: Array<{ sentence: string; translation: string; grammarPoint: string }> | undefined;
  explanation?: {
    coreConcept: string;
    rules: string[];
    commonMistakes: string[];
    mnemonicTip: string;
  } | undefined;
  passage?: {
    title: string;
    body: string;
    topic: string;
  } | undefined;
  writingPrompts?: Array<{
    id: string;
    category: string;
    chinesePrompt: string;
    contextHint: string;
    testedSkillId: string;
    standardAnswer: string;
    grammarFocus: string;
  }> | undefined;
  dictationItems?: Array<{
    id: string;
    sourceLesson: string;
    speaker: string;
    fullJapanese: string;
    chinese: string;
    blankPrompt: string;
    clozeDisplay: string;
    targetWord: string;
    furiganaHint: string;
    categoryTag: string;
    testedSkillId: string;
    grammarExplanation: string;
  }> | undefined;
  /** generate_for_block：按块对齐的生成结果（questions 为空/errorCode 时由装配层回退） */
  perBlock?: Array<{
    blockId: string;
    kind: string;
    questions?: GeneratedQuestion[];
    errorCode?: string;
  }> | undefined;
  collectionId?: string | undefined;
}

type TemplateRow = {
  id: string;
  language: string;
  action: string;
  format: string | null;
  skillId: string | null;
  difficulty: number;
  topic: string | null;
  genre: string | null;
  sortOrder: number;
  payload: Record<string, unknown>;
};

/** Learner-facing Chinese copy kept as unicode escapes to avoid editor encoding corruption. */
const MSG = {
  description:
    '\u4e07\u80fd\u5916\u8bed\u5b66\u4e60\u5185\u5bb9\u5f15\u64ce\uff1a\u6309\u6559\u5b66\u610f\u56fe\u4ece SQLite \u5185\u5bb9\u6a21\u677f\u5e93\u7ec4\u9898\u3001\u8bb2\u89e3\u3001\u4f8b\u53e5\u3001\u5047\u540d\u5c0f\u6d4b\u6216\u9605\u8bfb\u5199\u4f5c\u6750\u6599\u3002',
  repoUnsupported:
    '\u5f53\u524d\u4ed3\u50a8\u4e0d\u652f\u6301\u5185\u5bb9\u6a21\u677f\u5e93\uff0c\u8bf7\u4f7f\u7528 DrizzleLearnerRepository',
  collectSkip:
    '\uff08\u5f53\u524d\u4ed3\u50a8\u4e0d\u652f\u6301\u7ec3\u4e60\u961f\u5217 collect\uff0c\u5df2\u8df3\u8fc7\u5165\u5e93\uff09',
  practicePrefix: '\u7ec3\u4e60',
  collectedInto: '\u5df2\u6536\u5165\u7ec3\u4e60\u961f\u5217\u300c',
  collectedIntoEnd: '\u300d\u3002',
  emptyQuiz: (lang: string, skill: string) =>
    `\u5185\u5bb9\u6a21\u677f\u5e93\u4e2d\u6682\u65e0 ${lang} / ${skill} \u7684\u7ec3\u4e60\u9898\uff0c\u8bf7\u5148\u79cd\u5b50\u6216\u63a5\u5165 LLM \u751f\u6210`,
  quizSummary: (n: number, skill: string) =>
    `\u5df2\u4ece\u5185\u5bb9\u5e93\u7ec4\u51fa ${n} \u9053\u81ea\u9002\u5e94\u7ec3\u4e60\u9898\uff08${skill}\uff09\u3002`,
  emptyExamples: (lang: string) => `\u5185\u5bb9\u6a21\u677f\u5e93\u4e2d\u6682\u65e0 ${lang} \u4f8b\u53e5\u5305`,
  examplesSummary: (topic: string) =>
    `\u5df2\u4e3a\u8003\u70b9\u3010${topic}\u3011\u4ece\u5185\u5bb9\u5e93\u8f7d\u5165\u5730\u9053\u4f8b\u53e5\u3002`,
  emptyExplain: (lang: string) => `\u5185\u5bb9\u6a21\u677f\u5e93\u4e2d\u6682\u65e0 ${lang} \u8bb2\u89e3\u5927\u7eb2`,
  explainSummary: (topic: string) =>
    `\u9488\u5bf9\u3010${topic}\u3011\u7684\u8bed\u6cd5\u5256\u6790\u5927\u7eb2\u5df2\u4ece\u5185\u5bb9\u5e93\u8f7d\u5165\u3002`,
  emptyKana: 'curriculum_kana \u8bfe\u7a0b\u5e95\u5ea7\u4e3a\u7a7a\uff0c\u65e0\u6cd5\u7ec4\u5047\u540d\u5c0f\u6d4b',
  kanaPrompt: '\u770b\u5047\u540d\u9009\u51fa\u6b63\u786e\u7684\u7f57\u9a6c\u97f3\uff1a',
  kanaSummary: (n: number) =>
    `\u5df2\u4ece curriculum_kana \u7ec4\u51fa ${n} \u9053\u5047\u540d\u8ba4\u8bfb\u9898\u3002`,
  emptyWriting: (lang: string) => `\u5185\u5bb9\u6a21\u677f\u5e93\u4e2d\u6682\u65e0 ${lang} \u5199\u4f5c\u9898\u5e72`,
  writingEmail: (lv: number) => `\u90ae\u4ef6\u5199\u4f5c \u00b7 Lv.${lv}`,
  writingDiary: (lv: number) => `\u65e5\u8bb0\u4f53 \u00b7 Lv.${lv}`,
  writingNews: (lv: number) => `\u8bfb\u540e\u7eed\u5199 \u00b7 Lv.${lv}`,
  writingSummary: (genre: string, n: number) =>
    `\u5df2\u6309\u4f53\u88c1\u300c${genre}\u300d\u4ece\u5185\u5bb9\u5e93\u8f7d\u5165 ${n} \u9053\u5199\u4f5c/\u7ffb\u8bd1\u9898\u5e72\u3002`,
  emptyPassage: (lang: string) => `\u5185\u5bb9\u6a21\u677f\u5e93\u4e2d\u6682\u65e0 ${lang} \u77ed\u6587\u6a21\u677f`,
  passageSummary: (topic: string) =>
    `\u5df2\u6309\u4e3b\u9898\u300c${topic}\u300d\u4ece\u5185\u5bb9\u5e93\u751f\u6210\u5206\u7ea7\u77ed\u6587\u8349\u7a3f\u3002`,
  doneAction: (action: string) => `\u5df2\u5b8c\u6210\u3010${action}\u3011\u5904\u7406\u3002`,
  emptyDictation: (lang: string) => `\u5185\u5bb9\u6a21\u677f\u5e93\u4e2d\u6682\u65e0 ${lang} \u542c\u5199\u9898`,
  dictationSummary: (n: number) =>
    `\u5df2\u4ece\u5185\u5bb9\u5e93\u7ec4\u51fa ${n} \u9053\u6316\u8bcd\u542c\u5199\u9898\u3002`,
  execFailed: (m: string) => `\u5b66\u4e60\u5185\u5bb9\u5f15\u64ce\u6267\u884c\u5931\u8d25: ${m}`,
  coreTopic: '\u6838\u5fc3\u8003\u70b9',
  dailyJa: '\u65e5\u5e38\u751f\u6d3b',
  dailyEn: 'daily life',
} as const;

function resolveContentLanguage(input: LearningContentInput): 'ja' | 'en' | 'ko' {
  const skillId = input.skillIds?.[0];
  if (skillId) return inferLanguageFromSkillId(skillId);
  return normalizeTrackLanguage(input.language);
}

function defaultQuizSkill(language: 'ja' | 'en' | 'ko'): string {
  if (language === 'en') return 'en.grammar.subjunctive';
  if (language === 'ko') return 'ko.grammar.particle_eseo';
  return 'jp.particle.ni_vs_de';
}

function applyPlaceholders(
  text: string,
  vars: { topic: string; difficulty: number }
): string {
  return text
    .replaceAll('{{topic}}', vars.topic)
    .replaceAll('{{difficulty}}', String(vars.difficulty));
}

function pickCycled<T>(items: T[], count: number): T[] {
  if (items.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(items[i % items.length]!);
  }
  return out;
}

/**
 * P5-E7：练习计划块规格 → 既有生成路径的合成输入（模板驱动，不调 LLM）。
 * READING 返回 null：阅读套题走 generate_passage 篇目链路（无独立配题），v1 不在 run 内生成。
 */
export function synthesizeContentInputForBlock(
  block: PracticeBlockSpec,
  language: 'ja' | 'en' | 'ko'
): LearningContentInput | null {
  const base = {
    count: Math.min(block.count, 20),
    difficulty: block.difficulty ?? 2,
    language,
    ...(block.skillIds && block.skillIds.length > 0 ? { skillIds: block.skillIds } : {}),
    ...(block.topic ? { topic: block.topic } : {}),
    collect: false,
  };
  switch (block.kind) {
    case 'QUIZ':
    case 'VOCAB_REVIEW':
    case 'VOCAB_NEW': {
      const quizLike = ['MULTIPLE_CHOICE', 'FILL_IN_BLANK', 'SENTENCE_REORDER'] as const;
      const formats =
        block.questionFormats && block.questionFormats.length > 0
          ? block.questionFormats
          : (['MULTIPLE_CHOICE'] as const);
      const format =
        formats.find((f): f is (typeof quizLike)[number] =>
          (quizLike as readonly string[]).includes(f)
        ) ?? 'MULTIPLE_CHOICE';
      return { ...base, action: 'generate_quiz', format };
    }
    case 'DICTATION':
      return { ...base, action: 'generate_quiz', format: 'LISTENING_DICTATION' };
    case 'TRANSLATION':
      return { ...base, action: 'generate_writing_prompt', genre: 'translation' };
    case 'WRITING':
      return { ...base, action: 'generate_writing_prompt', genre: 'diary' };
    case 'READING':
      return null;
    default:
      return null;
  }
}

export class LearningContentTool
  implements ToolDefinition<LearningContentInput, LearningContentOutput>
{
  public readonly name = 'learning.content';
  public readonly description = MSG.description;
  public readonly location = ToolLocations.SERVER;
  public readonly permission = ToolPermissions.READ;
  public readonly schema = LearningContentInputSchema;

  constructor(private readonly learnerRepo: LearnerRepository) {}

  private requireDrizzle(): Result<DrizzleLearnerRepository, BusinessError> {
    if (!(this.learnerRepo instanceof DrizzleLearnerRepository)) {
      return err(new BusinessError('E_TOOL_UNSUPPORTED', MSG.repoUnsupported, 'TOOL_EXECUTION'));
    }
    return ok(this.learnerRepo);
  }

  private async loadTemplates(
    repo: DrizzleLearnerRepository,
    options: {
      action: string;
      language: string;
      skillId?: string | undefined;
      format?: string | undefined;
      genre?: string | undefined;
    }
  ): Promise<Result<TemplateRow[], BusinessError>> {
    return repo.listContentTemplates(options);
  }

  private async maybeCollect(
    context: ToolExecutionContext,
    input: LearningContentInput,
    language: string,
    questions: GeneratedQuestion[] | undefined,
    summary: string,
    extras?: Partial<LearningContentOutput>
  ): Promise<Result<LearningContentOutput, BusinessError>> {
    const base: LearningContentOutput = {
      action: input.action,
      language,
      summary,
      questions,
      ...extras,
    };

    if (!input.collect || !questions?.length) {
      return ok(base);
    }

    if (!(this.learnerRepo instanceof DrizzleLearnerRepository)) {
      return ok({
        ...base,
        summary: `${summary}${MSG.collectSkip}`,
      });
    }

    const collected = await this.learnerRepo.collectPracticeQuestions({
      userId: context.userId,
      title:
        input.collectionTitle ||
        `${MSG.practicePrefix} ? ${input.action} ? ${nowIso().slice(0, 10)}`,
      intent: 'GENERATE_QUIZ',
      questions,
      sourceRef: input.skillIds?.[0],
    });

    if (!isOk(collected)) {
      return collected;
    }

    return ok({
      ...base,
      summary: `${summary} ${MSG.collectedInto}${collected.value.collection.title}${MSG.collectedIntoEnd}`,
      collectionId: collected.value.collection.id,
    });
  }

  public async execute(
    input: LearningContentInput,
    context: ToolExecutionContext
  ): Promise<Result<LearningContentOutput, BusinessError>> {
    try {
      const drizzle = this.requireDrizzle();
      if (!isOk(drizzle)) return drizzle;
      const repo = drizzle.value;

      const action = input.action;
      const language = resolveContentLanguage(input);
      const count = input.count ?? 1;
      const difficulty = input.difficulty ?? 2;
      const topic = input.topic;
      const skillId = input.skillIds?.[0];

      if (action === 'generate_for_block') {
        return this.generateForBlock(input, context, language);
      }

      switch (action) {
        case 'generate_quiz': {
          if (input.format === 'LISTENING_DICTATION') {
            return this.buildDictation(repo, context, input, language, count, difficulty, skillId);
          }

          const targetSkill = skillId || defaultQuizSkill(language);
          const templates = await this.loadTemplates(repo, {
            action: 'generate_quiz',
            language,
            skillId: targetSkill,
            format: input.format,
          });
          if (!isOk(templates)) return templates;
          if (templates.value.length === 0) {
            return err(
              new BusinessError('E_CONTENT_EMPTY', MSG.emptyQuiz(language, targetSkill), 'TOOL_EXECUTION')
            );
          }

          const picked = pickCycled(templates.value, count);
          const questions: GeneratedQuestion[] = picked.map((row) => {
            const q = (row.payload as { question: Omit<GeneratedQuestion, 'id'> }).question;
            return {
              ...q,
              id: generateId('q_dyn'),
              testedSkillId: targetSkill.includes('particle')
                ? targetSkill
                : q.testedSkillId || targetSkill,
              difficultyTier: difficulty,
            };
          });

          return this.maybeCollect(
            context,
            input,
            language,
            questions,
            MSG.quizSummary(questions.length, targetSkill)
          );
        }

        case 'example_set': {
          const templates = await this.loadTemplates(repo, {
            action: 'example_set',
            language,
            skillId,
          });
          if (!isOk(templates)) return templates;
          const row = templates.value[0];
          if (!row) {
            return err(new BusinessError('E_CONTENT_EMPTY', MSG.emptyExamples(language), 'TOOL_EXECUTION'));
          }
          const targetTopic = topic || row.topic || MSG.coreTopic;
          const examples = (row.payload as { examples: LearningContentOutput['examples'] }).examples;
          return ok({
            action,
            language,
            summary: MSG.examplesSummary(targetTopic),
            examples,
          });
        }

        case 'explain': {
          const templates = await this.loadTemplates(repo, {
            action: 'explain',
            language,
            skillId,
          });
          if (!isOk(templates)) return templates;
          const row = templates.value[0];
          if (!row) {
            return err(new BusinessError('E_CONTENT_EMPTY', MSG.emptyExplain(language), 'TOOL_EXECUTION'));
          }
          const targetTopic = topic || row.topic || MSG.coreTopic;
          const explanation = (
            row.payload as { explanation: LearningContentOutput['explanation'] }
          ).explanation;
          return ok({
            action,
            language,
            summary: MSG.explainSummary(targetTopic),
            explanation,
          });
        }

        case 'kana_drill': {
          const kanaRes = await repo.getCurriculumKana();
          if (!isOk(kanaRes)) return kanaRes;
          const pool = kanaRes.value.filter((k) => k.hiragana && k.romaji);
          if (pool.length < 4) {
            return err(new BusinessError('E_CONTENT_EMPTY', MSG.emptyKana, 'TOOL_EXECUTION'));
          }

          const questions: GeneratedQuestion[] = [];
          const used = new Set<string>();
          for (let i = 0; i < Math.min(count, pool.length); i++) {
            let item = pool[Math.floor(Math.random() * pool.length)]!;
            let guard = 0;
            while (used.has(item.id) && guard < 20) {
              item = pool[Math.floor(Math.random() * pool.length)]!;
              guard++;
            }
            used.add(item.id);

            const distractors = pool
              .filter((k) => k.id !== item.id)
              .sort(() => Math.random() - 0.5)
              .slice(0, 3);
            const options = [item.romaji, ...distractors.map((d) => d.romaji)].sort(() =>
              Math.random() > 0.5 ? 1 : -1
            );

            questions.push({
              id: generateId('q_kana'),
              type: 'MULTIPLE_CHOICE',
              prompt: MSG.kanaPrompt,
              content: `\u300c${item.hiragana}\u300d`,
              options,
              correctAnswer: item.romaji,
              explanation:
                item.mnemonic ||
                `\u5e73\u5047\u540d\u300c${item.hiragana}\u300d\u6807\u51c6\u7f57\u9a6c\u97f3\u4e3a ${item.romaji}\u3002`,
              testedSkillId: 'jp.kana.hiragana',
              difficultyTier: 1,
            });
          }

          return this.maybeCollect(
            context,
            input,
            'ja',
            questions,
            MSG.kanaSummary(questions.length)
          );
        }

        case 'generate_writing_prompt': {
          const genre = input.genre || 'translation';
          const templates = await this.loadTemplates(repo, {
            action: 'generate_writing_prompt',
            language,
            skillId,
            genre,
          });
          if (!isOk(templates)) return templates;
          if (templates.value.length === 0) {
            return err(new BusinessError('E_CONTENT_EMPTY', MSG.emptyWriting(language), 'TOOL_EXECUTION'));
          }

          const picked = pickCycled(templates.value, count);
          const writingPrompts = picked.map((row, i) => {
            const p = (
              row.payload as {
                prompt: Omit<
                  NonNullable<LearningContentOutput['writingPrompts']>[number],
                  'id'
                >;
              }
            ).prompt;
            const category =
              genre === 'email'
                ? MSG.writingEmail(difficulty)
                : genre === 'diary'
                  ? MSG.writingDiary(difficulty)
                  : genre === 'news_response'
                    ? MSG.writingNews(difficulty)
                    : p.category;
            return {
              ...p,
              id: generateId('write'),
              category,
              testedSkillId: i === 0 && skillId ? skillId : p.testedSkillId,
            };
          });

          const questions: GeneratedQuestion[] = writingPrompts.map((p) => ({
            id: p.id,
            type: 'TRANSLATION' as const,
            prompt: p.chinesePrompt,
            content: p.chinesePrompt,
            correctAnswer: p.standardAnswer,
            explanation: p.grammarFocus,
            testedSkillId: p.testedSkillId,
            difficultyTier: difficulty,
          }));

          return this.maybeCollect(
            context,
            input,
            language,
            questions,
            MSG.writingSummary(genre, writingPrompts.length),
            { writingPrompts }
          );
        }

        case 'generate_passage': {
          const templates = await this.loadTemplates(repo, {
            action: 'generate_passage',
            language,
          });
          if (!isOk(templates)) return templates;
          const row = templates.value[0];
          if (!row) {
            return err(new BusinessError('E_CONTENT_EMPTY', MSG.emptyPassage(language), 'TOOL_EXECUTION'));
          }
          const topicLabel =
            topic || row.topic || (language === 'en' ? MSG.dailyEn : language === 'ko' ? '????' : MSG.dailyJa);
          const payload = row.payload as {
            titleTemplate: string;
            bodyTemplate: string;
          };
          return ok({
            action,
            language,
            summary: MSG.passageSummary(topicLabel),
            passage: {
              title: applyPlaceholders(payload.titleTemplate, {
                topic: topicLabel,
                difficulty,
              }),
              body: applyPlaceholders(payload.bodyTemplate, {
                topic: topicLabel,
                difficulty,
              }),
              topic: topicLabel,
            },
          });
        }

        default: {
          if (input.format === 'LISTENING_DICTATION') {
            return this.buildDictation(repo, context, input, language, count, difficulty, skillId);
          }
          return ok({
            action,
            language,
            summary: MSG.doneAction(action),
          });
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'unknown';
      return err(new BusinessError('E_TOOL_EXECUTION', MSG.execFailed(message), 'TOOL_EXECUTION'));
    }
  }

  /**
   * P5-E7：按块规格逐块生成题目（复用既有模板生成路径，collect=false 不自动入库）。
   * 输出按 blockId 对齐；不可生成（READING）或模板缺失时返回 errorCode，由装配层回退。
   */
  private async generateForBlock(
    input: LearningContentInput,
    context: ToolExecutionContext,
    language: 'ja' | 'en' | 'ko'
  ): Promise<Result<LearningContentOutput, BusinessError>> {
    const blocks = input.blocks;
    if (!blocks || blocks.length === 0) {
      return err(new BusinessError('E_INVALID_INPUT', 'generate_for_block 需要 blocks', 'VALIDATION'));
    }
    const perBlock: NonNullable<LearningContentOutput['perBlock']> = [];
    let generated = 0;
    for (const block of blocks) {
      const synth = synthesizeContentInputForBlock(block, language);
      if (!synth) {
        perBlock.push({ blockId: block.id, kind: block.kind, errorCode: 'E_BLOCK_KIND_NOT_GENERABLE' });
        continue;
      }
      const res = await this.execute(synth, context);
      if (!isOk(res)) {
        perBlock.push({ blockId: block.id, kind: block.kind, errorCode: res.error.code });
        continue;
      }
      const questions = res.value.questions ?? [];
      generated += questions.length;
      perBlock.push({ blockId: block.id, kind: block.kind, questions });
    }
    return ok({
      action: 'generate_for_block',
      language,
      summary:
        generated > 0
          ? `\u5df2\u6309\u5757\u89c4\u683c\u751f\u6210 ${generated} \u9053\u7ec3\u4e60\u9898\u3002`
          : '\u6682\u65e0\u53ef\u751f\u6210\u7684\u5757\u9898\u76ee\uff0c\u8bf7\u68c0\u67e5\u5185\u5bb9\u6a21\u677f\u5e93\u3002',
      perBlock,
    });
  }

  private async buildDictation(
    repo: DrizzleLearnerRepository,
    context: ToolExecutionContext,
    input: LearningContentInput,
    language: string,
    count: number,
    difficulty: number,
    skillId?: string
  ): Promise<Result<LearningContentOutput, BusinessError>> {
    const templates = await this.loadTemplates(repo, {
      action: 'dictation',
      language,
      skillId,
      format: 'LISTENING_DICTATION',
    });
    if (!isOk(templates)) return templates;
    if (templates.value.length === 0) {
      return err(new BusinessError('E_CONTENT_EMPTY', MSG.emptyDictation(language), 'TOOL_EXECUTION'));
    }

    const picked = pickCycled(templates.value, count);
    const dictationItems = picked.map((row) => {
      const item = (
        row.payload as {
          item: Omit<NonNullable<LearningContentOutput['dictationItems']>[number], 'id'>;
        }
      ).item;
      return {
        ...item,
        id: generateId('dict'),
        testedSkillId: skillId || item.testedSkillId,
      };
    });

    const questions: GeneratedQuestion[] = dictationItems.map((d) => ({
      id: d.id,
      type: 'LISTENING_DICTATION' as const,
      prompt: d.blankPrompt,
      content: d.clozeDisplay,
      correctAnswer: d.targetWord,
      explanation: d.grammarExplanation,
      testedSkillId: d.testedSkillId,
      difficultyTier: difficulty,
      // P5-E8：完整语料随题走（TTS 播原句；UI 可展示挖空提示）
      dictation: {
        fullJapanese: d.fullJapanese,
        speaker: d.speaker,
        chinese: d.chinese,
        furiganaHint: d.furiganaHint,
      },
    }));

    return this.maybeCollect(
      context,
      input,
      language,
      questions,
      MSG.dictationSummary(dictationItems.length),
      { dictationItems }
    );
  }
}
