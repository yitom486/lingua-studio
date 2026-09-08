import type { KanaRowGuideContent } from '../kana-row-guide-types.js';

/** 浊音和半浊音按“基础行 + 标记”解释，避免被当成全新字母表。 */
export const DAKUTEN_ROW_GUIDES: Readonly<Record<string, KanaRowGuideContent>> = {
  が行: {
    title: 'か行加两点，k 家族开嗓成 g',
    summary: 'が (ga)、ぎ (gi)、ぐ (gu)、げ (ge)、ご (go) 都是か行加浊点后的声音。',
    memoryTip: '先认出 か (ka) 行，再看两点；两点不是装饰，是提醒你声带要参与。',
    pronunciationTip: 'g 要清楚但不要夸张爆破，优先通过が行整行音频建立感觉。',
    confusions: ['か (ka) / が (ga)', 'き (ki) / ぎ (gi)', 'こ (ko) / ご (go)'],
    examples: [
      { word: 'がくせい', reading: 'gakusei', meaning: '学生' },
      { word: 'ぎんこう', reading: 'ginkou', meaning: '银行' },
      { word: 'ごはん', reading: 'gohan', meaning: '米饭' },
    ],
  },
  ざ行: {
    title: 'さ行加两点，里面有个 ji',
    summary: 'ざ (za)、じ (ji)、ず (zu)、ぜ (ze)、ぞ (zo) 是さ行的浊音版本。',
    memoryTip: 'ざ行整体按 z 家族记，但 `じ (ji)` 不要机械读成 zi；它和ぢ (ji) 的声音接近。',
    pronunciationTip: '先练有声的摩擦起音；じ (ji) 直接跟着音频模仿，不要和中文“资”硬绑定。',
    confusions: ['さ (sa) / ざ (za)', 'し (shi) / じ (ji)', 'じ (ji) / ぢ (ji)'],
    examples: [
      { word: 'じかん', reading: 'jikan', meaning: '时间' },
      { word: 'すずしい', reading: 'suzushii', meaning: '凉爽' },
      { word: 'ぞう', reading: 'zou', meaning: '大象' },
    ],
  },
  だ行: {
    title: 'た行加两点，chi 和 tsu 有历史遗留款',
    summary: 'だ (da)、ぢ (ji)、づ (zu)、で (de)、ど (do) 是た行的浊音。',
    memoryTip: '先把常用的 だ (da)、で (de)、ど (do) 认熟；ぢ (ji)、づ (zu) 先认识，不必第一天背拼写规则百科。',
    pronunciationTip: 'だ行整体带声；ぢ (ji)/じ (ji)、づ (zu)/ず (zu) 在现代标准语中常接近。',
    confusions: ['た (ta) / だ (da)', 'じ (ji) / ぢ (ji)', 'ず (zu) / づ (zu)'],
    examples: [
      { word: 'だれ', reading: 'dare', meaning: '谁' },
      { word: 'でんしゃ', reading: 'densha', meaning: '电车' },
      { word: 'どこ', reading: 'doko', meaning: '哪里' },
    ],
  },
  ば行: {
    title: 'は行加两点，h 变成 b',
    summary: 'ば (ba)、び (bi)、ぶ (bu)、べ (be)、ぼ (bo) 是は行加浊点。',
    memoryTip: '把 は (ha) → ば (ba) 当成同一张字形的变声按钮，看到两点就知道要带声。',
    pronunciationTip: 'b 从双唇起音，和ぱ (pa) 做有声/无声对比，听差异比看口诀更牢。',
    confusions: ['は (ha) / ば (ba) / ぱ (pa)', 'ひ (hi) / び (bi)', 'ほ (ho) / ぼ (bo)'],
    examples: [
      { word: 'ばす', reading: 'basu', meaning: '公交车' },
      { word: 'びょういん', reading: 'byouin', meaning: '医院' },
      { word: 'ぼうし', reading: 'boushi', meaning: '帽子' },
    ],
  },
  ぱ行: {
    title: 'は行加小圆圈，h 变成 p',
    summary: 'ぱ (pa)、ぴ (pi)、ぷ (pu)、ぺ (pe)、ぽ (po) 是は行的半浊音。',
    memoryTip: '两点是浊音，小圆圈是 p；先看基础 は行，再判断标记是哪一种。',
    pronunciationTip: 'p 是双唇的无声送气，和ば (ba) 成对听；不要把圆圈当成可有可无的装饰。',
    confusions: ['は (ha) / ば (ba) / ぱ (pa)', 'ひ (hi) / ぴ (pi)', 'ほ (ho) / ぽ (po)'],
    examples: [
      { word: 'ぱん', reading: 'pan', meaning: '面包' },
      { word: 'ぴあの', reading: 'piano', meaning: '钢琴' },
      { word: 'ぷーる', reading: 'puuru', meaning: '游泳池' },
      { word: 'ぺん', reading: 'pen', meaning: '笔' },
      { word: 'ぽてと', reading: 'poteto', meaning: '薯条/土豆' },
    ],
  },
};
