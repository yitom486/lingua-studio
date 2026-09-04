import { z } from 'zod';
import {
  type ToolDefinition,
  type ToolExecutionContext,
  ToolPermissions,
  ToolLocations,
} from '@study-studio/tool-core';
import {
  type GeneratedQuestion,
  GeneratedQuestionSchema,
} from '@study-studio/protocol';
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
import { DrizzleLearnerRepository } from '../repository/drizzle-learner-repository.js';

export const LearningContentInputSchema = z.object({
  action: z.enum([
    'generate_quiz',
    'explain',
    'example_set',
    'kana_drill',
    'generate_passage',
    'generate_writing_prompt',
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
  /** 写作体裁：translation | email | essay | diary | news_response */
  genre: z.string().optional(),
  /** 是否将生成题写入 practice_collections / practice_items */
  collect: z.boolean().optional(),
  collectionTitle: z.string().optional(),
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
  collectionId?: string | undefined;
}

export class LearningContentTool
  implements ToolDefinition<LearningContentInput, LearningContentOutput>
{
  public readonly name = 'learning.content';
  public readonly description =
    '万能外语学习内容引擎：按教学意图生成靶向题目、词法剖析大纲、地道例句包、假名小测或阅读写作材料。';
  public readonly location = ToolLocations.SERVER;
  public readonly permission = ToolPermissions.READ;
  public readonly schema = LearningContentInputSchema;

  constructor(private readonly learnerRepo: LearnerRepository) {}

  private async maybeCollect(
    context: ToolExecutionContext,
    input: LearningContentInput,
    questions: GeneratedQuestion[] | undefined,
    summary: string,
    extras?: Partial<LearningContentOutput>
  ): Promise<Result<LearningContentOutput, BusinessError>> {
    const base: LearningContentOutput = {
      action: input.action,
      language: input.language ?? 'ja',
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
        summary: `${summary}（当前仓储不支持练习队列 collect，已跳过入库）`,
      });
    }

    const collected = await this.learnerRepo.collectPracticeQuestions({
      userId: context.userId,
      title: input.collectionTitle || `练习 · ${input.action} · ${nowIso().slice(0, 10)}`,
      intent: 'GENERATE_QUIZ',
      questions,
      sourceRef: input.skillIds?.[0],
    });

    if (!isOk(collected)) {
      return collected;
    }

    return ok({
      ...base,
      summary: `${summary} 已写入练习队列「${collected.value.collection.title}」。`,
      collectionId: collected.value.collection.id,
    });
  }

  public async execute(
    input: LearningContentInput,
    context: ToolExecutionContext
  ): Promise<Result<LearningContentOutput, BusinessError>> {
    try {
      const action = input.action;
      const language = input.language ?? 'ja';
      const count = input.count ?? 1;
      const difficulty = input.difficulty ?? 2;
      const topic = input.topic;

      switch (action) {
        case 'generate_quiz': {
          if (input.format === 'LISTENING_DICTATION') {
            const dictationItems = [
              {
                id: generateId('dict'),
                sourceLesson: '自适应听写 · 终助词',
                speaker: '小野',
                fullJapanese: '李さんは中国人ですか。',
                chinese: '小李是中国人吗？',
                blankPrompt: '听录音，填入句尾疑问助词：',
                clozeDisplay: '李さんは中国人です（　）。',
                targetWord: 'か',
                furiganaHint: 'ka',
                categoryTag: '疑问终助词',
                testedSkillId: input.skillIds?.[0] || 'jp.particle.ka',
                grammarExplanation: '终助词「か」附在句尾表示疑问。',
              },
              {
                id: generateId('dict'),
                sourceLesson: '自适应听写 · 场所格',
                speaker: '王',
                fullJapanese: '昨日の夜、静かなカフェで本を読みました。',
                chinese: '昨天晚上，我在安静的咖啡馆读了书。',
                blankPrompt: '听录音，填入动作发生场所格助词：',
                clozeDisplay: '昨日の夜、静かなカフェ（　）本を読みました。',
                targetWord: 'で',
                furiganaHint: 'de',
                categoryTag: '场所格助词辨析',
                testedSkillId: input.skillIds?.[0] || 'jp.particle.ni_vs_de',
                grammarExplanation: '动态动作发生场所用「で」。',
              },
              {
                id: generateId('dict'),
                sourceLesson: '自适应听写 · 所属格',
                speaker: '李',
                fullJapanese: 'これは日本語の教科書です。',
                chinese: '这是日语教科书。',
                blankPrompt: '听录音，填入名词之间的所属格助词：',
                clozeDisplay: 'これは日本語（　）教科書です。',
                targetWord: 'の',
                furiganaHint: 'no',
                categoryTag: '连体格助词',
                testedSkillId: 'jp.particle.no',
                grammarExplanation: '格助词「の」连接两个名词表示所属。',
              },
            ].slice(0, count);

            const questions: GeneratedQuestion[] = dictationItems.map((d) => ({
              id: d.id,
              type: 'LISTENING_DICTATION' as const,
              prompt: d.blankPrompt,
              content: d.clozeDisplay,
              correctAnswer: d.targetWord,
              explanation: d.grammarExplanation,
              testedSkillId: d.testedSkillId,
              difficultyTier: difficulty,
            }));

            return this.maybeCollect(
              context,
              input,
              questions,
              `已生成 ${dictationItems.length} 道挖词听写题。`,
              { dictationItems }
            );
          }

          const skillId = input.skillIds?.[0] || 'jp.particle.ni_vs_de';
          const questions: GeneratedQuestion[] = [];

          for (let i = 0; i < count; i++) {
            const qId = generateId('q_dyn');
            if (skillId.includes('particle')) {
              questions.push({
                id: qId,
                type: 'MULTIPLE_CHOICE',
                prompt: '选择最恰当的格助词填入括号：',
                content:
                  i % 2 === 0
                    ? '明日、友人と駅前のカフェ（　）日本語を勉強します。'
                    : '図書館の静かな角（　）辞書が置いてあります。',
                options: ['で', 'に', 'を', 'へ'],
                correctAnswer: i % 2 === 0 ? 'で' : 'に',
                explanation:
                  i % 2 === 0
                    ? '「勉強する」为动态行为动作，场所用「で」。'
                    : '「置いてある」表示物体的静态存在归着状态，场所用「に」。',
                testedSkillId: skillId,
                difficultyTier: difficulty,
              });
            } else {
              questions.push({
                id: qId,
                type: 'MULTIPLE_CHOICE',
                prompt: `针对考点【${skillId}】进行理解测试：`,
                content: `この文の適切な用法を選びなさい。（難度 Lv.${difficulty}）`,
                options: ['正しい用法 A', '誤用 B', '誤用 C', '誤用 D'],
                correctAnswer: '正しい用法 A',
                explanation: `考点【${skillId}】的标准语法接续与语义规范。`,
                testedSkillId: skillId,
                difficultyTier: difficulty,
              });
            }
          }

          return this.maybeCollect(
            context,
            input,
            questions,
            `已按难度 Lv.${difficulty} 成功生成 ${questions.length} 道针对【${skillId}】的测试题。`
          );
        }

        case 'example_set': {
          const targetTopic = topic || '助词与谓语动词搭配';
          const examples = [
            {
              sentence: '日曜日、静かなカフェで本を読みます。',
              translation: '星期天在安静的咖啡馆读书。',
              grammarPoint: '格助词「で」表示动作发生的动态场所。',
            },
            {
              sentence: '机の上に日本語の辞書があります。',
              translation: '桌子上有日语词典。',
              grammarPoint: '格助词「に」表示无生命物体的静态存在场所。',
            },
            {
              sentence: '来月、京都へ旅行に行きます。',
              translation: '下个月去京都旅行。',
              grammarPoint: '格助词「へ」(读作e)表示移动动作所朝向的方向。',
            },
          ];

          return ok({
            action,
            language,
            summary: `已为考点【${targetTopic}】精选 3 个地道生活化例句。`,
            examples,
          });
        }

        case 'explain': {
          const targetTopic = topic || '助词辨析与易混考点';
          return ok({
            action,
            language,
            summary: `针对【${targetTopic}】的权威语法剖析大纲已准备就绪。`,
            explanation: {
              coreConcept:
                '日语格助词的核心在于区分【作用力发散的动作场所(で)】与【静止归着的存在坐标(に)】。',
              rules: [
                '1. 动态谓语（読む、食べる、勉強する）+ で',
                '2. 静态存在（ある、いる、住む、座る）+ に',
                '3. 趋向移动（行く、来る、帰る）+ に/へ',
              ],
              commonMistakes: [
                '误将「部屋で本がある」用于存在句（正确为：部屋に本がある）',
                '误在动作场所句遗漏「で」',
              ],
              mnemonicTip: '“人在动，就用で；物在立，牢记に；去某地，奔向へ。”',
            },
          });
        }

        case 'kana_drill': {
          const questions: GeneratedQuestion[] = [
            {
              id: generateId('q_kana'),
              type: 'MULTIPLE_CHOICE',
              prompt: '看假名选出正确的罗马音：',
              content: '「あ」',
              options: ['a', 'i', 'u', 'e'],
              correctAnswer: 'a',
              explanation: '平假名「あ」源自汉字草书「安」，标准发音罗马音为 a。',
              testedSkillId: 'jp.kana.hiragana',
              difficultyTier: 1,
            },
            {
              id: generateId('q_kana'),
              type: 'MULTIPLE_CHOICE',
              prompt: '看平假名选出对应的片假名：',
              content: '「か」',
              options: ['カ', 'キ', 'ク', 'ケ'],
              correctAnswer: 'カ',
              explanation: '平假名「か」对应的片假名为「カ」，源自汉字「加」之偏旁。',
              testedSkillId: 'jp.kana.katakana',
              difficultyTier: 1,
            },
          ];

          return this.maybeCollect(context, input, questions, '已生成假名认读与听写练习。');
        }

        case 'generate_writing_prompt': {
          const genre = input.genre || 'translation';
          const skillId = input.skillIds?.[0] || 'jp.particle.ni_vs_de';
          const bank = [
            {
              category: '日文长句翻译 · 动作场所',
              chinesePrompt: '昨天下午，我和朋友在咖啡馆读了日语书。',
              contextHint: '考查点：伴随助词「と」、动作场所助词「で」、宾格助词「を」及过去时态',
              testedSkillId: 'jp.particle.ni_vs_de',
              standardAnswer: '昨日、友達とカフェで日本語の本を読みました。',
              grammarFocus: '区分动作发生场所「で」与静态存在场所「に」',
            },
            {
              category: '日文句型运用 · 条件假定',
              chinesePrompt: '明天要是下雨的话，我们就不去公园了。',
              contextHint: '考查点：动词过去式接「ら」构成假定「降ったら」，否定形式「行かない」',
              testedSkillId: 'jp.grammar.conditional_tara',
              standardAnswer: '明日雨が降ったら、公園へ行きません。',
              grammarFocus: '动词假定形「～たら」的自然运用',
            },
            {
              category: '商务日文会话 · 敬语身份',
              chinesePrompt: '初次见面，我是 JC 策划的员工小野，请多关照。',
              contextHint: '考查点：初次会面寒暄、所属助词「の」与郑重敬语',
              testedSkillId: 'jp.keigo.self_introduction',
              standardAnswer: '初めまして、JC企画の社員の小野です。よろしくお願いします。',
              grammarFocus: '初次会面身份介绍与敬语寒暄',
            },
            {
              category: '读后续写 · 观点表达',
              chinesePrompt: '请用日语简要说明：你为什么坚持每天复习闪卡？',
              contextHint: '考查点：理由表达「～から／～ので」、简体与敬体选择',
              testedSkillId: 'jp.grammar.reason_kara',
              standardAnswer: '毎日フラッシュカードを復習すると、忘れにくくなるからです。',
              grammarFocus: '因果连接与自然收束',
            },
          ];

          const picked = bank.slice(0, Math.min(count, bank.length)).map((b, i) => ({
            ...b,
            id: generateId('write'),
            category:
              genre === 'email'
                ? `邮件写作 · Lv.${difficulty}`
                : genre === 'diary'
                  ? `日记体 · Lv.${difficulty}`
                  : genre === 'news_response'
                    ? `读后续写 · Lv.${difficulty}`
                    : b.category,
            testedSkillId: i === 0 ? skillId : b.testedSkillId,
          }));

          const questions: GeneratedQuestion[] = picked.map((p) => ({
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
            questions,
            `已按体裁「${genre}」生成 ${picked.length} 道写作/翻译题干。`,
            { writingPrompts: picked }
          );
        }

        case 'generate_passage': {
          const topicLabel = topic || '日常生活';
          return ok({
            action,
            language,
            summary: `已生成主题「${topicLabel}」的分级短文草稿。`,
            passage: {
              title: language === 'en' ? `A Short Passage on ${topicLabel}` : `「${topicLabel}」に関する短い文章`,
              body:
                language === 'en'
                  ? `This is a level-${difficulty} practice passage about ${topicLabel}. Students should focus on main ideas and key vocabulary.`
                  : `これは難度 Lv.${difficulty} の「${topicLabel}」に関する練習用短文です。キーワードと助詞の使い方に注目してください。`,
              topic: topicLabel,
            },
          });
        }

        default: {
          // LISTENING_DICTATION via format on generate-like requests
          if (input.format === 'LISTENING_DICTATION') {
            const dictationItems = [
              {
                id: generateId('dict'),
                sourceLesson: '自适应听写 · 终助词',
                speaker: '小野',
                fullJapanese: '李さんは中国人ですか。',
                chinese: '小李是中国人吗？',
                blankPrompt: '听录音，填入句尾疑问助词：',
                clozeDisplay: '李さんは中国人です（　）。',
                targetWord: 'か',
                furiganaHint: 'ka',
                categoryTag: '疑问终助词',
                testedSkillId: input.skillIds?.[0] || 'jp.particle.ka',
                grammarExplanation: '终助词「か」附在句尾表示疑问。',
              },
              {
                id: generateId('dict'),
                sourceLesson: '自适应听写 · 场所格',
                speaker: '王',
                fullJapanese: '昨日の夜、静かなカフェで本を読みました。',
                chinese: '昨天晚上，我在安静的咖啡馆读了书。',
                blankPrompt: '听录音，填入动作发生场所格助词：',
                clozeDisplay: '昨日の夜、静かなカフェ（　）本を読みました。',
                targetWord: 'で',
                furiganaHint: 'de',
                categoryTag: '场所格助词辨析',
                testedSkillId: input.skillIds?.[0] || 'jp.particle.ni_vs_de',
                grammarExplanation: '动态动作发生场所用「で」。',
              },
              {
                id: generateId('dict'),
                sourceLesson: '自适应听写 · 所属格',
                speaker: '李',
                fullJapanese: 'これは日本語の教科書です。',
                chinese: '这是日语教科书。',
                blankPrompt: '听录音，填入名词之间的所属格助词：',
                clozeDisplay: 'これは日本語（　）教科書です。',
                targetWord: 'の',
                furiganaHint: 'no',
                categoryTag: '连体格助词',
                testedSkillId: 'jp.particle.no',
                grammarExplanation: '格助词「の」连接两个名词表示所属。',
              },
            ].slice(0, count);

            const questions: GeneratedQuestion[] = dictationItems.map((d) => ({
              id: d.id,
              type: 'LISTENING_DICTATION' as const,
              prompt: d.blankPrompt,
              content: d.clozeDisplay,
              correctAnswer: d.targetWord,
              explanation: d.grammarExplanation,
              testedSkillId: d.testedSkillId,
              difficultyTier: difficulty,
            }));

            return this.maybeCollect(
              context,
              input,
              questions,
              `已生成 ${dictationItems.length} 道挖词听写题。`,
              { dictationItems }
            );
          }

          return ok({
            action,
            language,
            summary: `已完成【${action}】处理。`,
          });
        }
      }
    } catch (e: any) {
      return err(
        new BusinessError(
          'E_TOOL_EXECUTION',
          `内容引擎生成失败: ${e?.message || '未知错误'}`,
          'TOOL_EXECUTION'
        )
      );
    }
  }
}
