import type { TrackLanguage } from '../learning/learning-shell.js';

/**
 * AI 回复可朗读文本抽取（纯函数，与 UI 解耦）。
 *
 * 规则：
 * 1. 先剥 markdown 噪声（代码围栏/行内代码/链接/图片/标题/引用/列表/表格/HTML/URL），
 *    避免 TTS 把 `*`、反引号、URL 逐字读出来；
 * 2. 只保留含目标语种文字的片段 —— 中文讲解用日语声音读出来是灾难，
 *    没有目标语片段时返回 null（调用方隐藏播放按钮）；
 * 3. 截断到 600 字以内（网关上限 1000，留余量）。
 */
const KANA_RE = /[\u3040-\u30ff\uff66-\uff9f]/u;
const HANGUL_RE = /[\uac00-\ud7a3\u1100-\u11ff\u3130-\u318f]/u;
const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/u;
const LATIN_RE = /[A-Za-z]/u;
const KANA_RE_GLOBAL = new RegExp("[぀-ヿｦ-ﾟ]", 'gu');
const HANGUL_RE_GLOBAL = new RegExp("[가-힣ᄀ-ᇿ㄰-㆏]", 'gu');
const LATIN_RE_GLOBAL = /[A-Za-z]/gu;
const HAN_RE_GLOBAL = new RegExp("[一-鿿]", 'gu');

function countMatches(line: string, re: RegExp): number {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(line)) n++;
  re.lastIndex = 0;
  return n;
}

/** 去掉不含目标语字符的括号片段（中文注释 / 罗马字注音不读）。 */
function stripNonTargetParens(line: string, track: string): string {
  const signal = track === 'ko' ? HANGUL_RE : KANA_RE;
  const parenRe = new RegExp("[(（][^()（）]*[)）]", 'g');
  return line.replace(parenRe, (span) => (signal.test(span) ? span : ' '));
}

const MAX_SPEAKABLE_LENGTH = 600;

function stripMarkdownNoise(raw: string): string {
  return (
    raw
      // 代码围栏整块删
      .replace(/```[\s\S]*?```/g, ' ')
      // 行内代码删
      .replace(/`[^`]*`/g, ' ')
      // 图片 whole 删，链接只留文字
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // 裸 URL 删
      .replace(/https?:\/\/\S+/g, ' ')
      // HTML 标签删
      .replace(/<[^>]+>/g, ' ')
      .split('\n')
      .map((line) =>
        line
          // 标题/引用/列表/表格符号
          .replace(/^\s{0,3}(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, '')
          .replace(/\|/g, ' ')
          .replace(/[*_~#]/g, '')
          .trim()
      )
      .filter(Boolean)
      .join('\n')
  );
}

/** 目标语字符计数（ja=假名，ko=谚文，en=拉丁字母）。 */
function countTargetChars(line: string, track: string): number {
  if (track === 'ko') return countMatches(line, HANGUL_RE_GLOBAL);
  if (track === 'en') return countMatches(line, LATIN_RE_GLOBAL);
  return countMatches(line, KANA_RE_GLOBAL);
}

function keepTargetScriptLine(line: string, track: string): boolean {
  // 英文轨：整行无 CJK 且含拉丁字母（严格，避免中文行漏网）
  if (track === 'en') return LATIN_RE.test(line) && !CJK_RE.test(line);
  // 日/韩轨：先去掉不含目标语的括号注音/注释放（中文释义、罗马字不读），
  // 再按目标语密度判定 —— 汉字与中文共用码点，只有一个「で」的中文行必须滤掉。
  const deglossed = stripNonTargetParens(line, track);
  const target = countTargetChars(deglossed, track);
  if (target < 2) return false;
  const han = countMatches(deglossed, HAN_RE_GLOBAL);
  if (target + han === 0) return false;
  const ratio = target / (target + han);
  return track === 'ko' ? ratio >= 0.6 : ratio >= 0.35;
}

/** 抽取可朗读文本；无目标语片段时返回 null。 */
export function toSpeakableText(
  markdown: string,
  track: TrackLanguage | string | null | undefined
): string | null {
  const normalized = (track ?? 'ja').toLowerCase();
  const cleaned = stripMarkdownNoise(markdown);
  if (!cleaned) return null;
  const kept = cleaned
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0 && keepTargetScriptLine(line, normalized));
  if (kept.length === 0) return null;
  const joined = kept.join(' ');
  return joined.length > MAX_SPEAKABLE_LENGTH
    ? joined.slice(0, MAX_SPEAKABLE_LENGTH)
    : joined;
}
