import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TEXTBOOK_BOOKS, type TextbookBook } from '../data/textbook-data.js';
import {
  SKILL_METRICS_JP,
  INITIAL_MISTAKES,
  type MistakeNotebookItem,
} from '../data/learning-data.js';

export const QUERY_KEYS = {
  TEXTBOOKS: ['learner', 'textbooks'] as const,
  PROFILE: ['learner', 'profile'] as const,
  MISTAKES: ['learner', 'mistakes'] as const,
};

/**
 * 获取多语种教材课本树 (TanStack Query)
 */
export function useTextbooksQuery() {
  return useQuery<TextbookBook[]>({
    queryKey: QUERY_KEYS.TEXTBOOKS,
    queryFn: async () => {
      // 当前阶段优先返回已注册的教材池，未来自动由 Gateway SQLite 动态加载
      return TEXTBOOK_BOOKS;
    },
    staleTime: 1000 * 60 * 10, // 教材结构 10 分钟内视为新鲜
  });
}

/**
 * 获取用户多维能力雷达指标
 */
export function useLearnerProfileQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.PROFILE,
    queryFn: async () => {
      return SKILL_METRICS_JP;
    },
    staleTime: 1000 * 60 * 2, // 学情指标 2 分钟缓存
  });
}

/**
 * 获取待攻克错题本
 */
export function useMistakesQuery() {
  return useQuery<MistakeNotebookItem[]>({
    queryKey: QUERY_KEYS.MISTAKES,
    queryFn: async () => {
      return INITIAL_MISTAKES;
    },
    staleTime: 1000 * 60 * 1,
  });
}

/**
 * 提交测验作答并自动让学情缓存失效重新计算
 */
export function useSubmitQuizMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { questionId: string; selectedKey: string; isCorrect: boolean }) => {
      // 模拟向 Gateway 发送评测事件
      return { success: true, payload };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MISTAKES });
    },
  });
}
