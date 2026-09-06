import { ok, err, BusinessError, type Result } from '@study-studio/shared';
import type { TextbookAST } from '@study-studio/protocol';

/**
 * PDF 提取 Markdown → TextbookAST 初版结构化（纯函数）。
 *
 * 诚实边界（MVP）：
 * - 只结构化「课 / 对话句」：标题切课，说话人前缀（A：/B：/甲：）或引号/陈述句成句；
 * - 生词 / 语法点返回空数组 —— 细粒度抽取走后续「划线转卡」与 AI 结构化，不臆造；
 * - 中文译文填空字符串（PDF 里没有对照译文时不编造）。
 */

const MAX_LESSONS = 20;
const MAX_DIALOGUES_PER_LESSON = 300;
const MAX_MARKDOWN_CHARS = 400000;

const KANA_CLASS = '[぀-ヿｦ-ﾟ]';
const HANGUL_CLASS = '[가-힣ㄱ-ㅎㅏ-ㅣ]';
const HAN_CLASS = '[一-鿿]';

export function detectDocScript(text: string): 'JA' | 'KO' | 'EN' {
  const kana = (text.match(new RegExp(KANA_CLASS, 'g')) ?? []).length;
  const hangul = (text.match(new RegExp(HANGUL_CLASS, 'g')) ?? []).length;
  if (hangul > kana && hangul > 0) return 'KO';
  if (kana > 0) return 'JA';
  if (/[A-Za-z]/.test(text)) return 'EN';
  return 'JA';
}

interface RawSection {
  title: string;
  lines: string[];
}

function cleanLine(raw: string): string | null {
  let line = raw.trim();
  if (!line) return null;
  // 页码标记 / HTML 注释页码
  if (/^<!--\s*Page\s+\d+\s*-->$/i.test(line)) return null;
  // 代码围栏标记行丢弃（内容行照常参与过滤）
  if (/^```/.test(line)) return null;
  // 列表符号
  line = line.replace(/^(\s*([-*+]|\d+[.)])\s+)/, '').trim();
  // Markdown 表格分隔行
  if (/^\|?[\s:|-]+\|?$/.test(line) && line.includes('-')) return null;
  // 目录点线（1 ...... 5）与纯目录标题不进课文
  if (/\.{3,}|…{2,}/.test(line)) return null;
  if (/^(目录|目次|contents?|index)$/i.test(line)) return null;
  // 裸 URL / 图片
  if (/^https?:\/\/\S+$/.test(line)) return null;
  if (/^!\[.*\]\(.*\)$/.test(line)) return null;
  // 标题残留（# 已用于切课，此处防漏网）
  line = line.replace(/^#{1,6}\s+/, '').trim();
  // 表格竖线转空格
  line = line.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
  // 引用符号
  line = line.replace(/^>\s*/, '').trim();
  // 加粗/斜体符号
  line = line.replace(/[*_~]{1,3}/g, '').trim();
  if (line.length < 2) return null;
  // 纯数字页码 / 纯标点
  if (/^[\d\s.,;:!?。，；：！？、…—·\-–—]+$/.test(line)) return null;
  return line;
}

const SPEAKER_PREFIX = /^(.{1,12})[：:]\s*(.+)$/;
// 行内多人说话（如提取器把同页多行并成一行）：在句末标点后的说话人前缀 / 独立引号处切分
const MIDLINE_SPEAKER_SPLIT =
  /(?<=[。！？」!?.])\s*(?=[^\s。！？」!?.：:]{1,12}[：:])|(?<=[。！？!?.])\s*(?=[「"“])/;

function splitSpeakerSegments(cleaned: string): string[] {
  if (!MIDLINE_SPEAKER_SPLIT.test(cleaned)) return [cleaned];
  return cleaned
    .split(MIDLINE_SPEAKER_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function toDialogue(line: string): { speaker: string; japanese: string; chinese: string } | null {
  const m = SPEAKER_PREFIX.exec(line);
  if (m) {
    const speaker = (m[1] ?? '').trim();
    const text = (m[2] ?? '').trim();
    // 排除 URL / 时间戳类误伤
    if (/^https?:/i.test(text)) return null;
    if (speaker.length === 0 || speaker.length > 12 || text.length < 1) return null;
    return { speaker, japanese: text, chinese: '' };
  }
  // 引号独句 → 课文朗读句
  const quoted = /^「(.+)」$/.exec(line) || /^"(.+)"$/.exec(line) || /^“(.+)”$/.exec(line);
  if (quoted?.[1]) {
    return { speaker: '课文', japanese: quoted[1].trim(), chinese: '' };
  }
  // 普通陈述句（至少含一点实质文字）
  if (line.length >= 2) {
    return { speaker: '课文', japanese: line, chinese: '' };
  }
  return null;
}

export function markdownToAst(
  markdown: string,
  options: { title?: string; bookId?: string } = {}
): Result<TextbookAST, BusinessError> {
  if (!markdown || !markdown.trim()) {
    return err(new BusinessError('E_CONTENT_EMPTY', 'PDF 未提取到任何文字（可能是纯图片扫描页且 OCR 无输出）', 'VALIDATION'));
  }
  const capped = markdown.length > MAX_MARKDOWN_CHARS ? markdown.slice(0, MAX_MARKDOWN_CHARS) : markdown;
  const language = detectDocScript(capped);

  // 按一级标题切课；无一级标题则按二级标题切；都没有则整篇一课
  const lines = capped.split('\n');
  const sections: RawSection[] = [];
  let current: RawSection | null = null;
  let seenH1 = false;
  for (const l of lines) {
    if (/^#\s+.+$/.test(l.trim())) {
      seenH1 = true;
      break;
    }
  }
  // 二级标题仅在无一级标题时切课；有一级标题时，只有形如"第N课"的二级标题才另起一课
  const LESSON_H2 = /第.{1,4}课|第.{1,4}課|lesson\s*\d+|unit\s*\d+/i;
  const splitLevel: 1 | 2 | 0 = seenH1 ? 1 : lines.some((l) => /^##\s+.+$/.test(l.trim())) ? 2 : 0;
  for (const l of lines) {
    const trimmed = l.trim();
    const h1 = /^#\s+(.+)$/.exec(trimmed);
    const h2 = splitLevel === 2 ? /^##\s+(.+)$/.exec(trimmed) : null;
    const h2Lesson = splitLevel === 1 ? /^##\s+(.+)$/.exec(trimmed) : null;
    const h = h1 ?? h2 ?? (h2Lesson && LESSON_H2.test(h2Lesson[1] ?? '') ? h2Lesson : null);
    if (h?.[1]) {
      current = { title: h[1].trim(), lines: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: '', lines: [] };
      sections.push(current);
    }
    current.lines.push(l);
  }

  const bookId = options.bookId ?? `pdf-${Date.now().toString(36)}`;
  const bookTitle = options.title ?? sections.find((s) => s.title)?.title ?? 'PDF 导入教材';
  const lessons: TextbookAST['lessons'] = [];
  for (const [si, section] of sections.slice(0, MAX_LESSONS).entries()) {
    const lessonId = `${bookId}-l${si + 1}`;
    const dialogues: TextbookAST['lessons'][number]['dialogues'] = [];
    for (const raw of section.lines) {
      if (dialogues.length >= MAX_DIALOGUES_PER_LESSON) break;
      const cleaned = cleanLine(raw);
      if (!cleaned) continue;
      for (const segment of splitSpeakerSegments(cleaned)) {
        if (dialogues.length >= MAX_DIALOGUES_PER_LESSON) break;
        const d = toDialogue(segment);
        if (!d) continue;
        dialogues.push({ speaker: d.speaker, japanese: d.japanese, chinese: d.chinese });
      }
    }
    if (dialogues.length === 0) continue;
    lessons.push({
      id: lessonId,
      lessonNumber: si + 1,
      title: section.title || `第 ${si + 1} 课`,
      vocabularies: [],
      grammarPoints: [],
      dialogues,
      exercises: [],
    });
  }

  if (lessons.length === 0) {
    return err(
      new BusinessError('E_CONTENT_EMPTY', 'PDF 文字可提取，但未能切出课文句（可能全是目录/表格/页眉页脚）', 'VALIDATION')
    );
  }
  return ok({
    id: bookId,
    language,
    title: bookTitle,
    shortTitle: bookTitle.length > 12 ? bookTitle.slice(0, 12) : bookTitle,
    level: 'N5',
    publisher: 'PDF导入（自有资料）',
    lessons,
  });
}
