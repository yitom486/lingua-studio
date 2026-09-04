import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { generateId } from '@study-studio/shared';
import type { SkillMetric } from '@study-studio/learner-core';
import { apiClient } from '../lib/api-client.js';
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

const DEFAULT_USER_ID = 'student_web_01';

export const QUERY_KEYS = {
  TEXTBOOKS: ['learner', 'textbooks'] as const,
  PROFILE: ['learner', 'profile'] as const,
  MISTAKES: ['learner', 'mistakes'] as const,
  QUESTIONS: ['learner', 'questions'] as const,
  CARDS: ['learner', 'cards'] as const,
  DAILY_TASK: ['learner', 'dailyTask'] as const,
};

/**
 * 教材知识树查询
 */
export function useTextbooksQuery() {
  return useQuery<TextbookBook[]>({
    queryKey: QUERY_KEYS.TEXTBOOKS,
    queryFn: async () => TEXTBOOK_BOOKS,
    staleTime: 1000 * 60 * 10,
  });
}

/**
 * 学习者技能画像雷达指标查询 (依托 Hono RPC 端到端强类型系统)
 */
export function useLearnerProfileQuery(userId = DEFAULT_USER_ID) {
  return useQuery<SkillMetric[]>({
    queryKey: [...QUERY_KEYS.PROFILE, userId],
    queryFn: async () => {
      try {
        const res = await apiClient.api.profile[':userId'].$get({ param: { userId } });
        if (res.ok) {
          const data = await res.json();
          if ('allMetrics' in data && Array.isArray(data.allMetrics) && data.allMetrics.length > 0) {
            return data.allMetrics as SkillMetric[];
          }
        }
      } catch (e) {
        console.warn('[useLearnerProfileQuery] Hono RPC fallback to local snapshot', e);
      }
      return SKILL_METRICS_JP;
    },
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * 错题本查询 (依托 Hono RPC 端到端强类型系统)
 */
export function useMistakesQuery(userId = DEFAULT_USER_ID) {
  return useQuery<MistakeNotebookItem[]>({
    queryKey: [...QUERY_KEYS.MISTAKES, userId],
    queryFn: async () => {
      try {
        const res = await apiClient.api.mistakes[':userId'].$get({ param: { userId } });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            return list.map((m: any) => ({
              id: m.id,
              categoryTag: m.question?.category || '薄弱项攻坚',
              prompt: m.question?.prompt || '请根据要求作答',
              sentence: m.question?.content || '',
              userWrongAnswer: m.lastUserSubmission || '',
              correctAnswer: m.lastGrading?.correctAnswer || m.question?.correctAnswer || '',
              testedSkillId: m.question?.testedSkillId || '',
              reviewNote: m.lastGrading?.explanation || m.question?.explanation || '',
              consecutiveCorrect: m.consecutiveCorrect ?? 0,
              isResolved: Boolean(m.isResolved),
            }));
          }
        }
      } catch (e) {
        console.warn('[useMistakesQuery] Hono RPC fallback to local snapshot', e);
      }
      return INITIAL_MISTAKES;
    },
    staleTime: 1000 * 60 * 1,
  });
}

/**
 * 自适应题库查询 (依托 Hono RPC 端到端强类型系统)
 */
export function useQuestionsQuery(userId = DEFAULT_USER_ID) {
  return useQuery<QuizQuestionItem[]>({
    queryKey: [...QUERY_KEYS.QUESTIONS, userId],
    queryFn: async () => {
      try {
        const res = await apiClient.api.questions[':userId'].$get({ param: { userId } });
        if (res.ok) {
          const dynamicQuestions = await res.json();
          if (Array.isArray(dynamicQuestions) && dynamicQuestions.length > 0) {
            const mapped: QuizQuestionItem[] = dynamicQuestions.map((q: any) => ({
              id: q.id,
              type: (q.type === 'FILL_IN_BLANK' ? 'FILL_BLANK' : 'CHOICE') as any,
              category: q.category || 'AI 靶向攻坚',
              prompt: q.prompt || '选择最恰当的选项：',
              content: q.content,
              options: Array.isArray(q.options)
                ? q.options.map((opt: any, i: number) =>
                    typeof opt === 'string'
                      ? { key: String.fromCharCode(65 + i), text: opt }
                      : opt
                  )
                : undefined,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
              testedSkill: q.testedSkillId || 'adaptive_skill',
            }));
            return [
              ...mapped,
              ...INITIAL_QUESTIONS.filter((iq) => !mapped.some((m) => m.id === iq.id)),
            ];
          }
        }
      } catch (e) {
        console.warn('[useQuestionsQuery] Hono RPC fallback to local snapshot', e);
      }
      return INITIAL_QUESTIONS;
    },
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * FSRS 卡片库查询 (依托 Hono RPC 端到端强类型系统)
 */
export function useCardsQuery(userId = DEFAULT_USER_ID) {
  return useQuery<StudyCardItem[]>({
    queryKey: [...QUERY_KEYS.CARDS, userId],
    queryFn: async () => {
      try {
        const res = await apiClient.api.cards[':userId'].$get({ param: { userId } });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            return list.map((c: any) => ({
              id: c.id,
              type: (c.type === 'GRAMMAR' ? 'GRAMMAR' : 'VOCAB') as any,
              frontWord: c.front,
              reading: c.phonetic || '',
              tag: Array.isArray(c.tags) ? c.tags[0] || '核心词汇' : '核心词汇',
              pos: Array.isArray(c.tags) ? c.tags[1] || '词汇' : '词汇',
              backMeaning: c.back,
              exampleJp: c.exampleJp || '',
              exampleHighlight: c.exampleHighlight || c.front,
              exampleZh: c.exampleZh || '',
              stability: c.fsrs?.stability ?? 1.0,
              reps: c.fsrs?.reps ?? 0,
            }));
          }
        }
      } catch (e) {
        console.warn('[useCardsQuery] Hono RPC fallback to local snapshot', e);
      }
      return INITIAL_CARDS;
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** 前置插入自适应题目并重置题序 */
export function usePrependQuestionMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (question: QuizQuestionItem) => question,
    onSuccess: (question) => {
      queryClient.setQueryData<QuizQuestionItem[]>([...QUERY_KEYS.QUESTIONS, userId], (prev = []) => [
        question,
        ...prev,
      ]);
    },
  });
}

/** 追加 / 批量追加闪卡并经由 Hono RPC 持久化到 Gateway */
export function useAddCardsMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cards: StudyCardItem[]) => {
      try {
        const payload = cards.map((c) => ({
          id: c.id,
          userId,
          type: c.type,
          front: c.frontWord,
          back: c.backMeaning,
          phonetic: c.reading || null,
          audioUrl: null,
          tags: [c.tag, c.pos].filter(Boolean),
          fsrs: {
            stability: c.stability,
            difficulty: 5.0,
            reps: c.reps,
            lapses: 0,
            dueAt: new Date().toISOString(),
            state: 'NEW',
          },
        }));
        await apiClient.api.cards[':userId'].$post({
          param: { userId },
          json: payload as any,
        });
      } catch (e) {
        console.warn('[useAddCardsMutation] Hono RPC failed to save cards', e);
      }
      return cards;
    },
    onSuccess: (cards) => {
      queryClient.setQueryData<StudyCardItem[]>([...QUERY_KEYS.CARDS, userId], (prev = []) => [
        ...cards,
        ...prev,
      ]);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CARDS });
    },
  });
}

/** 更新单张卡片 FSRS 状态并累计足迹 (Hono RPC) */
export function useUpdateCardMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Pick<StudyCardItem, 'id' | 'stability' | 'reps'>) => {
      try {
        await apiClient.api.task.activity[':userId'].$post({
          param: { userId },
          json: { cards: 1 },
        });
      } catch (e) {
        console.warn('[useUpdateCardMutation] Hono RPC failed to record card review activity', e);
      }
      return patch;
    },
    onSuccess: (patch) => {
      queryClient.setQueryData<StudyCardItem[]>([...QUERY_KEYS.CARDS, userId], (prev = []) =>
        prev.map((c) => (c.id === patch.id ? { ...c, ...patch } : c))
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE });
    },
  });
}

/** 错题两连对攻克状态更新 (Hono RPC 持久化至 SQLite) */
export function useUpdateMistakeMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { mistakeId: string; isCorrect: boolean }) => {
      try {
        if (payload.isCorrect) {
          await apiClient.api.mistakes[':userId'].resolve[':mistakeId'].$post({
            param: { userId, mistakeId: payload.mistakeId },
          });
          await apiClient.api.task.activity[':userId'].$post({
            param: { userId },
            json: { mistakesResolved: 1 },
          });
        }
      } catch (e) {
        console.warn('[useUpdateMistakeMutation] Hono RPC failed to update mistake on gateway', e);
      }
      return payload;
    },
    onSuccess: ({ mistakeId, isCorrect }) => {
      queryClient.setQueryData<MistakeNotebookItem[]>([...QUERY_KEYS.MISTAKES, userId], (prev = []) =>
        prev.map((m) => {
          if (m.id !== mistakeId) return m;
          const consecutiveCorrect = isCorrect ? m.consecutiveCorrect + 1 : 0;
          return {
            ...m,
            consecutiveCorrect,
            isResolved: isCorrect ? true : m.isResolved,
          };
        })
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MISTAKES });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE });
    },
  });
}

/** 听力听写/做题错题入库 (Hono RPC 持久化至 Gateway SQLite) */
export function useAddMistakeMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      item: Omit<MistakeNotebookItem, 'id' | 'consecutiveCorrect' | 'isResolved'>
    ) => {
      const mistakeId = generateId('mst_audio');
      try {
        await apiClient.api.mistakes[':userId'].$post({
          param: { userId },
          json: {
            id: mistakeId,
            userId,
            questionId: mistakeId,
            question: {
              id: mistakeId,
              type: 'FILL_IN_BLANK',
              prompt: item.prompt,
              content: item.sentence,
              correctAnswer: item.correctAnswer,
              explanation: item.reviewNote,
              testedSkillId: item.testedSkillId,
              category: item.categoryTag,
            },
            lastUserSubmission: item.userWrongAnswer,
            lastGrading: {
              isCorrect: false,
              score: 0,
              correctAnswer: item.correctAnswer,
              userSubmission: item.userWrongAnswer,
              explanation: item.reviewNote,
            },
            recordedAt: new Date().toISOString(),
            retryCount: 1,
            consecutiveCorrect: 0,
            isResolved: false,
          } as any,
        });
      } catch (e) {
        console.warn('[useAddMistakeMutation] Hono RPC failed to save mistake to gateway', e);
      }
      return { item, id: mistakeId };
    },
    onSuccess: ({ item, id }) => {
      const entry: MistakeNotebookItem = {
        ...item,
        id,
        consecutiveCorrect: 0,
        isResolved: false,
      };
      queryClient.setQueryData<MistakeNotebookItem[]>([...QUERY_KEYS.MISTAKES, userId], (prev = []) => [
        entry,
        ...prev,
      ]);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MISTAKES });
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
 * 提交测验作答并记录打卡足迹 (Hono RPC)
 */
export function useSubmitQuizMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      questionId: string;
      selectedKey: string;
      isCorrect: boolean;
    }) => {
      try {
        await apiClient.api.task.activity[':userId'].$post({
          param: { userId },
          json: { quizzes: 1 },
        });
      } catch (e) {
        console.warn('[useSubmitQuizMutation] Hono RPC failed to record quiz activity', e);
      }
      return { success: true as const, payload };
    },
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
