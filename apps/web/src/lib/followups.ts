/**
 * AI 导师追问 chips：从 AI 上一条回复中抽取它真正提出的问题，
 * 而不是永远显示三条写死文案（纯函数，与 UI 解耦）。
 *
 * 规则：
 * 1. 剥 markdown 噪声（代码块/链接/符号/引用），避免把 `**` 读进 chips；
 * 2. 只收以 ? / ？结尾的疑问句，4–28 字（太长点不下，太短无意义）；
 * 3. 去重、保序、最多 3 条；抽不到返回空数组（调用方回退轨道默认 chips）。
 */
const MAX_FOLLOWUP_LENGTH = 28;
const MIN_FOLLOWUP_LENGTH = 3;
const MAX_FOLLOWUPS = 3;

function stripNoise(raw: string): string {
  return (
    raw
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .split('\n')
      .map((line) =>
        line
          .replace(/^\s{0,3}(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, '')
          .replace(/[*_~#|]/g, '')
          .trim()
      )
      .filter(Boolean)
      .join('\n')
  );
}

/** 从 AI 回复中抽取追问候选；抽不到返回 []。 */
export function extractFollowUps(aiText: string): string[] {  if (!aiText.trim()) return [];
  const cleaned = stripNoise(aiText);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const segment of cleaned.split(/(?<=[?？])\s+|\n+/)) {
    const s = segment.replace(/\s+/g, ' ').trim();
    if (!/[?？]$/.test(s)) continue;
    if (s.length < MIN_FOLLOWUP_LENGTH || s.length > MAX_FOLLOWUP_LENGTH) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_FOLLOWUPS) break;
  }
  return out;
}

export const PREDICTED_BLOCK_MARKER = '【追问】';

/**
 * 解析模型按指令追加的末尾预测块：
 *   …正文…
 *   【追问】
 *   1. ……？
 *   2. ……？
 * 返回 { chips, displayText }：displayText 为剥离预测块后的正文（用于展示与朗读）。
 * 无合法块时 chips 为 [] 且 displayText 原样返回（调用方降级到 extractFollowUps）。
 */
export function extractPredictedFollowUps(aiText: string): { chips: string[]; displayText: string } {
  const fallback = { chips: [] as string[], displayText: aiText };
  const markerIdx = aiText.lastIndexOf(PREDICTED_BLOCK_MARKER);
  if (markerIdx < 0) return fallback;
  // 标记行本身必须独占一行（防正文偶然出现该词）
  const lineStart = aiText.lastIndexOf('\n', markerIdx - 1) + 1;
  const markerLineEnd = aiText.indexOf('\n', markerIdx);
  const markerLine = aiText.slice(lineStart, markerLineEnd < 0 ? aiText.length : markerLineEnd).trim();
  if (markerLine !== PREDICTED_BLOCK_MARKER) return fallback;
  const tail = aiText.slice(markerLineEnd < 0 ? aiText.length : markerLineEnd + 1);
  const tailLines = tail
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (tailLines.length === 0 || tailLines.length > 4) return fallback;
  const chips: string[] = [];
  for (const line of tailLines) {
    const cleaned = line
      .replace(/^\s*(?:\d+[.)、]|[•\-*])\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!/[?？]$/.test(cleaned)) continue;
    if (cleaned.length < 2 || cleaned.length > MAX_FOLLOWUP_LENGTH) continue;
    if (chips.includes(cleaned)) continue;
    chips.push(cleaned);
    if (chips.length >= MAX_FOLLOWUPS) break;
  }
  if (chips.length === 0) return fallback;
  return { chips, displayText: aiText.slice(0, lineStart).trimEnd() };
}
