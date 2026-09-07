import type { KanaExampleWord, KanaItem, KanaLearningGuide } from '@study-studio/protocol';

/** 例词只用于点击讲义中的认读示范，不把假名误当成独立词义。 */
function example(word: string, reading: string, meaning: string): KanaExampleWord {
  return { word, reading, meaning };
}

/**
 * 课程底座中的安全、短小例词。真正的词义来自完整单词或短语，而不是单个假名。
 */
const KANA_EXAMPLES: Record<string, KanaExampleWord[]> = {
  kana_a: [example('朝', 'あさ', '早上')],
  kana_i: [example('犬', 'いぬ', '狗')],
  kana_u: [example('海', 'うみ', '海')],
  kana_e: [example('駅', 'えき', '车站')],
  kana_o: [example('お茶', 'おちゃ', '茶')],
  kana_ka: [example('傘', 'かさ', '雨伞')],
  kana_ki: [example('木', 'き', '树')],
  kana_ku: [example('車', 'くるま', '汽车')],
  kana_ke: [example('今朝', 'けさ', '今天早上')],
  kana_ko: [example('ここ', 'ここ', '这里')],
  kana_sa: [example('魚', 'さかな', '鱼')],
  kana_shi: [example('塩', 'しお', '盐')],
  kana_su: [example('寿司', 'すし', '寿司')],
  kana_se: [example('先生', 'せんせい', '老师')],
  kana_so: [example('空', 'そら', '天空')],
  kana_ta: [example('卵', 'たまご', '鸡蛋')],
  kana_chi: [example('地図', 'ちず', '地图')],
  kana_tsu: [example('月', 'つき', '月亮')],
  kana_te: [example('手', 'て', '手')],
  kana_to: [example('友達', 'ともだち', '朋友')],
  kana_na: [example('名前', 'なまえ', '名字')],
  kana_ni: [example('日本', 'にほん', '日本')],
  kana_nu: [example('布', 'ぬの', '布')],
  kana_ne: [example('猫', 'ねこ', '猫')],
  kana_no: [example('飲む', 'のむ', '喝')],
  kana_ha: [example('花', 'はな', '花')],
  kana_hi: [example('飛行機', 'ひこうき', '飞机')],
  kana_fu: [example('船', 'ふね', '船')],
  kana_he: [example('部屋', 'へや', '房间')],
  kana_ho: [example('本', 'ほん', '书')],
  kana_ma: [example('窓', 'まど', '窗户')],
  kana_mi: [example('水', 'みず', '水')],
  kana_mu: [example('虫', 'むし', '昆虫')],
  kana_me: [example('眼鏡', 'めがね', '眼镜')],
  kana_mo: [example('森', 'もり', '森林')],
  kana_ya: [example('山', 'やま', '山')],
  kana_yu: [example('雪', 'ゆき', '雪')],
  kana_yo: [example('夜', 'よる', '夜晚')],
  kana_ra: [example('来月', 'らいげつ', '下个月')],
  kana_ri: [example('林檎', 'りんご', '苹果')],
  kana_ru: [example('留守', 'るす', '不在')],
  kana_re: [example('歴史', 'れきし', '历史')],
  kana_ro: [example('六', 'ろく', '六')],
  kana_wa: [example('私', 'わたし', '我')],
  kana_wo: [example('本を読む', 'ほんをよむ', '读书')],
  kana_n: [example('本', 'ほん', '书（ん在词尾表示鼻音）')],

  kana_ga: [example('学生', 'がくせい', '学生')],
  kana_gi: [example('銀行', 'ぎんこう', '银行')],
  kana_gu: [example('具合', 'ぐあい', '状况')],
  kana_ge: [example('元気', 'げんき', '精神好')],
  kana_go: [example('ご飯', 'ごはん', '饭')],
  kana_za: [example('雑誌', 'ざっし', '杂志')],
  kana_ji: [example('時間', 'じかん', '时间')],
  kana_zu: [example('ずっと', 'ずっと', '一直')],
  kana_ze: [example('全部', 'ぜんぶ', '全部')],
  kana_zo: [example('象', 'ぞう', '大象')],
  kana_da: [example('大学', 'だいがく', '大学')],
  kana_dji: [example('縮む', 'ちぢむ', '缩小')],
  kana_dzu: [example('続く', 'つづく', '继续')],
  kana_de: [example('電車', 'でんしゃ', '电车')],
  kana_do: [example('動物', 'どうぶつ', '动物')],
  kana_ba: [example('バス', 'ばす', '公交车')],
  kana_bi: [example('病院', 'びょういん', '医院')],
  kana_bu: [example('豚', 'ぶた', '猪')],
  kana_be: [example('勉強', 'べんきょう', '学习')],
  kana_bo: [example('帽子', 'ぼうし', '帽子')],

  kana_pa: [example('パン', 'ぱん', '面包')],
  kana_pi: [example('ピアノ', 'ぴあの', '钢琴')],
  kana_pu: [example('プール', 'ぷーる', '游泳池')],
  kana_pe: [example('ペン', 'ぺん', '笔')],
  kana_po: [example('ポスト', 'ぽすと', '邮筒')],

  kana_kya: [example('客', 'きゃく', '客人')],
  kana_kyu: [example('きゅうり', 'きゅうり', '黄瓜')],
  kana_kyo: [example('今日', 'きょう', '今天')],
  kana_sha: [example('写真', 'しゃしん', '照片')],
  kana_shu: [example('趣味', 'しゅみ', '兴趣')],
  kana_sho: [example('醤油', 'しょうゆ', '酱油')],
  kana_cha: [example('茶', 'ちゃ', '茶')],
  kana_chu: [example('中国', 'ちゅうごく', '中国')],
  kana_cho: [example('ちょうちょ', 'ちょうちょ', '蝴蝶')],
  kana_nya: [example('にゃんこ', 'にゃんこ', '小猫')],
  kana_nyu: [example('入学', 'にゅうがく', '入学')],
  kana_nyo: [example('にょきにょき', 'にょきにょき', '冒芽、一个接一个长出来')],
  kana_hya: [example('百', 'ひゃく', '一百')],
  kana_hyu: [example('ひゅーひゅー', 'ひゅーひゅー', '呼呼的风声')],
  kana_hyo: [example('表', 'ひょう', '表格')],
  kana_mya: [example('脈', 'みゃく', '脉搏')],
  kana_myu: [example('ミュージック', 'みゅーじっく', '音乐')],
  kana_myo: [example('苗字', 'みょうじ', '姓氏')],
  kana_rya: [example('略語', 'りゃくご', '缩略语')],
  kana_ryu: [example('龍', 'りゅう', '龙')],
  kana_ryo: [example('料理', 'りょうり', '料理')],
  kana_gya: [example('逆', 'ぎゃく', '相反')],
  kana_gyu: [example('牛乳', 'ぎゅうにゅう', '牛奶')],
  kana_gyo: [example('餃子', 'ぎょうざ', '饺子')],
  kana_ja: [example('じゃがいも', 'じゃがいも', '土豆')],
  kana_ju: [example('授業', 'じゅぎょう', '课程')],
  kana_jo: [example('上手', 'じょうず', '擅长')],
  kana_bya: [example('白夜', 'びゃくや', '白夜')],
  kana_byu: [example('びゅーん', 'びゅーん', '嗖地飞过的声音')],
  kana_byo: [example('病気', 'びょうき', '生病')],
  kana_pya: [example('ぴゃー', 'ぴゃー', '尖叫声')],
  kana_pyu: [example('ピューマ', 'ぴゅーま', '美洲狮')],
  kana_pyo: [example('ぴょんぴょん', 'ぴょんぴょん', '蹦蹦跳')],
};

/** 清音的形状联想：它们是可替换的学习提示，不是字形的语言学事实。 */
const SEION_MEMORY_TIPS: Record<string, string> = {
  kana_a: '张大嘴说“啊”，把「あ」和 a 绑在一起。',
  kana_i: '「い」像两条并排的小鱼鳍，联想 i 的两根直线。',
  kana_u: '「う」像乌鸦低头的嘴，联想“乌”开头的 u。',
  kana_e: '「え」像一只鹅转身，联想“鹅”开头的 e。',
  kana_o: '「お」像人挥手说“哦”，先记住右侧的小钩。',
  kana_ka: '「か」像卡片折起一个角，联想“卡”开头的 ka。',
  kana_ki: '「き」的两横像钥匙齿，key 的 ki 提醒你读音。',
  kana_ku: '「く」像张开的嘴角，联想“哭”开头的 ku。',
  kana_ke: '「け」像一根竖杆穿过两道刻痕，联想“刻”的 ke。',
  kana_ko: '「こ」像两条平行横线，联想“口”字的两条边和 ko。',
  kana_sa: '「さ」像一把小剪刀张开，联想“撒”开头的 sa。',
  kana_shi: '「し」像一条向下滑的溪流，联想 shi 的长音起点。',
  kana_su: '「す」像丝线绕成一个结，联想“丝”开头的 su。',
  kana_se: '「せ」像十字架少了一笔，联想“世”开头的 se。',
  kana_so: '「そ」像一条弯弯的钩线，联想 so 的弯曲收笔。',
  kana_ta: '「た」像十字旁伸出一撇，联想“他”开头的 ta。',
  kana_chi: '「ち」像一把弯钩，联想“七”开头的 chi。',
  kana_tsu: '「つ」像一条小波浪，联想 tsu 的起伏气流。',
  kana_te: '「て」像摊开的手掌，联想“手”开头的 te。',
  kana_to: '「と」像一根带钩的长针，联想“图”开头的 to。',
  kana_na: '「な」像线绕过一个十字结，联想“那”开头的 na。',
  kana_ni: '「に」像两条并排的轨道，联想“你”开头的 ni。',
  kana_nu: '「ぬ」像一根线打结后拖出长尾，记住它有一个圈。',
  kana_ne: '「ね」像绳结带着向右的尾巴，联想“呢”开头的 ne。',
  kana_no: '「の」就是一笔绕成的圆，联想 NO 的 no。',
  kana_ha: '「は」像两片分开的叶子，联想“哈”开头的 ha。',
  kana_hi: '「ひ」像嘴角向上弯，联想 hi 的微笑。',
  kana_fu: '「ふ」像两朵轻轻吹散的云，联想“呼”开头的 fu。',
  kana_he: '「へ」像山峰或箭头，联想 he 的上扬形。',
  kana_ho: '「ほ」像一棵有横枝的小树，联想“火”开头的 ho。',
  kana_ma: '「ま」像线绕成一个结再向下收，联想“麻”开头的 ma。',
  kana_mi: '「み」像三道连续的水波，联想 mi 的三笔节奏。',
  kana_mu: '「む」像牛角和弯嘴组合，联想“木”开头的 mu。',
  kana_me: '「め」像两条线交叉打结，联想“眉”开头的 me。',
  kana_mo: '「も」像毛刷的两道横纹，联想“毛”开头的 mo。',
  kana_ya: '「や」像一把分叉的鱼叉，联想 ya 的开叉形。',
  kana_yu: '「ゆ」像鱼钩穿过圆圈，联想“鱼”开头的 yu。',
  kana_yo: '「よ」像一只挂钩，联想 yo 的短促收尾。',
  kana_ra: '「ら」像数字 7 弯下去，联想 ra 的弯钩。',
  kana_ri: '「り」像两把利落的小刀，联想“利”开头的 ri。',
  kana_ru: '「る」像留字的尾巴绕成圈，联想“留”开头的 ru。',
  kana_re: '「れ」像礼物丝带甩出一笔，联想“礼”开头的 re。',
  kana_ro: '「ろ」像一个打开的口，联想“路”开头的 ro。',
  kana_wa: '「わ」像弯弯的碗，联想“哇”开头的 wa。',
  kana_wo: '「を」先记作助词里的 o；把它和普通的「お」放在例句中一起比较。',
  kana_n: '「ん」像鼻音拖出的尾巴，联想 n 收在鼻腔里。',
};

const PRONUNCIATION_TIPS: Record<string, string> = {
  kana_a: '口腔打开，短促地发 a；日语元音不带中文四声。',
  kana_i: '嘴角稍向两侧展开，发短 i，不要拖长。',
  kana_u: '嘴唇不要像中文“乌”那样过分突出，轻轻收圆发 u。',
  kana_e: '口形比 a 收一些，直接发 e，不加 y 起音。',
  kana_o: '口形略圆，发短 o，不要读成带声调的“哦”。',
  kana_shi: 'し接近英语 she 的起始音，但更短；不要把 i 拖成长音。',
  kana_chi: 'ち先有轻微的塞擦感，接近“七”的起始音，不要读成纯 ti。',
  kana_tsu: 'つ先轻轻发 ts，再迅速过渡到 u；整体保持一拍。',
  kana_fu: 'ふ不是英语 f；上下唇接近，让气流从唇缝摩擦出来。',
  kana_ra: 'ら行舌尖只轻弹一次，介于中文 r/l 之间，不要卷舌。',
  kana_wo: '现代日语中 を 作助词时通常读 o；先在句子里记住它的功能。',
  kana_n: 'ん是鼻音，鼻腔位置会受后一个音影响；不要额外加 a/i/u/e/o。',
};

const CONFUSION_NOTES: Record<string, string> = {
  kana_a: '与「お」对照时看「あ」中间的交叉结构；不要只凭读音猜字形。',
  kana_o: '「お」与「を」都可能听成 o；「を」主要在助词位置出现。',
  kana_su: '「す」的主体有长尾；与「つ」放一起时看开头和下方的收笔。',
  kana_tsu: '「つ」先看上方的波形；不要把它和「し」的下滑弯线混在一起。',
  kana_nu: '「ぬ」有明显圆圈和长尾；与「め」对照时看收笔是否拖出尾巴。',
  kana_ne: '「ね」有圈和向右回钩；与「れ」放一起看有没有圆圈。',
  kana_ha: '「は」两部分相对分开；「ほ」比它多一条横线。',
  kana_ru: '「る」有小圈；「ろ」没有圈，只有打开的弯线。',
  kana_wa: '「わ」有回钩；不要和「れ」的分叉收笔混淆。',
  kana_ki: '「き」和「さ」都有横线，先看「き」的竖向收笔，再听 ki/sa。',
};

const VOICING_BASE_BY_HIRAGANA: Record<string, string> = {
  が: 'か', ぎ: 'き', ぐ: 'く', げ: 'け', ご: 'こ',
  ざ: 'さ', じ: 'し', ず: 'す', ぜ: 'せ', ぞ: 'そ',
  だ: 'た', ぢ: 'ち', づ: 'つ', で: 'て', ど: 'と',
  ば: 'は', び: 'ひ', ぶ: 'ふ', べ: 'へ', ぼ: 'ほ',
  ぱ: 'は', ぴ: 'ひ', ぷ: 'ふ', ぺ: 'へ', ぽ: 'ほ',
};

const BASE_KANA_SEEDS: KanaItem[] = [
  // ================= あ行 =================
  { id: 'kana_a', type: 'SEION', hiragana: 'あ', katakana: 'ア', romaji: 'a', row: 'あ行', col: 'あ段', mnemonic: '源自汉字草书「安」', audioText: 'あ', sortOrder: 1 },
  { id: 'kana_i', type: 'SEION', hiragana: 'い', katakana: 'イ', romaji: 'i', row: 'あ行', col: 'い段', mnemonic: '源自汉字草书「以」', audioText: 'い', sortOrder: 2 },
  { id: 'kana_u', type: 'SEION', hiragana: 'う', katakana: 'ウ', romaji: 'u', row: 'あ行', col: 'う段', mnemonic: '源自汉字草书「宇」', audioText: 'う', sortOrder: 3 },
  { id: 'kana_e', type: 'SEION', hiragana: 'え', katakana: 'エ', romaji: 'e', row: 'あ行', col: 'え段', mnemonic: '源自汉字草书「衣」', audioText: 'え', sortOrder: 4 },
  { id: 'kana_o', type: 'SEION', hiragana: 'お', katakana: 'オ', romaji: 'o', row: 'あ行', col: 'お段', mnemonic: '源自汉字草书「於」', audioText: 'お', sortOrder: 5 },

  // ================= か行 =================
  { id: 'kana_ka', type: 'SEION', hiragana: 'か', katakana: 'カ', romaji: 'ka', row: 'か行', col: 'あ段', mnemonic: '源自汉字草书「加」', audioText: 'か', sortOrder: 6 },
  { id: 'kana_ki', type: 'SEION', hiragana: 'き', katakana: 'キ', romaji: 'ki', row: 'か行', col: 'い段', mnemonic: '源自汉字草书「幾」', audioText: 'き', sortOrder: 7 },
  { id: 'kana_ku', type: 'SEION', hiragana: 'く', katakana: 'ク', romaji: 'ku', row: 'か行', col: 'う段', mnemonic: '源自汉字草书「久」', audioText: 'く', sortOrder: 8 },
  { id: 'kana_ke', type: 'SEION', hiragana: 'け', katakana: 'ケ', romaji: 'ke', row: 'か行', col: 'え段', mnemonic: '源自汉字草书「計」', audioText: 'け', sortOrder: 9 },
  { id: 'kana_ko', type: 'SEION', hiragana: 'こ', katakana: 'コ', romaji: 'ko', row: 'か行', col: 'お段', mnemonic: '源自汉字草书「己」', audioText: 'こ', sortOrder: 10 },

  // ================= さ行 =================
  { id: 'kana_sa', type: 'SEION', hiragana: 'さ', katakana: 'サ', romaji: 'sa', row: 'さ行', col: 'あ段', mnemonic: '源自汉字草书「左」', audioText: 'さ', sortOrder: 11 },
  { id: 'kana_shi', type: 'SEION', hiragana: 'し', katakana: 'シ', romaji: 'shi', row: 'さ行', col: 'い段', mnemonic: '源自汉字草书「之」', audioText: 'し', sortOrder: 12 },
  { id: 'kana_su', type: 'SEION', hiragana: 'す', katakana: 'ス', romaji: 'su', row: 'さ行', col: 'う段', mnemonic: '源自汉字草书「寸」', audioText: 'す', sortOrder: 13 },
  { id: 'kana_se', type: 'SEION', hiragana: 'せ', katakana: 'セ', romaji: 'se', row: 'さ行', col: 'え段', mnemonic: '源自汉字草书「世」', audioText: 'せ', sortOrder: 14 },
  { id: 'kana_so', type: 'SEION', hiragana: 'そ', katakana: 'ソ', romaji: 'so', row: 'さ行', col: 'お段', mnemonic: '源自汉字草书「曾」', audioText: 'そ', sortOrder: 15 },

  // ================= た行 =================
  { id: 'kana_ta', type: 'SEION', hiragana: 'た', katakana: 'タ', romaji: 'ta', row: 'た行', col: 'あ段', mnemonic: '源自汉字草书「太」', audioText: 'た', sortOrder: 16 },
  { id: 'kana_chi', type: 'SEION', hiragana: 'ち', katakana: 'チ', romaji: 'chi', row: 'た行', col: 'い段', mnemonic: '源自汉字草书「知」', audioText: 'ち', sortOrder: 17 },
  { id: 'kana_tsu', type: 'SEION', hiragana: 'つ', katakana: 'ツ', romaji: 'tsu', row: 'た行', col: 'う段', mnemonic: '源自汉字草书「川」', audioText: 'つ', sortOrder: 18 },
  { id: 'kana_te', type: 'SEION', hiragana: 'て', katakana: 'テ', romaji: 'te', row: 'た行', col: 'え段', mnemonic: '源自汉字草书「天」', audioText: 'て', sortOrder: 19 },
  { id: 'kana_to', type: 'SEION', hiragana: 'と', katakana: 'ト', romaji: 'to', row: 'た行', col: 'お段', mnemonic: '源自汉字草书「止」', audioText: 'と', sortOrder: 20 },

  // ================= な行 =================
  { id: 'kana_na', type: 'SEION', hiragana: 'な', katakana: 'ナ', romaji: 'na', row: 'な行', col: 'あ段', mnemonic: '源自汉字草书「奈」', audioText: 'な', sortOrder: 21 },
  { id: 'kana_ni', type: 'SEION', hiragana: 'に', katakana: 'ニ', romaji: 'ni', row: 'な行', col: 'い段', mnemonic: '源自汉字草书「仁」', audioText: 'に', sortOrder: 22 },
  { id: 'kana_nu', type: 'SEION', hiragana: 'ぬ', katakana: 'ヌ', romaji: 'nu', row: 'な行', col: 'う段', mnemonic: '源自汉字草书「奴」', audioText: 'ぬ', sortOrder: 23 },
  { id: 'kana_ne', type: 'SEION', hiragana: 'ね', katakana: 'ネ', romaji: 'ne', row: 'な行', col: 'え段', mnemonic: '源自汉字草书「祢」', audioText: 'ね', sortOrder: 24 },
  { id: 'kana_no', type: 'SEION', hiragana: 'の', katakana: 'ノ', romaji: 'no', row: 'な行', col: 'お段', mnemonic: '源自汉字草书「乃」', audioText: 'の', sortOrder: 25 },

  // ================= は行 =================
  { id: 'kana_ha', type: 'SEION', hiragana: 'は', katakana: 'ハ', romaji: 'ha', row: 'は行', col: 'あ段', mnemonic: '源自汉字草书「波」', audioText: 'は', sortOrder: 26 },
  { id: 'kana_hi', type: 'SEION', hiragana: 'ひ', katakana: 'ヒ', romaji: 'hi', row: 'は行', col: 'い段', mnemonic: '源自汉字草书「比」', audioText: 'ひ', sortOrder: 27 },
  { id: 'kana_fu', type: 'SEION', hiragana: 'ふ', katakana: 'フ', romaji: 'fu', row: 'は行', col: 'う段', mnemonic: '源自汉字草书「不」', audioText: 'ふ', sortOrder: 28 },
  { id: 'kana_he', type: 'SEION', hiragana: 'へ', katakana: 'ヘ', romaji: 'he', row: 'は行', col: 'え段', mnemonic: '源自汉字草书「部」', audioText: 'へ', sortOrder: 29 },
  { id: 'kana_ho', type: 'SEION', hiragana: 'ほ', katakana: 'ホ', romaji: 'ho', row: 'は行', col: 'お段', mnemonic: '源自汉字草书「保」', audioText: 'ほ', sortOrder: 30 },

  // ================= ま行 =================
  { id: 'kana_ma', type: 'SEION', hiragana: 'ま', katakana: 'マ', romaji: 'ma', row: 'ま行', col: 'あ段', mnemonic: '源自汉字草书「末」', audioText: 'ま', sortOrder: 31 },
  { id: 'kana_mi', type: 'SEION', hiragana: 'み', katakana: 'ミ', romaji: 'mi', row: 'ま行', col: 'い段', mnemonic: '源自汉字草书「美」', audioText: 'み', sortOrder: 32 },
  { id: 'kana_mu', type: 'SEION', hiragana: 'む', katakana: 'ム', romaji: 'mu', row: 'ま行', col: 'う段', mnemonic: '源自汉字草书「武」', audioText: 'む', sortOrder: 33 },
  { id: 'kana_me', type: 'SEION', hiragana: 'め', katakana: 'メ', romaji: 'me', row: 'ま行', col: 'え段', mnemonic: '源自汉字草书「女」', audioText: 'め', sortOrder: 34 },
  { id: 'kana_mo', type: 'SEION', hiragana: 'も', katakana: 'モ', romaji: 'mo', row: 'ま行', col: 'お段', mnemonic: '源自汉字草书「毛」', audioText: 'も', sortOrder: 35 },

  // ================= や行 =================
  { id: 'kana_ya', type: 'SEION', hiragana: 'や', katakana: 'ヤ', romaji: 'ya', row: 'や行', col: 'あ段', mnemonic: '源自汉字草书「也」', audioText: 'や', sortOrder: 36 },
  { id: 'kana_yu', type: 'SEION', hiragana: 'ゆ', katakana: 'ユ', romaji: 'yu', row: 'や行', col: 'う段', mnemonic: '源自汉字草书「由」', audioText: 'ゆ', sortOrder: 37 },
  { id: 'kana_yo', type: 'SEION', hiragana: 'よ', katakana: 'ヨ', romaji: 'yo', row: 'や行', col: 'お段', mnemonic: '源自汉字草书「与」', audioText: 'よ', sortOrder: 38 },

  // ================= ら行 =================
  { id: 'kana_ra', type: 'SEION', hiragana: 'ら', katakana: 'ラ', romaji: 'ra', row: 'ら行', col: 'あ段', mnemonic: '源自汉字草书「良」', audioText: 'ら', sortOrder: 39 },
  { id: 'kana_ri', type: 'SEION', hiragana: 'り', katakana: 'リ', romaji: 'ri', row: 'ら行', col: 'い段', mnemonic: '源自汉字草书「利」', audioText: 'り', sortOrder: 40 },
  { id: 'kana_ru', type: 'SEION', hiragana: 'る', katakana: 'ル', romaji: 'ru', row: 'ら行', col: 'う段', mnemonic: '源自汉字草书「留」', audioText: 'る', sortOrder: 41 },
  { id: 'kana_re', type: 'SEION', hiragana: 'れ', katakana: 'レ', romaji: 're', row: 'ら行', col: 'え段', mnemonic: '源自汉字草书「礼」', audioText: 'れ', sortOrder: 42 },
  { id: 'kana_ro', type: 'SEION', hiragana: 'ろ', katakana: 'ロ', romaji: 'ro', row: 'ら行', col: 'お段', mnemonic: '源自汉字草书「吕」', audioText: 'ろ', sortOrder: 43 },

  // ================= わ行与特殊 =================
  { id: 'kana_wa', type: 'SEION', hiragana: 'わ', katakana: 'ワ', romaji: 'wa', row: 'わ行', col: 'あ段', mnemonic: '源自汉字草书「和」', audioText: 'わ', sortOrder: 44 },
  { id: 'kana_wo', type: 'SEION', hiragana: 'を', katakana: 'ヲ', romaji: 'o', row: 'わ行', col: 'お段', mnemonic: '源自汉字草书「乎」，常作宾语助词', audioText: 'を', sortOrder: 45 },
  { id: 'kana_n', type: 'SPECIAL', hiragana: 'ん', katakana: 'ン', romaji: 'n', row: '特殊', col: '特殊', mnemonic: '源自汉字草书「无」，鼻音拨音', audioText: 'ん', sortOrder: 46 },

  // ================= 浊音 (20) =================
  { id: 'kana_ga', type: 'DAKUON', hiragana: 'が', katakana: 'ガ', romaji: 'ga', row: 'が行', col: 'あ段', audioText: 'が', sortOrder: 47 },
  { id: 'kana_gi', type: 'DAKUON', hiragana: 'ぎ', katakana: 'ギ', romaji: 'gi', row: 'が行', col: 'い段', audioText: 'ぎ', sortOrder: 48 },
  { id: 'kana_gu', type: 'DAKUON', hiragana: 'ぐ', katakana: 'グ', romaji: 'gu', row: 'が行', col: 'う段', audioText: 'ぐ', sortOrder: 49 },
  { id: 'kana_ge', type: 'DAKUON', hiragana: 'げ', katakana: 'ゲ', romaji: 'ge', row: 'が行', col: 'え段', audioText: 'げ', sortOrder: 50 },
  { id: 'kana_go', type: 'DAKUON', hiragana: 'ご', katakana: 'ゴ', romaji: 'go', row: 'が行', col: 'お段', audioText: 'ご', sortOrder: 51 },

  { id: 'kana_za', type: 'DAKUON', hiragana: 'ざ', katakana: 'ザ', romaji: 'za', row: 'ざ行', col: 'あ段', audioText: 'ざ', sortOrder: 52 },
  { id: 'kana_ji', type: 'DAKUON', hiragana: 'じ', katakana: 'ジ', romaji: 'ji', row: 'ざ行', col: 'い段', audioText: 'じ', sortOrder: 53 },
  { id: 'kana_zu', type: 'DAKUON', hiragana: 'ず', katakana: 'ズ', romaji: 'zu', row: 'ざ行', col: 'う段', audioText: 'ず', sortOrder: 54 },
  { id: 'kana_ze', type: 'DAKUON', hiragana: 'ぜ', katakana: 'ゼ', romaji: 'ze', row: 'ざ行', col: 'え段', audioText: 'ぜ', sortOrder: 55 },
  { id: 'kana_zo', type: 'DAKUON', hiragana: 'ぞ', katakana: 'ゾ', romaji: 'zo', row: 'ざ行', col: 'お段', audioText: 'ぞ', sortOrder: 56 },

  { id: 'kana_da', type: 'DAKUON', hiragana: 'だ', katakana: 'ダ', romaji: 'da', row: 'だ行', col: 'あ段', audioText: 'だ', sortOrder: 57 },
  { id: 'kana_dji', type: 'DAKUON', hiragana: 'ぢ', katakana: 'ヂ', romaji: 'ji', row: 'だ行', col: 'い段', audioText: 'ぢ', sortOrder: 58 },
  { id: 'kana_dzu', type: 'DAKUON', hiragana: 'づ', katakana: 'ヅ', romaji: 'zu', row: 'だ行', col: 'う段', audioText: 'づ', sortOrder: 59 },
  { id: 'kana_de', type: 'DAKUON', hiragana: 'で', katakana: 'デ', romaji: 'de', row: 'だ行', col: 'え段', audioText: 'で', sortOrder: 60 },
  { id: 'kana_do', type: 'DAKUON', hiragana: 'ど', katakana: 'ド', romaji: 'do', row: 'だ行', col: 'お段', audioText: 'ど', sortOrder: 61 },

  { id: 'kana_ba', type: 'DAKUON', hiragana: 'ば', katakana: 'バ', romaji: 'ba', row: 'ば行', col: 'あ段', audioText: 'ば', sortOrder: 62 },
  { id: 'kana_bi', type: 'DAKUON', hiragana: 'び', katakana: 'ビ', romaji: 'bi', row: 'ば行', col: 'い段', audioText: 'び', sortOrder: 63 },
  { id: 'kana_bu', type: 'DAKUON', hiragana: 'ぶ', katakana: 'ブ', romaji: 'bu', row: 'ば行', col: 'う段', audioText: 'ぶ', sortOrder: 64 },
  { id: 'kana_be', type: 'DAKUON', hiragana: 'べ', katakana: 'ベ', romaji: 'be', row: 'ば行', col: 'え段', audioText: 'べ', sortOrder: 65 },
  { id: 'kana_bo', type: 'DAKUON', hiragana: 'ぼ', katakana: 'ボ', romaji: 'bo', row: 'ば行', col: 'お段', audioText: 'ぼ', sortOrder: 66 },

  // ================= 半浊音 (5) =================
  { id: 'kana_pa', type: 'HANDAKUON', hiragana: 'ぱ', katakana: 'パ', romaji: 'pa', row: 'ぱ行', col: 'あ段', audioText: 'ぱ', sortOrder: 67 },
  { id: 'kana_pi', type: 'HANDAKUON', hiragana: 'ぴ', katakana: 'ピ', romaji: 'pi', row: 'ぱ行', col: 'い段', audioText: 'ぴ', sortOrder: 68 },
  { id: 'kana_pu', type: 'HANDAKUON', hiragana: 'ぷ', katakana: 'プ', romaji: 'pu', row: 'ぱ行', col: 'う段', audioText: 'ぷ', sortOrder: 69 },
  { id: 'kana_pe', type: 'HANDAKUON', hiragana: 'ぺ', katakana: 'ペ', romaji: 'pe', row: 'ぱ行', col: 'え段', audioText: 'ぺ', sortOrder: 70 },
  { id: 'kana_po', type: 'HANDAKUON', hiragana: 'ぽ', katakana: 'ポ', romaji: 'po', row: 'ぱ行', col: 'お段', audioText: 'ぽ', sortOrder: 71 },

  // ================= 常用拗音 (36) =================
  { id: 'kana_kya', type: 'YOON', hiragana: 'きゃ', katakana: 'キャ', romaji: 'kya', row: 'き拗音', col: 'あ段', audioText: 'きゃ', sortOrder: 72 },
  { id: 'kana_kyu', type: 'YOON', hiragana: 'きゅ', katakana: 'キュ', romaji: 'kyu', row: 'き拗音', col: 'う段', audioText: 'きゅ', sortOrder: 73 },
  { id: 'kana_kyo', type: 'YOON', hiragana: 'きょ', katakana: 'キョ', romaji: 'kyo', row: 'き拗音', col: 'お段', audioText: 'きょ', sortOrder: 74 },

  { id: 'kana_sha', type: 'YOON', hiragana: 'しゃ', katakana: 'シャ', romaji: 'sha', row: 'し拗音', col: 'あ段', audioText: 'しゃ', sortOrder: 75 },
  { id: 'kana_shu', type: 'YOON', hiragana: 'しゅ', katakana: 'シュ', romaji: 'shu', row: 'し拗音', col: 'う段', audioText: 'しゅ', sortOrder: 76 },
  { id: 'kana_sho', type: 'YOON', hiragana: 'しょ', katakana: 'ショ', romaji: 'sho', row: 'し拗音', col: 'お段', audioText: 'しょ', sortOrder: 77 },

  { id: 'kana_cha', type: 'YOON', hiragana: 'ちゃ', katakana: 'チャ', romaji: 'cha', row: 'ち拗音', col: 'あ段', audioText: 'ちゃ', sortOrder: 78 },
  { id: 'kana_chu', type: 'YOON', hiragana: 'ちゅ', katakana: 'チュ', romaji: 'chu', row: 'ち拗音', col: 'う段', audioText: 'ちゅ', sortOrder: 79 },
  { id: 'kana_cho', type: 'YOON', hiragana: 'ちょ', katakana: 'チョ', romaji: 'cho', row: 'ち拗音', col: 'お段', audioText: 'ちょ', sortOrder: 80 },

  { id: 'kana_nya', type: 'YOON', hiragana: 'にゃ', katakana: 'ニャ', romaji: 'nya', row: 'に拗音', col: 'あ段', audioText: 'にゃ', sortOrder: 81 },
  { id: 'kana_nyu', type: 'YOON', hiragana: 'にゅ', katakana: 'ニュ', romaji: 'nyu', row: 'に拗音', col: 'う段', audioText: 'にゅ', sortOrder: 82 },
  { id: 'kana_nyo', type: 'YOON', hiragana: 'にょ', katakana: 'ニョ', romaji: 'nyo', row: 'に拗音', col: 'お段', audioText: 'にょ', sortOrder: 83 },

  { id: 'kana_hya', type: 'YOON', hiragana: 'ひゃ', katakana: 'ヒャ', romaji: 'hya', row: 'ひ拗音', col: 'あ段', audioText: 'ひゃ', sortOrder: 84 },
  { id: 'kana_hyu', type: 'YOON', hiragana: 'ひゅ', katakana: 'ヒュ', romaji: 'hyu', row: 'ひ拗音', col: 'う段', audioText: 'ひゅ', sortOrder: 85 },
  { id: 'kana_hyo', type: 'YOON', hiragana: 'ひょ', katakana: 'ヒョ', romaji: 'hyo', row: 'ひ拗音', col: 'お段', audioText: 'ひょ', sortOrder: 86 },

  { id: 'kana_mya', type: 'YOON', hiragana: 'みゃ', katakana: 'ミャ', romaji: 'mya', row: 'み拗音', col: 'あ段', audioText: 'みゃ', sortOrder: 87 },
  { id: 'kana_myu', type: 'YOON', hiragana: 'みゅ', katakana: 'ミュ', romaji: 'myu', row: 'み拗音', col: 'う段', audioText: 'みゅ', sortOrder: 88 },
  { id: 'kana_myo', type: 'YOON', hiragana: 'みょ', katakana: 'ミョ', romaji: 'myo', row: 'み拗音', col: 'お段', audioText: 'みょ', sortOrder: 89 },

  { id: 'kana_rya', type: 'YOON', hiragana: 'りゃ', katakana: 'リャ', romaji: 'rya', row: 'り拗音', col: 'あ段', audioText: 'りゃ', sortOrder: 90 },
  { id: 'kana_ryu', type: 'YOON', hiragana: 'りゅ', katakana: 'リュ', romaji: 'ryu', row: 'り拗音', col: 'う段', audioText: 'りゅ', sortOrder: 91 },
  { id: 'kana_ryo', type: 'YOON', hiragana: 'りょ', katakana: 'リョ', romaji: 'ryo', row: 'り拗音', col: 'お段', audioText: 'りょ', sortOrder: 92 },

  { id: 'kana_gya', type: 'YOON', hiragana: 'ぎゃ', katakana: 'ギャ', romaji: 'gya', row: 'ぎ拗音', col: 'あ段', audioText: 'ぎゃ', sortOrder: 93 },
  { id: 'kana_gyu', type: 'YOON', hiragana: 'ぎゅ', katakana: 'ギュ', romaji: 'gyu', row: 'ぎ拗音', col: 'う段', audioText: 'ぎゅ', sortOrder: 94 },
  { id: 'kana_gyo', type: 'YOON', hiragana: 'ぎょ', katakana: 'ギョ', romaji: 'gyo', row: 'ぎ拗音', col: 'お段', audioText: 'ぎょ', sortOrder: 95 },

  { id: 'kana_ja', type: 'YOON', hiragana: 'じゃ', katakana: 'ジャ', romaji: 'ja', row: 'じ拗音', col: 'あ段', audioText: 'じゃ', sortOrder: 96 },
  { id: 'kana_ju', type: 'YOON', hiragana: 'じゅ', katakana: 'ジュ', romaji: 'ju', row: 'じ拗音', col: 'う段', audioText: 'じゅ', sortOrder: 97 },
  { id: 'kana_jo', type: 'YOON', hiragana: 'じょ', katakana: 'ジョ', romaji: 'jo', row: 'じ拗音', col: 'お段', audioText: 'じょ', sortOrder: 98 },

  { id: 'kana_bya', type: 'YOON', hiragana: 'びゃ', katakana: 'ビャ', romaji: 'bya', row: 'び拗音', col: 'あ段', audioText: 'びゃ', sortOrder: 99 },
  { id: 'kana_byu', type: 'YOON', hiragana: 'びゅ', katakana: 'ビュ', romaji: 'byu', row: 'び拗音', col: 'う段', audioText: 'びゅ', sortOrder: 100 },
  { id: 'kana_byo', type: 'YOON', hiragana: 'びょ', katakana: 'ビョ', romaji: 'byo', row: 'び拗音', col: 'お段', audioText: 'びょ', sortOrder: 101 },

  { id: 'kana_pya', type: 'YOON', hiragana: 'ぴゃ', katakana: 'ピャ', romaji: 'pya', row: 'ぴ拗音', col: 'あ段', audioText: 'ぴゃ', sortOrder: 102 },
  { id: 'kana_pyu', type: 'YOON', hiragana: 'ぴゅ', katakana: 'ピュ', romaji: 'pyu', row: 'ぴ拗音', col: 'う段', audioText: 'ぴゅ', sortOrder: 103 },
  { id: 'kana_pyo', type: 'YOON', hiragana: 'ぴょ', katakana: 'ピョ', romaji: 'pyo', row: 'ぴ拗音', col: 'お段', audioText: 'ぴょ', sortOrder: 104 },
];

function buildKanaLearningGuide(kana: KanaItem): KanaLearningGuide {
  const examples = KANA_EXAMPLES[kana.id];
  const examplesField = examples ? { exampleWords: examples } : {};

  // 「を」在五十音表中仍归入わ行清音，但需要单独说明它的助词用法。
  if (kana.type === 'SPECIAL' || kana.hiragana === 'を') {
    if (kana.hiragana === 'を') {
      return {
        soundDescription:
          '「を」通常作为宾语助词使用，现代日语里大多读作 o；它本身不是“我”或某个中文词义。',
        memoryTip: SEION_MEMORY_TIPS[kana.id] ?? '把「を」和“动作的对象”绑定，在短句中整体记。',
        pronunciationTip:
          PRONUNCIATION_TIPS[kana.id] ?? '作助词时读 o，短而清楚；不要为了拼写 wo 而读出额外的 w。',
        confusionNotes: CONFUSION_NOTES[kana.id] ?? '听到 o 时看句法位置：宾语常写「を」，普通音节 o 写「お」。',
        ...examplesField,
      };
    }
    return {
      soundDescription:
        '「ん」是拨音，表示一个鼻音拍；它没有像普通假名那样固定的元音，具体鼻音色彩会受后一个音影响。',
      memoryTip: SEION_MEMORY_TIPS[kana.id] ?? '把「ん」记成鼻音收尾，不要给它强行补一个元音。',
      pronunciationTip:
        PRONUNCIATION_TIPS[kana.id] ?? '让声音收在鼻腔，不要读成“恩啊/恩嗯”等多余音节。',
      confusionNotes: '「ん」只表示鼻音拍；和「ね」「ぬ」等带元音的假名相比，结尾不会再打开一个元音。',
      ...examplesField,
    };
  }

  if (kana.type === 'YOON') {
    const baseKana = kana.hiragana.slice(0, -1);
    const smallKana = kana.hiragana.slice(-1);
    return {
      soundDescription:
        `「${kana.hiragana}」由「${baseKana}」和小写的「${smallKana}」合成一拍，读作 ${kana.romaji}；不是把两个完整假名读成两拍。`,
      memoryTip:
        `把大字「${baseKana}」和小「${smallKana}」绑在一起记：${baseKana} + ${smallKana} = ${kana.hiragana}。`,
      pronunciationTip:
        `从「${baseKana}」快速滑向 ${smallKana === 'ゃ' ? 'ya' : smallKana === 'ゅ' ? 'yu' : 'yo'}，合成一拍；不要在中间停顿。`,
      confusionNotes: '小「ゃ/ゅ/ょ」必须比前一个字小；写成大「や/ゆ/よ」时，拍数和读法都会改变。',
      ...examplesField,
    };
  }

  if (kana.type === 'DAKUON' || kana.type === 'HANDAKUON') {
    const baseKana = VOICING_BASE_BY_HIRAGANA[kana.hiragana] ?? '对应清音';
    const isHandakuon = kana.type === 'HANDAKUON';
    const mark = isHandakuon ? '半浊点「゜」' : '浊点「゛」';
    return {
      soundDescription:
        `「${kana.hiragana}」表示 ${kana.romaji} 音，是清音「${baseKana}」加${mark}后的变化；它仍然是一个假名拍。`,
      memoryTip:
        `先认出清音「${baseKana}」，再把右上角的${mark}当成“开关”：有标记，读音就变成 ${kana.romaji}。`,
      pronunciationTip: isHandakuon
        ? '半浊音保留 p 的清脆送气，双唇先闭合再放开；不要把圆圈漏读成 b。'
        : '先摆好对应清音的口形，再让声带振动；浊音不要额外拖长。',
      confusionNotes:
        `最容易漏看右上角的${mark}；与清音「${baseKana}」并排练习，比单独死记更稳。`,
      ...examplesField,
    };
  }

  const memoryTip =
    SEION_MEMORY_TIPS[kana.id] ??
    `先记住「${kana.hiragana}」的形状，再把它和 ${kana.romaji} 的声音绑定。`;
  const pronunciationTip =
    PRONUNCIATION_TIPS[kana.id] ??
    `保持短而清楚的一拍，${kana.romaji} 的元音不要拖长，也不要额外添加中文声调。`;
  const confusionNotes =
    CONFUSION_NOTES[kana.id] ??
    '先看收笔方向和是否有圆圈，再结合罗马字与例词确认；仍然混淆时可以让 AI 做二选一对比。';

  return {
    soundDescription:
      `它表示日语的「${kana.romaji}」音，是一个假名拍；假名本身通常没有独立词义，真正的词义要看它组成的单词。位置：${kana.row} · ${kana.col}。`,
    memoryTip,
    pronunciationTip,
    confusionNotes,
    ...examplesField,
  };
}

/**
 * 对外导出完整课程种子。讲义随课程资产一起进入 SQLite，旧库也会由 bootstrap 补齐。
 */
export const KANA_SEEDS: KanaItem[] = BASE_KANA_SEEDS.map((kana) => ({
  ...kana,
  learningGuide: buildKanaLearningGuide(kana),
}));
