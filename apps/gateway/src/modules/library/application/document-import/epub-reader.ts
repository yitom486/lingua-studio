import { BusinessError } from '@study-studio/shared';
// 跨模块复用（G5 登记）：zip 安全解包（炸弹/加密守卫）；只读内存，不写盘。
import { extractZip } from '../pdf-import/archive.js';

/**
 * EPUB 文本提取（clean-room，自研解析）。
 * EPUB = zip：container.xml 定 OPF → manifest/spine 定章节顺序 → XHTML 脱衣成 markdown。
 * 只取正文（跳封面/NCX/样式/字体/图片）；章节上限 200，总字符上限 2MB（后级 markdownToAst 另有上限）。
 */

const MAX_CHAPTERS = 200;
const MAX_TOTAL_CHARS = 2 * 1024 * 1024;

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m?.[1] ?? undefined;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : '';
    });
}

/** 单章 XHTML → markdown（标题/段落/换行保留，其余脱衣）。 */
export function xhtmlToMarkdown(xhtml: string): string {
  let html = xhtml.replace(/<head[\s\S]*?<\/head>/gi, '');
  html = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  html = html.replace(/<br\s*\/?>/gi, '\n');
  html = html.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) => {
    const hashes = '#'.repeat(Math.min(6, Number(level) || 1));
    return `\n\n${hashes} ${inner}\n\n`;
  });
  html = html.replace(/<\/(p|div|section|article|li|tr|h\d)>/gi, '\n\n');
  html = html.replace(/<[^>]+>/g, '');
  const lines = decodeEntities(html)
    .split('\n')
    .map((line) => line.replace(/[ \t\u3000]+/g, ' ').trim())
    .filter((line) => line.length > 0);
  return lines.join('\n');
}

function resolveRelative(baseDir: string, href: string): string {
  const clean = href.split('#')[0]?.split('?')[0] ?? '';
  if (!clean || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(clean)) return clean;
  const parts: string[] = [...baseDir.split('/').filter((p) => p.length > 0), ...clean.split('/')];
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

/** zip 条目 → EPUB 正文 markdown（抛中文 BusinessError）。 */
export function extractEpubText(bytes: Uint8Array, filename: string): { title: string; markdown: string } {
  void filename;
  let entries;
  try {
    entries = extractZip(bytes);
  } catch (e) {
    if (e instanceof BusinessError) throw e;
    throw new BusinessError('E_INVALID_INPUT', '不是有效的 EPUB 文件（zip 解析失败）', 'VALIDATION', false);
  }
  const byPath = new Map(entries.map((e) => [e.path, e.data]));
  const containerRaw = byPath.get('META-INF/container.xml');
  if (!containerRaw) {
    throw new BusinessError('E_INVALID_INPUT', 'EPUB 缺少 container.xml', 'VALIDATION', false);
  }
  const container = Buffer.from(containerRaw).toString('utf8');
  const rootfile = container.match(/<rootfile\b[^>]*full-path="([^"]+)"/i)?.[1];
  if (!rootfile) {
    throw new BusinessError('E_INVALID_INPUT', 'EPUB 未声明 OPF 入口', 'VALIDATION', false);
  }
  const opfRaw = byPath.get(rootfile);
  if (!opfRaw) {
    throw new BusinessError('E_INVALID_INPUT', 'EPUB 的 OPF 文件缺失', 'VALIDATION', false);
  }
  const opf = Buffer.from(opfRaw).toString('utf8');
  const opfDir = rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/')) : '';
  const title =
    opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1]?.trim() || '未命名电子书';
  const manifest = new Map<string, string>();
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const tag = m[0] ?? '';
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    const mediaType = (attr(tag, 'media-type') ?? '').toLowerCase();
    if (id && href && (mediaType.includes('xhtml') || mediaType.includes('html'))) {
      manifest.set(id, resolveRelative(opfDir, decodeEntities(href)));
    }
  }
  const spine: string[] = [];
  for (const m of opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/gi)) {
    if (m[1]) spine.push(m[1]);
  }
  if (spine.length === 0) {
    throw new BusinessError('E_INVALID_INPUT', 'EPUB 没有可读章节', 'VALIDATION', false);
  }
  const chapters: string[] = [];
  let total = 0;
  for (const id of spine.slice(0, MAX_CHAPTERS)) {
    const path = manifest.get(id);
    if (!path) continue;
    const data = byPath.get(path);
    if (!data) continue;
    const text = xhtmlToMarkdown(Buffer.from(data).toString('utf8'));
    if (!text) continue;
    total += text.length;
    if (total > MAX_TOTAL_CHARS) break;
    chapters.push(text);
  }
  if (chapters.length === 0) {
    throw new BusinessError('E_CONTENT_EMPTY', 'EPUB 章节均为空', 'VALIDATION', false);
  }
  return { title, markdown: `# ${title}\n\n${chapters.join('\n\n')}` };
}
