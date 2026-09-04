/**
 * 获取当前 ISO 时间戳字符串
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 增加或减少指定天数
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
