/**
 * 主观写作 / 翻译演示题干。
 * 后续由 quiz.generateAdaptive 按薄弱语法点现场出题。
 */

export interface SubjectiveExercise {
  id: string;
  category: string;
  chinesePrompt: string;
  contextHint: string;
  testedSkillId: string;
  standardAnswer: string;
  grammarFocus: string;
}

export const INITIAL_SUBJECTIVE_EXERCISES: SubjectiveExercise[] = [
  {
    id: 'sub_01',
    category: '日文长句翻译 · 动作场所',
    chinesePrompt: '昨天下午，我和朋友在咖啡馆读了日语书。',
    contextHint: '考查点：伴随助词「と」、动作场所助词「で」、宾格助词「を」及过去时态',
    testedSkillId: 'jp.particle.ni_vs_de',
    standardAnswer: '昨日、友達とカフェで日本語の本を読みました。',
    grammarFocus: '区分动作发生场所「で」与静态存在场所「に」',
  },
  {
    id: 'sub_02',
    category: '日文句型运用 · 条件假定',
    chinesePrompt: '明天要是下雨的话，我们就不去公园了。',
    contextHint: '考查点：动词过去式接「ら」构成假定「降ったら」，否定形式「行かない」',
    testedSkillId: 'jp.grammar.conditional_tara',
    standardAnswer: '明日雨が降ったら、公園へ行きません。',
    grammarFocus: '动词假定形「～たら」的自然运用',
  },
  {
    id: 'sub_03',
    category: '商务日文会话 · 敬语身份',
    chinesePrompt: '初次见面，我是 JC 策划的员工小野，请多关照。',
    contextHint: '考查点：初次会面寒暄、所属助词「の」与郑重敬语「よろしくお願いします」',
    testedSkillId: 'jp.keigo.self_introduction',
    standardAnswer: '初めまして、JC企画の社員の小野です。よろしくお願いします。',
    grammarFocus: '初次会面身份介绍与敬语寒暄',
  },
];
