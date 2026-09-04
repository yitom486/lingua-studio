/**
 * 仅生成用户主动打开的外部检索链接。
 * 这里不请求、不抓取，也不缓存 OJAD 的任何页面或数据。
 */
export function buildOjadSearchUrl(query: string): string | undefined {
  const normalized = query.trim();
  if (!normalized || normalized.length > 64) return undefined;
  return `https://www.gavo.t.u-tokyo.ac.jp/ojad/search/index/word:${encodeURIComponent(normalized)}`;
}
