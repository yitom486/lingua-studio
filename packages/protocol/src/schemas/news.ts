import { z } from 'zod';

/** 阅读新闻栏目（Gateway / 前端共用 SSOT） */
export const NewsTopicSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type NewsTopic = z.infer<typeof NewsTopicSchema>;

/**
 * 首发栏目枚举。Gateway 按语言映射公开 RSS：
 * - EN（默认）→ BBC / The Guardian / NPR
 * - JA → NHK ONE（news.web.nhk/.../catN.xml）
 * - KO → 预留（interim 英文媒体；正式韩语社 RSS 后替换）
 * 拉取失败时回退合规模板稿。
 */
export const NEWS_TOPICS: readonly NewsTopic[] = [
  { id: 'technology', label: '科技 Tech' },
  { id: 'world', label: '国际 World' },
  { id: 'culture', label: '文化 Culture' },
  { id: 'business', label: '商业 Business' },
  { id: 'sports', label: '体育 Sports' },
  { id: 'exam_prep', label: '应试 Exam' },
] as const;

export function listNewsTopics(): NewsTopic[] {
  return [...NEWS_TOPICS];
}

export function isKnownNewsTopic(id: string): boolean {
  return NEWS_TOPICS.some((t) => t.id === id);
}
