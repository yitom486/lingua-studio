/**
 * 听力精听挖词听写演示题池。
 * 后续对接教材切片或弱项动态组卷后删除本文件中的样例。
 */

export interface DictationItem {
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
}

export const DICTATION_CHALLENGES: DictationItem[] = [
  {
    id: 'dict_01',
    sourceLesson: '标日第 1 课 · 出逢い',
    speaker: '小野',
    fullJapanese: '李さんは中国人ですか。',
    chinese: '小李是中国人吗？',
    blankPrompt: '听录音，填入句尾疑问助词：',
    clozeDisplay: '李さんは中国人です（　）。',
    targetWord: 'か',
    furiganaHint: 'ka',
    categoryTag: '疑问终助词',
    testedSkillId: 'jp.particle.ka',
    grammarExplanation:
      '日语中终助词「か」附在句尾表示疑问，相当于汉语的“吗”，句尾句调需微升。',
  },
  {
    id: 'dict_02',
    sourceLesson: '标日第 2 课 · 事物指示',
    speaker: '李',
    fullJapanese: 'これは日本語の教科書です。',
    chinese: '这是日语教科书。',
    blankPrompt: '听录音，填入名词之间的所属格助词：',
    clozeDisplay: 'これは日本語（　）教科書です。',
    targetWord: 'の',
    furiganaHint: 'no',
    categoryTag: '连体格助词',
    testedSkillId: 'jp.particle.no',
    grammarExplanation: '格助词「の」连接两个名词，表示所属、修饰或属性，“日语的教科书”。',
  },
  {
    id: 'dict_03',
    sourceLesson: '标日综合练习 · 动态场所',
    speaker: '王',
    fullJapanese: '昨日の夜、静かなカフェで本を読みました。',
    chinese: '昨天晚上，我在安静的咖啡馆读了书。',
    blankPrompt: '听录音，填入动作发生场所格助词：',
    clozeDisplay: '昨日の夜、静かなカフェ（　）本を読みました。',
    targetWord: 'で',
    furiganaHint: 'de',
    categoryTag: '场所格助词辨析',
    testedSkillId: 'jp.particle.ni_vs_de',
    grammarExplanation:
      '「本を読む」是动态自主动作，动作发生的场所必须使用格助词「で」，切忌混淆为静态存在的「に」。',
  },
  {
    id: 'dict_04',
    sourceLesson: '大家的日语 · 移动目标',
    speaker: '田中',
    fullJapanese: '来週の金曜日に東京へ新幹線で行きます。',
    chinese: '下周五坐新干线去东京。',
    blankPrompt: '听录音，填入移动方向格助词：',
    clozeDisplay: '来週の金曜日に東京（　）新幹線で行きます。',
    targetWord: 'へ',
    furiganaHint: 'e (へ)',
    categoryTag: '移动方向助词',
    testedSkillId: 'jp.particle.destination',
    grammarExplanation: '方向助词「へ」(读音作 e) 表示动作移动的方向或归着点；亦可用「に」。',
  },
];
