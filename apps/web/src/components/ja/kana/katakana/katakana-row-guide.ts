import type { KanaRowGuideContent } from '../kana-row-guide-types.js';

/** 片假名各行的场景提示；声音复用平假名，重点放在棱角字形和外来语。 */
export const KATAKANA_ROW_GUIDES: Readonly<Record<string, KanaRowGuideContent>> = {
  あ行: {
    title: '同一组声音，换一套棱角外套',
    summary: 'ア (a)、イ (i)、ウ (u)、エ (e)、オ (o) 和あ行同音，先复用声音，再认新轮廓。',
    memoryTip: '不要把片假名当第二套发音表；把平假名的声音直接搬过来，再用外来语加强字形记忆。',
    pronunciationTip: '声音和「あ行」完全同源，重点是看到片假名也能立刻叫出 a、i、u、e、o。',
    confusions: ['ア (a) / オ (o)', 'ウ (u) / ワ (wa)', 'エ (e) / コ (ko)'],
    examples: [
      { word: 'アイス', reading: 'aisu', meaning: '冰淇淋' },
      { word: 'オイル', reading: 'oiru', meaning: '油' },
    ],
  },
  か行: {
    title: 'カ行：直线和尖角来报到',
    summary: 'カ (ka)、キ (ki)、ク (ku)、ケ (ke)、コ (ko) 依然是 k 加五个元音。',
    memoryTip: '先按 ka-ki-ku-ke-ko 随机认，再看几何轮廓；ク (ku) 是尖角，コ (ko) 是两横。',
    pronunciationTip: 'k 行发音不变，不要因为字形变硬朗了就把声音也读硬。',
    confusions: ['ク (ku) / ケ (ke)', 'キ (ki) / サ (sa)', 'コ (ko) / エ (e)'],
    examples: [
      { word: 'カメラ', reading: 'kamera', meaning: '相机' },
      { word: 'ココア', reading: 'kokoa', meaning: '可可' },
    ],
  },
  さ行: {
    title: 'サ行：シ和ツ、ソ和ン的经典关卡',
    summary: 'サ (sa)、シ (shi)、ス (su)、セ (se)、ソ (so)，其中シ (shi) 还是 shi。',
    memoryTip: 'シ (shi)/ツ (tsu) 和ソ (so)/ン (n) 必须成对看、成对听，不能只靠一句口诀。',
    pronunciationTip: 'し (shi) 和つ (tsu) 的声音不同，先听音再观察短笔画的方向。',
    confusions: ['シ (shi) / ツ (tsu)', 'ソ (so) / ン (n)', 'ス (su) / ヌ (nu)'],
    examples: [
      { word: 'スシ', reading: 'sushi', meaning: '寿司' },
      { word: 'ソース', reading: 'soosu', meaning: '酱汁' },
      { word: 'セーター', reading: 'seetaa', meaning: '毛衣' },
    ],
  },
  た行: {
    title: 'タ行：チ和ツ不要按字母硬套',
    summary: 'タ (ta)、チ (chi)、ツ (tsu)、テ (te)、ト (to)，重点仍是 chi 和 tsu。',
    memoryTip: '看到チ (chi) 不要脑补 ti，看到ツ (tsu) 不要脑补 tu；两者都要和声音绑定。',
    pronunciationTip: 'チ (chi) 有 ch 起音，ツ (tsu) 是 ts 组合；先把整拍读出来。',
    confusions: ['チ (chi) / テ (te)', 'ツ (tsu) / シ (shi)', 'ト (to) / レ (re)'],
    examples: [
      { word: 'テレビ', reading: 'terebi', meaning: '电视' },
      { word: 'チーズ', reading: 'chiizu', meaning: '奶酪' },
      { word: 'ツアー', reading: 'tsuaa', meaning: '旅行团' },
    ],
  },
  な行: {
    title: 'ナ行：直线里也有几个小陷阱',
    summary: 'ナ (na)、ニ (ni)、ヌ (nu)、ネ (ne)、ノ (no) 直接沿用 n 家族的声音。',
    memoryTip: 'ノ (no) 很简单但不要跳过；ヌ (nu) 和ス (su)/メ (me) 需要并排看。',
    pronunciationTip: '发音规律稳定，把注意力放在整体字形和词中的快速识别。',
    confusions: ['ヌ (nu) / ス (su)', 'ネ (ne) / ナ (na)', 'ノ (no) / ソ (so)'],
    examples: [
      { word: 'バナナ', reading: 'banana', meaning: '香蕉' },
      { word: 'ネクタイ', reading: 'nekutai', meaning: '领带' },
      { word: 'ノート', reading: 'nooto', meaning: '笔记本' },
    ],
  },
  は行: {
    title: 'ハ行：几何图形也要会发音',
    summary: 'ハ (ha)、ヒ (hi)、フ (fu)、ヘ (he)、ホ (ho) 的声音和は行相同。',
    memoryTip: 'ハ (ha) 是分开的两笔，ヘ (he) 像尖顶，ホ (ho) 有中心交叉；先看整体，不要只盯一条线。',
    pronunciationTip: 'フ (fu) 仍然是接近 fu 的双唇摩擦音，不要读成 hu。',
    confusions: ['フ (fu) / ス (su)', 'ヘ (he) / く (ku)', 'ハ (ha) / ホ (ho)'],
    examples: [
      { word: 'ホテル', reading: 'hoteru', meaning: '酒店' },
      { word: 'ヒント', reading: 'hinto', meaning: '提示' },
      { word: 'フランス', reading: 'furansu', meaning: '法国' },
    ],
  },
  ま行: {
    title: 'マ行：三横、交叉和收尾各有身份证',
    summary: 'マ (ma)、ミ (mi)、ム (mu)、メ (me)、モ (mo) 直接复用 m 家族的声音。',
    memoryTip: 'ミ (mi) 的三横、メ (me) 的交叉、ム (mu) 的收尾，是快速识别的三个抓手。',
    pronunciationTip: 'm 从双唇开始，保持一拍；字形再棱角分明，声音也不需要加戏。',
    confusions: ['メ (me) / ヌ (nu)', 'ミ (mi) / ニ (ni)', 'ム (mu) / ス (su)'],
    examples: [
      { word: 'メモ', reading: 'memo', meaning: '备忘' },
      { word: 'ミルク', reading: 'miruku', meaning: '牛奶' },
      { word: 'モモ', reading: 'momo', meaning: '桃子' },
    ],
  },
  や行: {
    title: 'ヤ行：还是三个成员',
    summary: 'ヤ (ya)、ユ (yu)、ヨ (yo) 和や行同音，依旧没有基础 yi、ye。',
    memoryTip: '先认全尺寸的 ヤ (ya)/ユ (yu)/ヨ (yo)，以后再和小ャ (ya)/ュ (yu)/ョ (yo) 对比。',
    pronunciationTip: 'ユ (yu) 不要直接套英语 you，听短元音的日语读法。',
    confusions: ['ヤ (ya) / マ (ma)', 'ユ (yu) / コ (ko)', 'ヨ (yo) / ヲ (o)'],
    examples: [
      { word: 'ヤード', reading: 'yaado', meaning: '码（长度单位）' },
      { word: 'ユニット', reading: 'yunitto', meaning: '单元/组件' },
      { word: 'ヨーロッパ', reading: 'yooroppa', meaning: '欧洲' },
    ],
  },
  ら行: {
    title: 'ラ行：看到 r，耳朵别自动播放英语',
    summary: 'ラ (ra)、リ (ri)、ル (ru)、レ (re)、ロ (ro) 同样是轻弹舌尖的 r 家族。',
    memoryTip: 'リ (ri) 的双斜线、ル (ru) 的收尾、ロ (ro) 的框形很适合做轮廓锚点。',
    pronunciationTip: '舌尖轻弹一下，不卷舌；罗马字 r 只是标签，不是完整发音教程。',
    confusions: ['ル (ru) / レ (re)', 'リ (ri) / ソ (so)', 'ロ (ro) / コ (ko)'],
    examples: [
      { word: 'ラジオ', reading: 'rajio', meaning: '收音机' },
      { word: 'リスト', reading: 'risuto', meaning: '列表' },
      { word: 'レモン', reading: 'remon', meaning: '柠檬' },
      { word: 'ロボット', reading: 'robotto', meaning: '机器人' },
    ],
  },
  わ行: {
    title: 'ワ、ヲ、ン：外来语里的收尾选手',
    summary: 'ワ (wa) 和ヲ (o) 对应わ行；ン (n) 是鼻音拍，实际外来语里很常见。',
    memoryTip: 'ヲ (o) 字形单独记，现代通常读 o；ン (n) 和ソ (so) 一定要成对练。',
    pronunciationTip: 'ン (n) 没有元音，不要在 n 后面偷偷补 a、i、u、e 或 o。',
    confusions: ['ワ (wa) / ウ (u)', 'ヲ (o) / オ (o)', 'ン (n) / ソ (so)'],
    examples: [
      { word: 'ワイン', reading: 'wain', meaning: '葡萄酒' },
      { word: 'パン', reading: 'pan', meaning: '面包' },
      { word: 'ラーメン', reading: 'raamen', meaning: '拉面' },
    ],
  },
  特殊: {
    title: 'ン (n)：片假名里的鼻音收尾',
    summary: 'ン (n) 没有元音，常常出现在外来语的词尾或中间。',
    memoryTip: '把 ン (n) 当成一个独立拍，不要把它和 ナ (na) 或ソ (so) 看成一家。',
    pronunciationTip: '鼻音的实际听感会受后面音影响，入门先保持无元音、占一拍。',
    confusions: ['ン (n) / ソ (so)', 'ン (n) / シ (shi)', 'ン (n) / ナ (na)'],
    examples: [
      { word: 'パン', reading: 'pan', meaning: '面包' },
      { word: 'ペン', reading: 'pen', meaning: '笔' },
      { word: 'ホテル', reading: 'hoteru', meaning: '酒店' },
    ],
  },
};
