/**
 * 阅读正文展示用：剥残留 HTML（防御已入库的脏 RSS 摘要）。
 * 正式清洗仍应以 Gateway sanitizeRssText 为准。
 */
export function toPlainReadingText(raw: string): string {
  if (!raw) return '';
  let text = raw;
  if (/&lt;|&gt;|&amp;/i.test(text)) {
    text = text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&amp;/g, '&');
  }
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // 旧新闻正文可能内嵌 Source link / 原文リンク，UI 已有「查看原文」按钮
  text = text
    .split('\n')
    .filter((line) => !/^\s*(Source link|原文リンク|原文链接)\s*[:：]/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}
