import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GATEWAY_BASE_URL } from '../lib/api-client.js';
import { DEFAULT_USER_ID, QUERY_KEYS } from './query-keys.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import { normalizeTrackLanguage } from '../learning/learning-shell.js';

/** P1-2 拆分：练习队列组（自 useLearnerQueries.ts 逐行平移，仅改 import）。 */

/** 练习队列集合列表（≠ FSRS 卡） */
export function usePracticeCollectionsQuery(userId = DEFAULT_USER_ID) {
  const profileLang = useUserProfileStore((s) => s.profile.targetLanguage);
  const targetLanguage = normalizeTrackLanguage(profileLang);
  return useQuery({
    queryKey: [...QUERY_KEYS.PRACTICE_COLLECTIONS, userId, targetLanguage],
    queryFn: async () => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/practice/collections/${userId}?lang=${targetLanguage}`
      );
      if (!res.ok) throw new Error('加载练习队列失败');
      return (await res.json()) as Array<{
        id: string;
        title: string;
        intent: string;
        createdAt: string;
      }>;
    },
  });
}

/** 某集合下的练习条目 */
export function usePracticeItemsQuery(collectionId: string | null, userId = DEFAULT_USER_ID) {
  const profileLang = useUserProfileStore((s) => s.profile.targetLanguage);
  const targetLanguage = normalizeTrackLanguage(profileLang);
  return useQuery({
    queryKey: [...QUERY_KEYS.PRACTICE_ITEMS, userId, collectionId, targetLanguage],
    enabled: Boolean(collectionId),
    queryFn: async () => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/practice/collections/${userId}/${collectionId}/items`
      );
      if (!res.ok) throw new Error('加载练习条目失败');
      return (await res.json()) as Array<{
        id: string;
        collectionId: string;
        question: {
          prompt: string;
          content: string;
          correctAnswer: string;
          explanation: string;
          testedSkillId: string;
        };
        skillIds: string[];
        sortOrder: number;
      }>;
    },
  });
}

/** 勾选练习条目 → 显式转入 FSRS */
export function usePracticeItemsToCardsMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemIds: string[]) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/items/${userId}/to-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { userMessage?: string } | null;
        throw new Error(body?.userMessage || '转入复习失败');
      }
      return (await res.json()) as {
        createdCount: number;
        cardIds: string[];
        skippedItemIds: string[];
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CARDS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PRACTICE_COLLECTIONS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PRACTICE_ITEMS });
    },
  });
}
