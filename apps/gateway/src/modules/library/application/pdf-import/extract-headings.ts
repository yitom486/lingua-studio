/**
 * 目录/标题抽取（纯函数）：Markdown → 每页标题 + 目录条目。
 * 有目录的书：目录条目（第N課 + 印刷页码）即 ground truth；
 * 无目录的书：调用方先扫全书标题建地图（见 mapPdfPages），再按标题页导入。
 */

export interface PageHeading {
  page: number;
  level: number;
  text: string;
  /** 版式特征（layout-headings 补上；只有观测，没有时缺席） */
  relSize?: number;
  bold?: boolean;
  centered?: boolean;
  standalone?: boolean;
  hasNumbering?: boolean;
  structRole?: string;
}

export interface TocEntry {
  label: string;
  lessonNo: string;
  printedPage: number;
}

const HEADING_LINE = /^(#{1,6})\s+(.+)$/;
const LESSON_HEAD = /第\s*[0-9一二三四五六七八九十百]+\s*[課课]|Lesson\s*\d+|Unit\s*\d+|復習|复习|練習|练习|会話|かいわ/;
// 目录行：第N課 ... 数字（点线/空格分隔）
const TOC_LINE =
  /第\s*([0-9一二三四五六七八九十百]+)\s*[課课]\s*(.{0,30}?)\s*[.…·\s]{2,}(\d{1,4})\s*$/;

export function extractHeadingsFromMarkdown(markdown: string, page: number): PageHeading[] {
  const out: PageHeading[] = [];
  for (const raw of markdown.split('\n')) {
    const m = HEADING_LINE.exec(raw.trim());
    if (!m) continue;
    const text = (m[2] ?? '').trim().slice(0, 40);
    if (!text || !LESSON_HEAD.test(text)) continue;
    out.push({ page, level: m[1]?.length ?? 1, text });
  }
  return out;
}

/** 目录条目抽取（尽力而为；无目录返回空数组，调用方改走全书标题地图）。 */
export function extractTocEntries(markdown: string): TocEntry[] {
  const out: TocEntry[] = [];
  const seen = new Set<string>();
  for (const raw of markdown.split('\n')) {
    const line = raw
      .replace(/^#{1,6}\s+/, '')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line.length > 80) continue;
    const m = TOC_LINE.exec(line);
    if (!m) continue;
    const lessonNo = (m[1] ?? '').trim();
    const printedPage = Number(m[3]);
    const key = `${lessonNo}@${printedPage}`;
    if (!lessonNo || !Number.isFinite(printedPage) || seen.has(key)) continue;
    seen.add(key);
    out.push({ label: line.slice(0, 40), lessonNo, printedPage });
  }
  return out;
}
