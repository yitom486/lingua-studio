/**
 * 学习域权威初始冷启动种子数据 (Learning Seeds)
 * 仅用于 SQLite 初次建库/安装时的单次灌库，后续所有变更以 SQLite 为 SSOT
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

export const INITIAL_CARD_SEEDS: CardSeed[] = [
  {
    id: 'card_01',
    type: 'VOCAB',
    front: '降る',
    phonetic: 'ふる',
    back: '下 (雨、雪等)',
    tags: ['JLPT N3', '动1 · 自动'],
    exampleJp: '明日、雨が降ったら、試合は中止です。',
    exampleHighlight: '降ったら',
    exampleZh: '明天要是下雨的话，比赛就中止。',
    stability: 2.2,
    reps: 1,
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
    stability: 3.5,
    reps: 2,
  },
  {
    id: 'card_03',
    type: 'VOCAB',
    front: '遠慮',
    phonetic: 'えんりょ',
    back: '客气、顾虑、辞让',
    tags: ['JLPT N3', '名 · サ变'],
    exampleJp: 'どうぞ遠慮しないで、たくさん召し上がってください。',
    exampleHighlight: '遠慮しないで',
    exampleZh: '请千万别客气，请多吃一点。',
    stability: 1.8,
    reps: 1,
  },
  {
    id: 'card_04',
    type: 'CONFUSION',
    front: '助词「に」vs「で」',
    phonetic: 'ni vs de',
    back: '移动终点/到达点用「に」；动作发生场所用「で」',
    tags: ['易混高频点', '语法对比'],
    exampleJp: '図書館で本を読みます。 / 図書館に行きます。',
    exampleHighlight: 'で / に',
    exampleZh: '在图书馆读书(场所动作) / 去图书馆(移动终点)',
    stability: 1.2,
    reps: 1,
  },
  {
    id: 'card_05',
    type: 'VOCAB',
    front: '約束',
    phonetic: 'やくそく',
    back: '约定、诺言、契约',
    tags: ['JLPT N3', '日常用语'],
    exampleJp: '友達と京都に行く約束をしました。',
    exampleHighlight: '約束',
    exampleZh: '和朋友约定好了一起去京都。',
    stability: 2.0,
    reps: 1,
  },
  {
    id: 'card_06',
    type: 'VOCAB',
    front: '曖昧',
    phonetic: 'あいまい',
    back: '含糊、暧昧、不明确',
    tags: ['JLPT N2', '形容动词'],
    exampleJp: '曖昧な返事は相手を困らせることがあります。',
    exampleHighlight: '曖昧な',
    exampleZh: '模棱两可的回答有时会让对方感到困扰。',
    stability: 1.5,
    reps: 1,
  },
];

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
    testedSkillId: 'jp.syntax.standard_order',
    difficulty: 3,
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
    testedSkillId: 'jp.grammar.causative_active',
    difficulty: 4,
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
    testedSkillId: 'jp.particle.wa_topic',
    difficulty: 1,
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
    testedSkillId: 'jp.grammar.demonstrative_pronouns',
    difficulty: 2,
  },
];

export const INITIAL_MISTAKE_SEEDS: MistakeSeed[] = [
  {
    id: 'mst_01',
    questionId: 'q_01',
    categoryTag: '助词混淆',
    prompt: '选择正确的动作场所助词：',
    sentence: '図書館（　）本を読みます。',
    userWrongAnswer: 'に',
    correctAnswer: 'で',
    testedSkillId: 'jp.particle.action_de',
    reviewNote: '在图书馆进行“读书”这一动作，强调动作发生的场所，必须使用助词「对」/「で」。',
    consecutiveCorrect: 0,
    isResolved: false,
  },
  {
    id: 'mst_02',
    questionId: 'q_02',
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

export const INITIAL_SKILL_METRIC_SEEDS: SkillMetricSeed[] = [
  {
    skillId: 'jp.particle.destination_ni',
    dimension: 'GRAMMAR',
    name: '目的地到达点助词「に」',
    proficiency: 0.88,
    totalAttempts: 14,
    correctAttempts: 13,
    consecutiveErrors: 0,
    status: 'STRENGTH',
  },
  {
    skillId: 'jp.particle.action_de',
    dimension: 'GRAMMAR',
    name: '动作发生场所助词「で」',
    proficiency: 0.52,
    totalAttempts: 9,
    correctAttempts: 5,
    consecutiveErrors: 2,
    status: 'WEAKNESS',
  },
  {
    skillId: 'jp.listening.sokuon',
    dimension: 'LISTENING',
    name: '听力：促音与长音精细辨析',
    proficiency: 0.46,
    totalAttempts: 12,
    correctAttempts: 5,
    consecutiveErrors: 2,
    status: 'WEAKNESS',
  },
  {
    skillId: 'jp.grammar.conditional_tara',
    dimension: 'GRAMMAR',
    name: '假定条件「～たら」实际运用',
    proficiency: 0.65,
    totalAttempts: 10,
    correctAttempts: 7,
    consecutiveErrors: 0,
    status: 'NORMAL',
  },
  {
    skillId: 'jp.vocab.n3_verbs',
    dimension: 'VOCABULARY',
    name: 'N3 核心动词搭配与活用',
    proficiency: 0.94,
    totalAttempts: 32,
    correctAttempts: 30,
    consecutiveErrors: 0,
    status: 'STRENGTH',
  },
  {
    skillId: 'jp.nuance.polite_keigo',
    dimension: 'NUANCE_PRAGMATIC',
    name: '基础敬语与礼貌体语感',
    proficiency: 0.58,
    totalAttempts: 8,
    correctAttempts: 4,
    consecutiveErrors: 1,
    status: 'WEAKNESS',
  },
];
