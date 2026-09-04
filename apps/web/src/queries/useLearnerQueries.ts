import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { generateId } from '@study-studio/shared';
import type { SkillMetric } from '@study-studio/learner-core';
import type { KanaItem, ReadingPassageSet, NewsTopic } from '@study-studio/protocol';
import { toUiQuizType } from '@study-studio/protocol';
import { apiClient, GATEWAY_BASE_URL } from '../lib/api-client.js';
import { TEXTBOOK_BOOKS, type TextbookBook } from '../data/textbook-data.js';
import {
  type MistakeNotebookItem,
  type QuizQuestionItem,
  type StudyCardItem,
} from '../data/learning-data.js';

const DEFAULT_USER_ID = 'student_web_01';

export const QUERY_KEYS = {
  TEXTBOOKS: ['learner', 'textbooks'] as const,
  DOCUMENTS: ['learner', 'documents'] as const,
  ANNOTATIONS: ['learner', 'annotations'] as const,
  KANA: ['curriculum', 'kana'] as const,
  READING: ['learner', 'reading'] as const,
  NEWS_TOPICS: ['learner', 'newsTopics'] as const,
  PITCH: ['curriculum', 'pitch'] as const,
  PROFILE: ['learner', 'profile'] as const,
  MISTAKES: ['learner', 'mistakes'] as const,
  QUESTIONS: ['learner', 'questions'] as const,
  CARDS: ['learner', 'cards'] as const,
  DAILY_TASK: ['learner', 'dailyTask'] as const,
};

/**
 * 教材知识树查询 (支持 Hono RPC 动态获取持久化教材并与内置教材合流)
 */
export function useTextbooksQuery(userId = DEFAULT_USER_ID) {
  return useQuery<TextbookBook[]>({
    queryKey: [...QUERY_KEYS.TEXTBOOKS, userId],
    queryFn: async () => {
      try {
        const res = await apiClient.api.documents[':userId'].$get({ param: { userId } });
        if (res.ok) {
          const docs = await res.json();
          if (Array.isArray(docs) && docs.length > 0) {
            const dynamicBooks: TextbookBook[] = [];
            for (const doc of docs) {
              if (doc.astJson) {
                try {
                  const parsed = JSON.parse(doc.astJson);
                  if (parsed && parsed.id && Array.isArray(parsed.lessons)) {
                    dynamicBooks.push(parsed as TextbookBook);
                  }
                } catch {
                  // ignore corrupt ast
                }
              }
            }
            if (dynamicBooks.length > 0) {
              return dynamicBooks;
            }
          }
        }
      } catch (e) {
        console.warn('[useTextbooksQuery] Hono RPC fallback to local textbook assets', e);
      }
      return TEXTBOOK_BOOKS;
    },
    staleTime: 1000 * 60 * 5,
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
        console.warn('[useLearnerProfileQuery] Hono RPC failed to load profile', e);
      }
      return [];
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
          if (Array.isArray(list)) {
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
        console.warn('[useMistakesQuery] Hono RPC failed to load mistakes', e);
      }
      return [];
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
          if (Array.isArray(dynamicQuestions)) {
            return dynamicQuestions.map((q: any) => ({
              id: q.id,
              type: toUiQuizType(String(q.type ?? 'MULTIPLE_CHOICE')),
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
              chunks: Array.isArray(q.chunks) ? q.chunks : undefined,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
              testedSkill: q.testedSkillId || q.testedSkill || 'adaptive_skill',
            }));
          }
        }
      } catch (e) {
        console.warn('[useQuestionsQuery] Hono RPC failed to load questions', e);
      }
      return [];
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
          if (Array.isArray(list)) {
            return list.map((c: any) => ({
              id: c.id,
              type: (c.type === 'GRAMMAR' ? 'GRAMMAR' : c.type === 'CONFUSION' ? 'CONFUSION' : 'VOCAB') as any,
              frontWord: c.front,
              reading: c.phonetic || '',
              tag: Array.isArray(c.tags) ? c.tags[0] || '核心词汇' : '核心词汇',
              pos: Array.isArray(c.tags) ? c.tags[1] || '词汇' : '词汇',
              backMeaning: c.back,
              exampleJp: (Array.isArray(c.tags) && c.tags[2]) || c.exampleJp || '',
              exampleHighlight: c.exampleHighlight || c.front,
              exampleZh: (Array.isArray(c.tags) && c.tags[3]) || c.exampleZh || '',
              stability: c.fsrs?.stability ?? 1.0,
              reps: c.fsrs?.reps ?? 0,
              dueAt: c.fsrs?.dueAt,
            }));
          }
        }
      } catch (e) {
        console.warn('[useCardsQuery] Hono RPC failed to load cards', e);
      }
      return [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** 前置插入自适应题目并经由 Hono RPC 持久化到 SQLite */
export function usePrependQuestionMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (question: QuizQuestionItem) => {
      const response = await apiClient.api.questions[':userId'].$post({
          param: { userId },
          json: {
            id: question.id,
            userId,
            type: question.type,
            category: question.category,
            prompt: question.prompt,
            content: question.content,
            options: question.options,
            chunks: question.chunks,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            testedSkillId: question.testedSkill,
            difficulty: 3,
            createdAt: new Date().toISOString(),
          } as any,
        });
      if (!response.ok) {
        throw new Error('保存自适应题目失败');
      }
      return question;
    },
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

/** 更新单张卡片 FSRS 状态并累计足迹 (Hono RPC 持久化至 SQLite) */
export function useUpdateCardMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Pick<StudyCardItem, 'id' | 'stability' | 'reps'>) => {
      // 1. 同步累计每日打卡足迹
      const activityResponse = await apiClient.api.task.activity[':userId'].$post({
          param: { userId },
          json: { cards: 1 },
      });
      if (!activityResponse.ok) throw new Error('记录卡片复习足迹失败');

      // 2. 将卡片最新 FSRS 进度持久化写入 SQLite flashcards 表
      const existingCards = queryClient.getQueryData<StudyCardItem[]>([...QUERY_KEYS.CARDS, userId]) || [];
      const target = existingCards.find((c) => c.id === patch.id);
      if (target) {
          const payload = {
            id: target.id,
            userId,
            type: target.type,
            front: target.frontWord,
            back: target.backMeaning,
            phonetic: target.reading || null,
            audioUrl: null,
            tags: [target.tag, target.pos, target.exampleJp, target.exampleZh].filter(Boolean),
            fsrs: {
              stability: patch.stability,
              difficulty: 5.0,
              reps: patch.reps,
              lapses: 0,
              dueAt: new Date().toISOString(),
              state: 'REVIEW',
            },
          };
          const cardResponse = await apiClient.api.cards[':userId'].$post({
            param: { userId },
            json: [payload] as any,
          });
          if (!cardResponse.ok) throw new Error('保存闪卡复习状态失败');
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

/** 追加导入教材并持久化至 Gateway SQLite */
export function useImportTextbookMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (book: TextbookBook) => {
      try {
        await apiClient.api.documents[':userId'].$post({
          param: { userId },
          json: {
            id: book.id,
            title: book.title,
            sourceKind: 'user_import',
            language: 'ja',
            content: (book as any).description || book.title,
            astJson: JSON.stringify(book),
            sourcePublisher: book.publisher || '用户自主导入',
          },
        });
      } catch (e) {
        console.warn('[useImportTextbookMutation] Hono RPC failed to save textbook to gateway', e);
      }
      return book;
    },
    onSuccess: (book) => {
      queryClient.setQueryData<TextbookBook[]>([...QUERY_KEYS.TEXTBOOKS, userId], (prev = []) => [
        book,
        ...prev.filter((b) => b.id !== book.id),
      ]);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEXTBOOKS });
    },
  });
}

/** 课文划线批注查询 (依托 Hono RPC 端到端强类型系统) */
export function useAnnotationsQuery(documentId: string, userId = DEFAULT_USER_ID) {
  return useQuery({
    queryKey: [...QUERY_KEYS.ANNOTATIONS, userId, documentId],
    queryFn: async () => {
      if (!documentId) return [];
      try {
        const res = await apiClient.api.annotations[':userId'][':documentId'].$get({
          param: { userId, documentId },
        });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) return list;
        }
      } catch (e) {
        console.warn('[useAnnotationsQuery] Hono RPC failed to load annotations', e);
      }
      return [];
    },
    enabled: Boolean(documentId),
    staleTime: 1000 * 60 * 2,
  });
}

/** 新增课文划线批注 */
export function useAddAnnotationMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      documentId: string;
      kind: 'KEY_POINT' | 'VOCAB' | 'GRAMMAR' | 'EXAM_TRAP' | 'PARAPHRASE';
      quote: string;
      note?: string;
      startOffset?: number;
      endOffset?: number;
    }) => {
      const res = await apiClient.api.annotations[':userId'].$post({
        param: { userId },
        json: input,
      });
      if (res.ok) {
        return await res.json();
      }
      throw new Error('保存批注失败');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...QUERY_KEYS.ANNOTATIONS, userId, variables.documentId],
      });
    },
  });
}

/** 批注一键转化为 FSRS 闪卡 */
export function useAnnotationToCardMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      annotationId: string;
      documentId: string;
      front: string;
      back: string;
      tag?: string;
      pos?: string;
      phonetic?: string;
    }) => {
      const res = await apiClient.api.annotations[':userId'][':annotationId']['to-card'].$post({
        param: { userId, annotationId: payload.annotationId },
        json: {
          front: payload.front,
          back: payload.back,
          tag: payload.tag || '课文批注',
          pos: payload.pos || '重点词句',
          phonetic: payload.phonetic,
        },
      });
      if (res.ok) {
        return await res.json();
      }
      throw new Error('转为生词卡失败');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CARDS });
      queryClient.invalidateQueries({
        queryKey: [...QUERY_KEYS.ANNOTATIONS, userId, variables.documentId],
      });
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

/** 五十音全表查询 (依托 Hono RPC 端到端强类型系统) */
export function useCurriculumKanaQuery(type?: string) {
  return useQuery<KanaItem[]>({
    queryKey: [...QUERY_KEYS.KANA, type ?? 'ALL'],
    queryFn: async () => {
      try {
        const res = await apiClient.api.curriculum.kana.$get({
          query: type ? { type } : {},
        });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            return list as KanaItem[];
          }
        }
      } catch (e) {
        console.warn('[useCurriculumKanaQuery] Hono RPC fallback to local memory', e);
      }
      return [];
    },
    staleTime: 1000 * 60 * 30, // 课程底座几乎不变，长效缓存 30 分钟
  });
}

/** 提交假名练习结果并回写画像 (Hono RPC) */
export function useKanaPracticeMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      kanaId: string;
      isCorrect: boolean;
      scriptType?: 'HIRAGANA' | 'KATAKANA' | 'ROMAJI';
    }) => {
      try {
        const res = await apiClient.api.curriculum.kana.practice[':userId'].$post({
          param: { userId },
          json: {
            kanaId: payload.kanaId,
            isCorrect: payload.isCorrect,
            scriptType: payload.scriptType || 'HIRAGANA',
          },
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (e) {
        console.warn('[useKanaPracticeMutation] Failed to post kana practice', e);
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE });
    },
  });
}

/** 双源阅读理解篇目查询 (AI 分级篇目 / 真实合规新闻) */
export function useReadingSetsQuery(
  origin?: 'ai' | 'news' | 'user_import',
  lang?: 'JA' | 'EN',
  userId = DEFAULT_USER_ID
) {
  return useQuery<ReadingPassageSet[]>({
    queryKey: [...QUERY_KEYS.READING, userId, origin ?? 'ALL', lang ?? 'ALL'],
    queryFn: async () => {
      try {
        const query: any = {};
        if (origin) query.origin = origin;
        if (lang) query.lang = lang;
        const res = await apiClient.api.reading.sets[':userId'].$get({
          param: { userId },
          query,
        });
        if (res.ok) {
          const sets = await res.json();
          if (Array.isArray(sets) && sets.length > 0) {
            return sets as ReadingPassageSet[];
          }
        }
      } catch (e) {
        console.warn('[useReadingSetsQuery] Hono RPC fallback', e);
      }
      return [];
    },
    staleTime: 1000 * 60 * 5, // 5 分钟缓存
  });
}

/** 新闻栏目 SSOT（Gateway / protocol） */
export function useNewsTopicsQuery() {
  return useQuery<NewsTopic[]>({
    queryKey: QUERY_KEYS.NEWS_TOPICS,
    queryFn: async () => {
      try {
        const res = await (apiClient.api.reading as any)['news-topics'].$get();
        if (res.ok) {
          const topics = await res.json();
          if (Array.isArray(topics) && topics.length > 0) return topics as NewsTopic[];
        }
      } catch (e) {
        console.warn('[useNewsTopicsQuery] fallback to protocol NEWS_TOPICS', e);
      }
      const { NEWS_TOPICS } = await import('@study-studio/protocol');
      return [...NEWS_TOPICS];
    },
    staleTime: 1000 * 60 * 30,
  });
}

export type PitchLexiconItem = {
  id: string;
  kanji: string;
  kana: string;
  romaji: string;
  meaning: string;
  pitchType: string;
  pitchPattern: Array<'L' | 'H'>;
  moraList: string[];
  contrastPair?: {
    kanji: string;
    kana: string;
    pitchType: string;
    pitchPattern: Array<'L' | 'H'>;
    meaning: string;
  };
  tip: string;
};

/** 声调基准词表（Gateway curriculum，非 OJAD） */
export function usePitchLexiconQuery(search = '') {
  return useQuery<PitchLexiconItem[]>({
    queryKey: [...QUERY_KEYS.PITCH, search],
    queryFn: async () => {
      try {
        const qs = search ? `?q=${encodeURIComponent(search)}` : '';
        const res = await fetch(`${GATEWAY_BASE_URL}/api/curriculum/pitch${qs}`);
        if (res.ok) {
          const data = (await res.json()) as { pitchEntries?: PitchLexiconItem[] };
          if (Array.isArray(data.pitchEntries) && data.pitchEntries.length > 0) {
            return data.pitchEntries;
          }
        }
      } catch (e) {
        console.warn('[usePitchLexiconQuery] fallback to local demo lexicon', e);
      }
      const { BENCHMARK_PITCH_WORDS } = await import('../data/pitch-accent-demo-data.js');
      return BENCHMARK_PITCH_WORDS as PitchLexiconItem[];
    },
    staleTime: 1000 * 60 * 10,
  });
}

/** 动态生成或抓取阅读套题 (Hono RPC) */
export function useGenerateReadingSetMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      origin?: 'ai' | 'news';
      difficulty?: number;
      language?: 'JA' | 'EN';
      topic?: string;
    }) => {
      const res = await apiClient.api.reading.generate[':userId'].$post({
        param: { userId },
        json: {
          origin: payload.origin || 'ai',
          difficulty: payload.difficulty || 2,
          language: payload.language || 'JA',
          topic: payload.topic || '日常生活',
        },
      });
      if (res.ok) {
        return (await res.json()) as ReadingPassageSet;
      }
      throw new Error('生成阅读篇目失败');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.READING });
    },
  });
}

/** 提交阅读理解答题成绩 (Hono RPC) */
export function useSubmitReadingPracticeMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      setId: string;
      score: number;
      totalQuestions: number;
      language?: 'JA' | 'EN';
    }) => {
      const res = await apiClient.api.reading.practice[':userId'].$post({
        param: { userId },
        json: {
          setId: payload.setId,
          score: payload.score,
          totalQuestions: payload.totalQuestions,
          language: payload.language || 'JA',
        },
      });
      if (res.ok) {
        return await res.json();
      }
      throw new Error('提交阅读成绩失败');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DAILY_TASK });
    },
  });
}

export type WritingPromptItem = {
  id: string;
  category: string;
  chinesePrompt: string;
  contextHint: string;
  testedSkillId: string;
  standardAnswer: string;
  grammarFocus: string;
};

export type DictationChallengeItem = {
  id: string;
  sourceLesson: string;
  speaker: string;
  fullJapanese: string;
  chinese: string;
  blankPrompt: string;
  clozeDisplay: string;
  targetWord: string;
  furiganaHint: string;
  categoryTag: string;
  testedSkillId: string;
  grammarExplanation: string;
};

/** 调用 Gateway learning.content 生成写作题干 */
export function useGenerateWritingPromptsMutation(userId = DEFAULT_USER_ID) {
  return useMutation({
    mutationFn: async (payload: {
      genre?: string;
      difficulty?: number;
      count?: number;
      skillIds?: string[];
      collect?: boolean;
    }) => {
      const res = await apiClient.api.learning.content[':userId'].$post({
        param: { userId },
        json: {
          action: 'generate_writing_prompt',
          genre: payload.genre || 'translation',
          difficulty: payload.difficulty || 3,
          count: payload.count || 3,
          skillIds: payload.skillIds,
          collect: payload.collect ?? true,
          language: 'ja',
        },
      });
      if (!res.ok) throw new Error('生成写作题干失败');
      const data = (await res.json()) as {
        writingPrompts?: WritingPromptItem[];
        questions?: Array<{
          id: string;
          prompt: string;
          content: string;
          correctAnswer: string;
          explanation: string;
          testedSkillId: string;
        }>;
        collectionId?: string;
      };
      if (data.writingPrompts?.length) return data.writingPrompts;
      return (data.questions ?? []).map((q) => ({
        id: q.id,
        category: 'AI 写作题干',
        chinesePrompt: q.prompt || q.content,
        contextHint: q.explanation,
        testedSkillId: q.testedSkillId,
        standardAnswer: q.correctAnswer,
        grammarFocus: q.explanation,
      }));
    },
  });
}

/** 调用 Gateway learning.content 生成挖词听写 */
export function useGenerateDictationMutation(userId = DEFAULT_USER_ID) {
  return useMutation({
    mutationFn: async (payload?: { count?: number; skillIds?: string[] }) => {
      const res = await apiClient.api.learning.content[':userId'].$post({
        param: { userId },
        json: {
          action: 'generate_quiz',
          format: 'LISTENING_DICTATION',
          count: payload?.count || 4,
          skillIds: payload?.skillIds,
          collect: true,
          language: 'ja',
        },
      });
      if (!res.ok) throw new Error('生成听写题失败');
      const data = (await res.json()) as { dictationItems?: DictationChallengeItem[] };
      if (!data.dictationItems?.length) throw new Error('听写题为空');
      return data.dictationItems;
    },
  });
}
