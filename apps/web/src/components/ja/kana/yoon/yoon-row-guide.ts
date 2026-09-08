import type { KanaRowGuideContent } from '../kana-row-guide-types.js';

const yoonExamples = [
  { word: 'きょう', reading: 'kyou', meaning: '今天' },
  { word: 'しゃしん', reading: 'shashin', meaning: '照片' },
  { word: 'ちょっと', reading: 'chotto', meaning: '稍微/等一下' },
  { word: 'りょこう', reading: 'ryokou', meaning: '旅行' },
] as const;

/** 拗音共用一套“い段 + 小ゃ/ゅ/ょ”的解释，再按起始音补充提示。 */
export const YOON_DEFAULT_GUIDE: KanaRowGuideContent = {
  title: 'い段假名和小字挤在一起',
  summary: '拗音由 い段假名加小ゃ/ゅ/ょ组成；小字不是独立的一拍，而是和前面的音合体。',
  memoryTip: 'きや (kiya) 是两拍，きゃ (kya) 是一组拗音。先看小字，再把辅音和 ya/yu/yo 合起来读。',
  pronunciationTip: 'しゅ (shu)、ちょ (cho)、じゅ (ju) 不要拆成 shi-yu、ti-yo、ji-yu，直接听整组音。',
  confusions: ['きや (kiya) / きゃ (kya)', 'しゅ (shu) / ちゅ (chu)', 'じょ (jo) / しょ (sho)'],
  examples: yoonExamples,
};

export const YOON_ROW_NOTES: Readonly<Record<string, string>> = {
  き拗音: 'き (ki) 加小ゃ/ゅ/ょ，得到 kya、kyu、kyo；结构最适合拿来练“大小字”。',
  し拗音: 'し (shi) 变成 sha、shu、sho，注意不是 si-ya、si-yu、si-yo。',
  ち拗音: 'ち (chi) 变成 cha、chu、cho，仍然保留 ch 的起音。',
  に拗音: 'に (ni) 变成 nya、nyu、nyo，先听 n 的鼻音再合并 ya/yu/yo。',
  ひ拗音: 'ひ (hi) 变成 hya、hyu、hyo，先保持 h 的轻摩擦。',
  み拗音: 'み (mi) 变成 mya、myu、myo，双唇 m 不要丢掉。',
  り拗音: 'り (ri) 变成 rya、ryu、ryo，舌尖仍然轻弹，不要卷成英语 r。',
  ぎ拗音: 'ぎ (gi) 带浊点后变成 gya、gyu、gyo，注意声带要参与。',
  じ拗音: 'じ (ji) 变成 ja、ju、jo，直接按整组声音记。',
  び拗音: 'び (bi) 变成 bya、byu、byo，和ぴ (pi) 的有声/无声对比很适合一起听。',
  ぴ拗音: 'ぴ (pi) 变成 pya、pyu、pyo，小圆圈仍然表示 p 的无声送气。',
};
