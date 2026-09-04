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

export const GenerateAdaptiveQuizInputSchema = z.object({
  targetLanguage: z.enum(['ja', 'en', 'ko']),
  targetLevel: z.string(),
  weaknessSkillId: z.string().optional(),
  count: z.number().min(1).max(5),
});

export type GenerateAdaptiveQuizInput = z.infer<typeof GenerateAdaptiveQuizInputSchema>;

export interface GenerateAdaptiveQuizOutput {
  targetSkillId: string;
  targetSkillName: string;
  adaptationReason: string;
  questions: GeneratedQuestion[];
}

// 预设的高质量靶向自适应题库池（依据外语教学薄弱点分类建立）
const ADAPTIVE_QUESTION_BANK: Record<string, { skillName: string; questions: Omit<GeneratedQuestion, 'id'>[] }> = {
  'jp.particle.ni_vs_de': {
    skillName: '场所格助词「で」与「に」的功能辨析',
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '根据谓语动词的动作属性，选择最恰当的场所助词：',
        content: '昨日の夜、静かなカフェ（　）本を読みました。',
        options: ['で', 'に', 'を', 'へ'],
        correctAnswer: 'で',
        explanation: '「本を読む」(读书) 属于动态发生的作用力动作，动作发生的场所必须使用格助词「で」；「に」则表示静态存在或归着落脚点。',
        testedSkillId: 'jp.particle.ni_vs_de',
        difficultyTier: 3,
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '选择最恰当的格助词填入括号（表示存在场所）：',
        content: '机の上（　）日本語の教科書があります。',
        options: ['に', 'で', 'へ', 'から'],
        correctAnswer: 'に',
        explanation: '句尾为静态存在动词「ある」，表示无生命物体的静态存在场所，固定使用格助词「に」。',
        testedSkillId: 'jp.particle.ni_vs_de',
        difficultyTier: 2,
      },
    ],
  },
  'jp.grammar.conditional_tara': {
    skillName: '假定条件句形「～たら」接续与应用',
    questions: [
      {
        type: 'FILL_IN_BLANK',
        prompt: '将括号中的一类形容词变形为假定形（～たら）：',
        content: '値段が（高い ──►　　　　）、買いません。',
        correctAnswer: '高かったら',
        explanation: '一类形容词的假定形变化为：将词尾「い」变为过去式「かった」，后接「ら」，即「高かったら」。',
        testedSkillId: 'jp.grammar.conditional_tara',
        difficultyTier: 3,
      },
    ],
  },
  'jp.grammar.causative_active': {
    skillName: '使役态与被动态语境辨析',
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '选择符合上下文语法逻辑的使役动词形式：',
        content: '母親は子どもに毎日野菜を（　）。',
        options: ['食べさせます', '食べられます', '食べさせられます', '食べられますか'],
        correctAnswer: '食べさせます',
        explanation: '母亲让孩子吃蔬菜，符合「Aは Bに ...を [使役动词]」的使役逻辑，二类动词「食べる」使役形为「食べさせる」。',
        testedSkillId: 'jp.grammar.causative_active',
        difficultyTier: 4,
      },
    ],
  },
  'DEFAULT': {
    skillName: '格助词综合理解与语境搭配',
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '选择最恰当的助词完成移动句：',
        content: '来週の金曜日、家族と一緒に東京（　）新幹線で行きます。',
        options: ['へ', 'で', 'を', 'から'],
        correctAnswer: 'へ',
        explanation: '移动目的地可用方向助词「へ」(读音 e) 或到达点助词「に」；交通工具「新幹線」后接「で」。',
        testedSkillId: 'jp.particle.destination',
        difficultyTier: 3,
      },
    ],
  },
};

export class GenerateAdaptiveQuizTool
  implements ToolDefinition<GenerateAdaptiveQuizInput, GenerateAdaptiveQuizOutput>
{
  public readonly name = 'quiz.generateAdaptive';
  public readonly description =
    '【兼容别名】靶向出题；Agent/新路径请优先 learning.content（action=generate_quiz）。本工具保留 HTTP/WS 旧输入形态。';
  public readonly location = ToolLocations.SERVER;
  public readonly permission = ToolPermissions.READ;
  public readonly schema = GenerateAdaptiveQuizInputSchema;

  constructor(private readonly learnerRepo: LearnerRepository) {}

  public async execute(
    input: GenerateAdaptiveQuizInput,
    context: ToolExecutionContext
  ): Promise<Result<GenerateAdaptiveQuizOutput, BusinessError>> {
    try {
      let targetSkillId = input.weaknessSkillId;
      let reason = '用户指定专项练习';

      // 如果未指定薄弱项，从学习者画像数据库提取首要弱项
      if (!targetSkillId) {
        const snapshotRes = await this.learnerRepo.getProfileSnapshot(
          context.userId,
          input.targetLanguage
        );
        if (isOk(snapshotRes) && snapshotRes.value.weaknesses.length > 0) {
          const topWeakness = snapshotRes.value.weaknesses[0];
          if (topWeakness) {
            targetSkillId = topWeakness.id;
            reason = `基于您的学情画像：考点【${topWeakness.name}】近期连续出错 ${topWeakness.consecutiveErrors} 次，准确度偏低，系统为您定向生成靶向加练`;
          }
        }
      }

      if (!targetSkillId) {
        targetSkillId = 'jp.particle.ni_vs_de';
        reason = '系统针对高频混淆考点推荐靶向自测';
      }

      const bankEntry = ADAPTIVE_QUESTION_BANK[targetSkillId] ?? ADAPTIVE_QUESTION_BANK['DEFAULT']!;
      const selected = bankEntry.questions.slice(0, input.count);

      const generatedQuestions: GeneratedQuestion[] = selected.map((q) => {
        const raw = {
          ...q,
          id: generateId('q_ai'),
        };
        // 刚性通过 Zod 校验，确保绝不出现字段缺失或格式错乱
        return GeneratedQuestionSchema.parse(raw);
      });

      return ok({
        targetSkillId,
        targetSkillName: bankEntry.skillName,
        adaptationReason: reason,
        questions: generatedQuestions,
      });
    } catch (error) {
      return err(
        new BusinessError(
          'E_ADAPTIVE_GENERATE_FAILED',
          `AI 靶向出题合成异常：${error instanceof Error ? error.message : String(error)}`,
          'AGENT_RUNTIME'
        )
      );
    }
  }
}
