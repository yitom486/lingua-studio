import { z } from 'zod';

/** 阅读新闻栏目（Gateway / 前端共用 SSOT） */
export const NewsTopicSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type NewsTopic = z.infer<typeof NewsTopicSchema>;

/**
 * 首发栏目枚举。真实 RSS/API 接入前，生成稿仍走 Gateway 合规模板，
 * 但栏目 ID 与文案以此表为准，禁止前端另写一套。
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
