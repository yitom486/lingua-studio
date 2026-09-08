/**
 * 练习集合标题人类化（纯函数，可单测）。
 * 网关自动标题形如「练习 ? generate_writing_prompt ? 2026-09-07」
 * （action slug + 日期），展示时只留意图中文 + 日期，技术 slug 不再泄漏到 UI；
 * 用户/教材起的有意义标题原样保留。
 */
const ACTION_LABELS: Array<[RegExp, string]> = [
  [/generate_writing_prompt/i, '写作题干'],
  [/generate_quiz/i, '自适应出题'],
  [/generate_for_block/i, '计划组题'],
  [/dictation/i, '听写'],
  [/kana/i, '假名'],
  [/hangul/i, '谚文'],
];

export function humanizeCollectionTitle(title: string): string {
  let label = title;
  for (const [re, zh] of ACTION_LABELS) {
    if (re.test(title)) {
      label = zh;
      break;
    }
  }
  const date = title.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (label !== title && date) return `${label} · ${date.slice(5)}`;
  if (label !== title) return label;
  return title;
}
