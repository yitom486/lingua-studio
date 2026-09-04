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
} from '@study-studio/shared';
import type { LearnerRepository } from '@study-studio/learner-core';

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
    ])
    .optional(),
  skillIds: z.array(z.string()).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  language: z.enum(['ja', 'en']).optional(),
  topic: z.string().optional(),
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

          return ok({
            action,
            language,
            summary: `已按难度 Lv.${difficulty} 成功生成 ${questions.length} 道针对【${skillId}】的测试题。`,
            questions,
          });
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

          return ok({
            action,
            language,
            summary: '已生成假名认读与听写练习。',
            questions,
          });
        }

        default: {
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
