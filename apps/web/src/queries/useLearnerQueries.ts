import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { generateId } from '@study-studio/shared';
import { TEXTBOOK_BOOKS, type TextbookBook } from '../data/textbook-data.js';
import {
  SKILL_METRICS_JP,
  INITIAL_MISTAKES,
  INITIAL_QUESTIONS,
  INITIAL_CARDS,
  type MistakeNotebookItem,
  type QuizQuestionItem,
  type StudyCardItem,
} from '../data/learning-data.js';

export const QUERY_KEYS = {
  TEXTBOOKS: ['learner', 'textbooks'] as const,
  PROFILE: ['learner', 'profile'] as const,
  MISTAKES: ['learner', 'mistakes'] as const,
  QUESTIONS: ['learner', 'questions'] as const,
  CARDS: ['learner', 'cards'] as const,
};

export function useTextbooksQuery() {
  return useQuery<TextbookBook[]>({
    queryKey: QUERY_KEYS.TEXTBOOKS,
    queryFn: async () => TEXTBOOK_BOOKS,
    staleTime: 1000 * 60 * 10,
  });
}

export function useLearnerProfileQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.PROFILE,
    queryFn: async () => SKILL_METRICS_JP,
    staleTime: 1000 * 60 * 2,
  });
}

export function useMistakesQuery() {
  return useQuery<MistakeNotebookItem[]>({
    queryKey: QUERY_KEYS.MISTAKES,
    queryFn: async () => INITIAL_MISTAKES,
    staleTime: 1000 * 60 * 1,
  });
}

export function useQuestionsQuery() {
  return useQuery<QuizQuestionItem[]>({
    queryKey: QUERY_KEYS.QUESTIONS,
    queryFn: async () => INITIAL_QUESTIONS,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCardsQuery() {
  return useQuery<StudyCardItem[]>({
    queryKey: QUERY_KEYS.CARDS,
    queryFn: async () => INITIAL_CARDS,
    staleTime: 1000 * 60 * 5,
  });
}

/** 前置插入自适应题目并重置题序 */
export function usePrependQuestionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (question: QuizQuestionItem) => question,
    onSuccess: (question) => {
      queryClient.setQueryData<QuizQuestionItem[]>(QUERY_KEYS.QUESTIONS, (prev = []) => [
        question,
        ...prev,
      ]);
    },
  });
}

/** 追加 / 批量追加闪卡 */
export function useAddCardsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cards: StudyCardItem[]) => cards,
    onSuccess: (cards) => {
      queryClient.setQueryData<StudyCardItem[]>(QUERY_KEYS.CARDS, (prev = []) => [
        ...cards,
        ...prev,
      ]);
    },
  });
}

/** 更新单张卡片 FSRS 状态 */
export function useUpdateCardMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (card: Pick<StudyCardItem, 'id' | 'stability' | 'reps'>) => card,
    onSuccess: (patch) => {
      queryClient.setQueryData<StudyCardItem[]>(QUERY_KEYS.CARDS, (prev = []) =>
        prev.map((c) => (c.id === patch.id ? { ...c, ...patch } : c))
      );
    },
  });
}

/** 错题两连对攻克状态更新 */
export function useUpdateMistakeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { mistakeId: string; isCorrect: boolean }) => payload,
    onSuccess: ({ mistakeId, isCorrect }) => {
      queryClient.setQueryData<MistakeNotebookItem[]>(QUERY_KEYS.MISTAKES, (prev = []) =>
        prev.map((m) => {
          if (m.id !== mistakeId) return m;
          const consecutiveCorrect = isCorrect ? m.consecutiveCorrect + 1 : 0;
          return {
            ...m,
            consecutiveCorrect,
            isResolved: consecutiveCorrect >= 2,
          };
        })
      );
    },
  });
}

/** 听力听写错题入库 */
export function useAddMistakeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      item: Omit<MistakeNotebookItem, 'id' | 'consecutiveCorrect' | 'isResolved'>
    ) => item,
    onSuccess: (item) => {
      const entry: MistakeNotebookItem = {
        ...item,
        id: generateId('msk_listen'),
        consecutiveCorrect: 0,
        isResolved: false,
      };
      queryClient.setQueryData<MistakeNotebookItem[]>(QUERY_KEYS.MISTAKES, (prev = []) => [
        entry,
        ...prev,
      ]);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE });
    },
  });
}

/** 追加导入教材 */
export function useImportTextbookMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (book: TextbookBook) => book,
    onSuccess: (book) => {
      queryClient.setQueryData<TextbookBook[]>(QUERY_KEYS.TEXTBOOKS, (prev = []) => [
        book,
        ...prev,
      ]);
    },
  });
}

/**
 * 提交测验作答并让学情缓存失效
 */
export function useSubmitQuizMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      questionId: string;
      selectedKey: string;
      isCorrect: boolean;
    }) => ({ success: true as const, payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MISTAKES });
    },
  });
}

/** 教材生词 → StudyCardItem */
export function vocabToStudyCard(
  vocab: { front: string; back: string; category: string; prompt: string },
  idx = 0
): StudyCardItem {
  return {
    id: `card_tb_${Date.now()}_${idx}`,
    type: 'VOCAB',
    frontWord: vocab.front,
    reading: '',
    tag: '教材生词',
    pos: '生词',
    backMeaning: vocab.back,
    exampleJp: vocab.prompt,
    exampleHighlight: vocab.front,
    exampleZh: '',
    stability: 1.0,
    reps: 0,
  };
}
