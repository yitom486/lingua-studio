import type { SkillMetric } from '@study-studio/learner-core';
import type { CardReviewRating } from '@study-studio/protocol';

export interface QuizQuestionItem {
  id: string;
  type: 'CHOICE' | 'FILL_BLANK' | 'REORDER';
  category: string;
  prompt: string;
  content: string;
  options?: { key: string; text: string; note?: string }[];
  chunks?: string[]; // for reorder type
  correctAnswer: string;
  explanation: string;
  testedSkill: string;
}

export interface StudyCardItem {
  id: string;
  type: 'VOCAB' | 'GRAMMAR' | 'CONFUSION';
  frontWord: string;
  reading: string;
  tag: string;
  pos: string;
  backMeaning: string;
  exampleJp: string;
  exampleHighlight: string;
  exampleZh: string;
  note?: string;
  stability: number;
  reps: number;
}

export interface MistakeNotebookItem {
  id: string;
  categoryTag: string;
  prompt: string;
  sentence: string;
  userWrongAnswer: string;
  correctAnswer: string;
  testedSkillId: string;
  reviewNote: string;
  consecutiveCorrect: number; // 0/2 or 1/2
  isResolved: boolean;
}

export const INITIAL_QUESTIONS: QuizQuestionItem[] = [
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
    testedSkill: 'jp.particle.destination_ni',
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
    testedSkill: 'jp.grammar.conditional_tara',
  },
  {
    id: 'q_03',
    type: 'REORDER',
    category: '连词成句 · 语序训练',
    prompt: '点击词块，按正确语序重排句子：',
    content: '（按照自然日文语序组合下列短语）',
    chunks: ['友だちと', '夏休みに', '京都へ', '行きました'],
    correctAnswer: '夏休みに 友だちと 京都へ 行きました',
    explanation:
      '日文标准语序通常遵循【时间状语 (夏休みに) ──► 伴随状语 (友だちと) ──► 目的地 (京都へ) ──► 谓语动词 (行きました)】。',
    testedSkill: 'jp.syntax.standard_order',
  },
  {
    id: 'q_04',
    type: 'CHOICE',
    category: '使役与被动辨析',
    prompt: '根据上下文选出正确的动词态：',
    content: '先生は学生に日本語の文章を（　）。',
    options: [
      { key: 'A', text: '読まれました', note: '被动态（被读）' },
      { key: 'B', text: '読ませました', note: '使役态（让…读）' },
      { key: 'C', text: '読ませられました', note: '使役被动态（被迫读）' },
      { key: 'D', text: '読めました', note: '可能态（能读）' },
    ],
    correctAnswer: 'B',
    explanation:
      '句型「Aは Bに ...を [使役动词]」表示“A让/使B做某事”。此处老师指导学生读日文文章，符合使役态「読ませました」。',
    testedSkill: 'jp.grammar.causative_active',
  },
  {
    id: 'q_05',
    type: 'CHOICE',
    category: '标日初上 · 第1课',
    prompt: '选择最恰当的助词填入括号，完成判断句：',
    content: '李さん（　）中国人です。',
    options: [
      { key: 'A', text: 'は', note: '提示主题，读作 wa' },
      { key: 'B', text: 'が', note: '主格助词' },
      { key: 'C', text: 'を', note: '宾格助词' },
      { key: 'D', text: 'に', note: '时间或落脚点' },
    ],
    correctAnswer: 'A',
    explanation:
      '「李さんは中国人です」是标准日语句型「N1 は N2 です」，助词「は」提示主题，读音为「wa」。',
    testedSkill: 'PARTICLE_WA_DESU',
  },
  {
    id: 'q_06',
    type: 'CHOICE',
    category: '标日初上 · 第2课',
    prompt: '根据回答（あちら），选择正确的疑问指示词：',
    content: '（　）は誰の傘ですか。──あちらの傘です。',
    options: [
      { key: 'A', text: 'これ', note: '近称代词' },
      { key: 'B', text: 'あれ', note: '远称代词' },
      { key: 'C', text: 'この', note: '连体词（后必须接名词）' },
      { key: 'D', text: 'その', note: '中称连体词' },
    ],
    correctAnswer: 'B',
    explanation:
      '在询问远距离事物时用指示代词「あれ」；「この」是连体词，后必须紧跟名词，不能单独后接助词「は」。',
    testedSkill: 'DEMONSTRATIVE_PRONOUNS',
  },
];

export const INITIAL_CARDS: StudyCardItem[] = [
  {
    id: 'card_01',
    type: 'VOCAB',
    frontWord: '降る',
    reading: 'ふる',
    tag: 'JLPT N3',
    pos: '动1 · 自动',
    backMeaning: '下 (雨、雪等)',
    exampleJp: '明日、雨が降ったら、試合は中止です。',
    exampleHighlight: '降ったら',
    exampleZh: '明天要是下雨的话，比赛就中止。',
    stability: 2.2,
    reps: 1,
  },
  {
    id: 'card_02',
    type: 'GRAMMAR',
    frontWord: '～おかげで',
    reading: 'okagede',
    tag: 'N3 核心句型',
    pos: '接续助词短语',
    backMeaning: '多亏了… / 幸好… (积极正面结果)',
    exampleJp: '先生のおかげで、合格することができました。',
    exampleHighlight: 'のおかげで',
    exampleZh: '多亏了老师的教导，我才能顺利合格。',
    note: '辨析：消极消极原因导致坏结果时使用「～せいで」（怪…/因为…倒霉）。',
    stability: 3.5,
    reps: 2,
  },
  {
    id: 'card_03',
    type: 'VOCAB',
    frontWord: '遠慮',
    reading: 'えんりょ',
    tag: 'JLPT N3',
    pos: '名 · サ变',
    backMeaning: '客气、顾虑、辞让',
    exampleJp: 'どうぞ遠慮しないで、たくさん召し上がってください。',
    exampleHighlight: '遠慮しないで',
    exampleZh: '请千万别客气，请多吃一点。',
    note: '口语极高频礼貌搭配：「遠慮なくどうぞ」（请别见外/请自便）。',
    stability: 1.8,
    reps: 1,
  },
  {
    id: 'card_04',
    type: 'CONFUSION',
    frontWord: '助词「に」vs「で」',
    reading: 'ni vs de',
    tag: '易混高频点',
    pos: '语法对比',
    backMeaning: '移动终点/到达点用「に」；动作发生场所用「で」',
    exampleJp: '図書館で本を読みます。 / 図書館に行きます。',
    exampleHighlight: 'で / に',
    exampleZh: '在图书馆读书(场所动作) / 去图书馆(移动终点)',
    stability: 1.2,
    reps: 1,
  },
];

export const INITIAL_MISTAKES: MistakeNotebookItem[] = [
  {
    id: 'mst_01',
    categoryTag: '助词混淆',
    prompt: '选择正确的动作场所助词：',
    sentence: '図書館（　）本を読みます。',
    userWrongAnswer: 'に',
    correctAnswer: 'で',
    testedSkillId: 'jp.particle.action_de',
    reviewNote: '在图书馆进行“读书”这一动作，强调动作发生的场所，必须使用助词「で」。',
    consecutiveCorrect: 0,
    isResolved: false,
  },
  {
    id: 'mst_02',
    categoryTag: '假定形混淆',
    prompt: '根据情境选择最自然的假定表达：',
    sentence: '薬を（　）、頭痛が治りました。',
    userWrongAnswer: '飲むなら',
    correctAnswer: '飲んだら',
    testedSkillId: 'jp.grammar.conditional_tara',
    reviewNote: '「～たら」可用于表示后项已经发生的事实发现（吃了药之后头痛治好了）；「なら」不可用于后项为过去发生事实的句子。',
    consecutiveCorrect: 1,
    isResolved: false,
  },
];

export const SKILL_METRICS_JP: SkillMetric[] = [
  {
    id: 'jp.particle.destination_ni',
    dimension: 'GRAMMAR',
    name: '目的地到达点助词「に」',
    proficiency: 0.88,
    totalAttempts: 14,
    correctAttempts: 13,
    consecutiveErrors: 0,
    status: 'STRENGTH',
  },
  {
    id: 'jp.particle.action_de',
    dimension: 'GRAMMAR',
    name: '动作发生场所助词「で」',
    proficiency: 0.52,
    totalAttempts: 9,
    correctAttempts: 5,
    consecutiveErrors: 2,
    status: 'WEAKNESS',
  },
  {
    id: 'jp.listening.sokuon',
    dimension: 'LISTENING',
    name: '听力：促音与长音精细辨析',
    proficiency: 0.46,
    totalAttempts: 12,
    correctAttempts: 5,
    consecutiveErrors: 2,
    status: 'WEAKNESS',
  },
  {
    id: 'jp.grammar.conditional_tara',
    dimension: 'GRAMMAR',
    name: '假定条件「～たら」实际运用',
    proficiency: 0.65,
    totalAttempts: 10,
    correctAttempts: 7,
    consecutiveErrors: 0,
    status: 'NORMAL',
  },
  {
    id: 'jp.vocab.n3_verbs',
    dimension: 'VOCABULARY',
    name: 'N3 核心动词搭配与活用',
    proficiency: 0.94,
    totalAttempts: 32,
    correctAttempts: 30,
    consecutiveErrors: 0,
    status: 'STRENGTH',
  },
  {
    id: 'jp.nuance.polite_keigo',
    dimension: 'NUANCE_PRAGMATIC',
    name: '基础敬语与礼貌体语感',
    proficiency: 0.58,
    totalAttempts: 8,
    correctAttempts: 4,
    consecutiveErrors: 1,
    status: 'WEAKNESS',
  },
];
