/**
 * 假名混淆干扰项（纯函数，无静态表）。
 * 优先级：同行（しゅ→しゃ/しょ）> 同首字 > 浊点/半浊点变体 > 同段 > 随机补齐。
 * 候选一律取自题池现存字面，绝不臆造选项。
 */
import type { KanaItem } from '@study-studio/protocol';

export type KanaScript = 'HIRAGANA' | 'KATAKANA';

const HIRA_MIN = 0x3041;
const HIRA_MAX = 0x3096;
const KATA_MIN = 0x30a1;
const KATA_MAX = 0x30f6;

function inKanaBlock(code: number): boolean {
  return (code >= HIRA_MIN && code <= HIRA_MAX) || (code >= KATA_MIN && code <= KATA_MAX);
}

/** 单字浊点/半浊点变体（Unicode ±1/±2，落在假名区内才保留，由池行存在性二次确认）。 */
export function voicingVariants(ch: string): string[] {
  const code = ch.codePointAt(0);
  if (code === undefined || !inKanaBlock(code)) return [];
  const out: string[] = [];
  for (const d of [-2, -1, 1, 2]) {
    const candidate = String.fromCodePoint(code + d);
    const candidateCode = candidate.codePointAt(0);
    if (candidateCode !== undefined && inKanaBlock(candidateCode)) out.push(candidate);
  }
  return out;
}

function faceOf(kana: KanaItem, script: KanaScript): string {
  return script === 'KATAKANA' ? kana.katakana : kana.hiragana;
}

/**
 * 为目标假名挑选混淆干扰项字面（不含正确答案）。
 * @param count 需要几个（默认 3；池不足时有多少给多少）。
 */
export function confusionDistractors(
  target: KanaItem,
  pool: KanaItem[],
  script: KanaScript,
  count = 3
): string[] {
  const answer = faceOf(target, script);
  const faces = new Set<string>();
  for (const k of pool) {
    const face = faceOf(k, script);
    if (face && face !== answer) faces.add(face);
  }
  if (faces.size === 0) return [];

  // 字面 → 优先级（数字越小越混淆）
  const rank = new Map<string, number>();
  const bump = (face: string, priority: number) => {
    if (!face || face === answer || !faces.has(face)) return;
    rank.set(face, Math.min(rank.get(face) ?? 99, priority));
  };

  for (const k of pool) {
    if (k.id === target.id) continue;
    const face = faceOf(k, script);
    if (!face || face === answer) continue;
    // 同行（如 し拗音：しゃ/しゅ/しょ互为干扰）
    if (k.row && target.row && k.row === target.row) bump(face, 0);
    // 同首字（如 きゃ/きゅ/きょ/き）
    if (k.hiragana[0] && target.hiragana[0] && k.hiragana[0] === target.hiragana[0]) bump(face, 1);
    // 同段不同行（如 う段：う/く/す/つ/ぬ…）
    if (k.col && target.col && k.col === target.col) bump(face, 3);
  }
  // 浊点/半浊点变体（は→ば/ぱ，しゅ→じゅ…）：首字变体 + 剩余部分
  for (const variant of voicingVariants(answer[0] ?? '')) {
    bump(variant + answer.slice(1), 2);
  }

  const ranked = [...rank.entries()]
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
    .map(([face]) => face);
  const picked = ranked.slice(0, count);
  if (picked.length < count) {
    const rest = [...faces].filter((f) => !picked.includes(f)).sort(() => 0.5 - Math.random());
    picked.push(...rest.slice(0, count - picked.length));
  }
  return picked;
}
