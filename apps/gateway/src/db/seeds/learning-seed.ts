/**
 * 学习域权威初始冷启动种子数据 (Restrained Cold-start Seeds)
 * 仅用于 SQLite 初次建库/安装时的极简入门示例（克制、高质感）
 * 一旦数据库存在数据，系统 100% 严格使用数据库中的最新真实资产 (SSOT)
 */

export interface CardSeed {
  id: string;
  type: string;
  front: string;
  back: string;
  phonetic?: string | null;
  audioUrl?: string | null;
  tags: string[];
  exampleJp?: string;
  exampleHighlight?: string;
  exampleZh?: string;
  stability: number;
  reps: number;
}

export interface QuestionSeed {
  id: string;
  type: 'CHOICE' | 'FILL_BLANK' | 'REORDER';
  category: string;
  prompt: string;
  content: string;
  options?: { key: string; text: string; note?: string }[];
  chunks?: string[];
  correctAnswer: string;
  explanation: string;
  testedSkillId: string;
  difficulty: number;
}

export interface MistakeSeed {
  id: string;
  questionId: string;
  categoryTag: string;
  prompt: string;
  sentence: string;
  userWrongAnswer: string;
  correctAnswer: string;
  testedSkillId: string;
  reviewNote: string;
  consecutiveCorrect: number;
  isResolved: boolean;
}

export interface SkillMetricSeed {
  skillId: string;
  dimension: string;
  name: string;
  proficiency: number;
  totalAttempts: number;
  correctAttempts: number;
  consecutiveErrors: number;
  status: 'STRENGTH' | 'WEAKNESS' | 'NORMAL';
}

/**
 * 官方精选出厂 FSRS 示范卡片（克制保留 2 张初始待学范例，初始复习次数为 0）
 */
export const INITIAL_CARD_SEEDS: CardSeed[] = [
  {
    id: 'card_01',
    type: 'VOCAB',
    front: '約束',
    phonetic: 'やくそく',
    back: '约定、诺言、契约',
    tags: ['JLPT N3', '核心词汇'],
    exampleJp: '友達と京都に行く約束をしました。',
    exampleHighlight: '約束',
    exampleZh: '和朋友约定好了一起去京都。',
    stability: 1.0,
    reps: 0,
  },
  {
    id: 'card_02',
    type: 'GRAMMAR',
    front: '～おかげで',
    phonetic: 'okagede',
    back: '多亏了… / 幸好… (积极正面结果)',
    tags: ['N3 核心句型', '接续助词短语'],
    exampleJp: '先生のおかげで、合格することができました。',
    exampleHighlight: 'のおかげで',
    exampleZh: '多亏了老师的教导，我才能顺利合格。',
    stability: 1.0,
    reps: 0,
  },
];

/**
 * 官方精选自适应题库示范题（克制保留 2 道标准示范题供学员开启练习）
 */
export const INITIAL_QUESTION_SEEDS: QuestionSeed[] = [
  {
    id: 'q_01',
    type: 'CHOICE',
    category: '助词辨析',
    prompt: '选择最恰当的助词填入括号：',
    content: '夏休みに、友だちと京都（　）行きました。',
    options: [
      { key: 'A', text: 'で', note: '表示动作场所或工具手段' },
      { key: 'B', text: 'に', note: '表示移动的目的地、到达点' },
      { key: 'C', text: 'を', note: '表示动作对象或离开场所' },
      { key: 'D', text: 'から', note: '表示起点或出处' },
    ],
    correctAnswer: 'B',
    explanation:
      '动词「行きました」为移动动词，表示移动目的地、到达点时必须使用格助词「に」或方向助词「へ」；「で」则用于动作发生的场所。',
    testedSkillId: 'jp.particle.destination_ni',
    difficulty: 2,
  },
  {
    id: 'q_02',
    type: 'FILL_BLANK',
    category: '动词假定形',
    prompt: '将括号中的动词变形为正确的假定形（～たら）：',
    content: '明日、雨が（降る ──►　　　　）、試合は中止です。',
    correctAnswer: '降ったら',
    explanation:
      '动词「降る」（五段动词）的过去式为「降った」，后接「ら」构成假定条件「降ったら」，表示“如果下雨的话”。',
    testedSkillId: 'jp.grammar.conditional_tara',
    difficulty: 3,
  },
];

/**
 * 错题记录：新用户出厂默认零错题，待学员真实作答触发记录
 */
export const INITIAL_MISTAKE_SEEDS: MistakeSeed[] = [];

/**
 * 技能画像指标：新用户出厂初始为空，完成自适应做题后动态生成专属真实评测
 */
export const INITIAL_SKILL_METRIC_SEEDS: SkillMetricSeed[] = [];
