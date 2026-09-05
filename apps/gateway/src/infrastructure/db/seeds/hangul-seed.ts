import type { HangulItem } from '@study-studio/protocol';

/**
 * 谚文字母底座（14 子音 + 10 母音，修正罗马字；复合母音与收音变化放后续迭代）。
 * 注音/构形说明面向中文母语初学者，力求短准，勿写成长文。
 */
export const HANGUL_SEEDS: HangulItem[] = [
  // ================= 子音 (14) =================
  { id: 'hangul_g', type: 'CONSONANT', jamo: 'ㄱ', name: '기역', romanization: 'g', row: '자음', col: '软腭音', mnemonic: '舌根抵软腭之形', audioText: 'ㄱ', sortOrder: 1 },
  { id: 'hangul_n', type: 'CONSONANT', jamo: 'ㄴ', name: '니은', romanization: 'n', row: '자음', col: '舌尖音', mnemonic: '舌尖抵上齿龈之形', audioText: 'ㄴ', sortOrder: 2 },
  { id: 'hangul_d', type: 'CONSONANT', jamo: 'ㄷ', name: '디귿', romanization: 'd', row: '자음', col: '舌尖音', mnemonic: 'ㄴ加一横，舌尖塞音', audioText: 'ㄷ', sortOrder: 3 },
  { id: 'hangul_r', type: 'CONSONANT', jamo: 'ㄹ', name: '리을', romanization: 'r', row: '자음', col: '舌尖音', mnemonic: '舌尖弹动之形，近 l/r 之间', audioText: 'ㄹ', sortOrder: 4 },
  { id: 'hangul_m', type: 'CONSONANT', jamo: 'ㅁ', name: '미음', romanization: 'm', row: '자음', col: '唇音', mnemonic: '嘴唇闭合之形', audioText: 'ㅁ', sortOrder: 5 },
  { id: 'hangul_b', type: 'CONSONANT', jamo: 'ㅂ', name: '비읍', romanization: 'b', row: '자음', col: '唇音', mnemonic: 'ㅁ加笔画，嘴唇塞音', audioText: 'ㅂ', sortOrder: 6 },
  { id: 'hangul_s', type: 'CONSONANT', jamo: 'ㅅ', name: '시옷', romanization: 's', row: '자음', col: '齿音', mnemonic: '牙齿缝隙之形', audioText: 'ㅅ', sortOrder: 7 },
  { id: 'hangul_ng', type: 'CONSONANT', jamo: 'ㅇ', name: '이응', romanization: 'ng', row: '자음', col: '喉音', mnemonic: '喉咙圆形；首音不发音，收音发 ng', audioText: 'ㅇ', sortOrder: 8 },
  { id: 'hangul_j', type: 'CONSONANT', jamo: 'ㅈ', name: '지읒', romanization: 'j', row: '자음', col: '舌尖音', mnemonic: '舌尖抵齿龈之形', audioText: 'ㅈ', sortOrder: 9 },
  { id: 'hangul_ch', type: 'CONSONANT', jamo: 'ㅊ', name: '치읓', romanization: 'ch', row: '자음', col: '舌尖音', mnemonic: 'ㅈ加一横，送气', audioText: 'ㅊ', sortOrder: 10 },
  { id: 'hangul_k', type: 'CONSONANT', jamo: 'ㅋ', name: '키읔', romanization: 'k', row: '자음', col: '软腭音', mnemonic: 'ㄱ加一横，送气', audioText: 'ㅋ', sortOrder: 11 },
  { id: 'hangul_t', type: 'CONSONANT', jamo: 'ㅌ', name: '티읕', romanization: 't', row: '자음', col: '舌尖音', mnemonic: 'ㄷ加笔画，送气', audioText: 'ㅌ', sortOrder: 12 },
  { id: 'hangul_p', type: 'CONSONANT', jamo: 'ㅍ', name: '피읖', romanization: 'p', row: '자음', col: '唇音', mnemonic: 'ㅂ加笔画，送气', audioText: 'ㅍ', sortOrder: 13 },
  { id: 'hangul_h', type: 'CONSONANT', jamo: 'ㅎ', name: '히읗', romanization: 'h', row: '자음', col: '喉音', mnemonic: '气流通过之形', audioText: 'ㅎ', sortOrder: 14 },
  // ================= 母音 (10) =================
  { id: 'hangul_a', type: 'VOWEL', jamo: 'ㅏ', name: '아', romanization: 'a', row: '모음', col: '天·地·人', mnemonic: '天在右，开口 a', audioText: 'ㅏ', sortOrder: 15 },
  { id: 'hangul_eo', type: 'VOWEL', jamo: 'ㅓ', name: '어', romanization: 'eo', row: '모음', col: '天·地·人', mnemonic: '天在左，eo', audioText: 'ㅓ', sortOrder: 16 },
  { id: 'hangul_o', type: 'VOWEL', jamo: 'ㅗ', name: '오', romanization: 'o', row: '모음', col: '天·地·人', mnemonic: '天在上，o', audioText: 'ㅗ', sortOrder: 17 },
  { id: 'hangul_u', type: 'VOWEL', jamo: 'ㅜ', name: '우', romanization: 'u', row: '모음', col: '天·地·人', mnemonic: '天在下，u', audioText: 'ㅜ', sortOrder: 18 },
  { id: 'hangul_eu', type: 'VOWEL', jamo: 'ㅡ', name: '으', romanization: 'eu', row: '모음', col: '天·地·人', mnemonic: '地横，eu', audioText: 'ㅡ', sortOrder: 19 },
  { id: 'hangul_i', type: 'VOWEL', jamo: 'ㅣ', name: '이', romanization: 'i', row: '모음', col: '天·地·人', mnemonic: '人直，i', audioText: 'ㅣ', sortOrder: 20 },
  { id: 'hangul_ae', type: 'VOWEL', jamo: 'ㅐ', name: '애', romanization: 'ae', row: '모음', col: '天·地·人', mnemonic: 'ㅏ加一竖，ae', audioText: 'ㅐ', sortOrder: 21 },
  { id: 'hangul_e', type: 'VOWEL', jamo: 'ㅔ', name: '에', romanization: 'e', row: '모음', col: '天·地·人', mnemonic: 'ㅓ加一竖，e', audioText: 'ㅔ', sortOrder: 22 },
  { id: 'hangul_oe', type: 'VOWEL', jamo: 'ㅚ', name: '외', romanization: 'oe', row: '모음', col: '天·地·人', mnemonic: 'ㅗ加一竖，oe', audioText: 'ㅚ', sortOrder: 23 },
  { id: 'hangul_wi', type: 'VOWEL', jamo: 'ㅟ', name: '위', romanization: 'wi', row: '모음', col: '天·地·人', mnemonic: 'ㅜ加一竖，wi', audioText: 'ㅟ', sortOrder: 24 },
];
