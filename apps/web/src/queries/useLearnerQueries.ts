import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { generateId } from '@study-studio/shared';
import type { FsrsState, SkillMetric, DailyTaskProgress, DailyStudyPlan } from '@study-studio/learner-core';
import type { KanaItem, ReadingPassageSet, NewsTopic, LearningAnalysisReport, PracticePlanTemplate, PracticePlanRun, PracticeItemAttempt, PracticeBlockSpec, CardReviewRating } from '@study-studio/protocol';
import { toUiQuizType } from '@study-studio/protocol';
import { apiClient, GATEWAY_BASE_URL } from '../lib/api-client.js';
import {
  type MistakeNotebookItem,
  type QuizQuestionItem,
  type StudyCardItem,
} from '../data/learning-data.js';
// P1-2 拆分：键与默认用户已下沉 query-keys.ts，此处重导出保持对外不变。
import { DEFAULT_USER_ID, QUERY_KEYS, invalidateAllLearningQueries } from './query-keys.js';

export { DEFAULT_USER_ID, QUERY_KEYS, invalidateAllLearningQueries };

import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import { normalizeTrackLanguage } from '../learning/learning-shell.js';

// P1-2 拆分：画像/计划/分析组已下沉 profile-plan-analysis.ts，此处重导出保持对外不变。
export { useLearnerProfileQuery, useDailyTaskQuery, useDailyPlanQuery, useCompletePlanStepMutation, useLearningAnalysisQuery, useRefreshLearningAnalysisMutation, useActivityHistoryQuery } from './profile-plan-analysis.js';

// P1-2 拆分：卡片/错题/题库组已下沉 cards-mistakes-questions.ts，此处重导出保持对外不变。
export { useCardsQuery, useAddCardsMutation, useUpdateCardMutation, vocabToStudyCard, useMistakesQuery, useUpdateMistakeMutation, useAddMistakeMutation, useQuestionsQuery, usePrependQuestionMutation, useSubmitQuizMutation } from './cards-mistakes-questions.js';

// P1-2 拆分注：usePrependQuestionMutation / useAddCardsMutation / useUpdateCardMutation / useUpdateMistakeMutation / useAddMistakeMutation 已下沉 cards-mistakes-questions.ts，见文件顶部 barrel 重导出。

// P1-2 拆分：教材/批注组已下沉 textbooks-annotations.ts，此处重导出保持对外不变。
export { useTextbooksQuery, useImportTextbookMutation, useAnnotationsQuery, useAddAnnotationMutation, useAnnotationToCardMutation } from './textbooks-annotations.js';

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

// P1-2 拆分注：useSubmitQuizMutation（HTTP 记足迹版）/ vocabToStudyCard 已下沉 cards-mistakes-questions.ts，见文件顶部 barrel 重导出（useAgentMutations.ts 的同名 WS 版不受影响）。

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
  lang?: 'JA' | 'EN' | 'KO',
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

export type DictionaryLookupResult = {
  entries: Array<{
    id: string;
    language: 'ja' | 'en' | 'ko';
    headword: string;
    reading?: string;
    romanization?: string;
    meanings: string[];
    pronunciation?: Record<string, unknown>;
    partOfSpeech?: string;
    sourceLabel: string;
    licenseNote: string;
  }>;
  externalLookup?: {
    provider: 'OJAD';
    url: string;
    opensExternally: true;
  };
};

export type DictionaryPackageInfo = {
  id: string;
  language: 'en' | 'ja' | 'ko';
  provider: string;
  version: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  attribution: string;
  description: string;
  installMode: 'on_demand';
  installed: boolean;
  entryCount?: number;
  installedAt?: string;
};

export type DictionaryEntryCollection = {
  card: {
    id: string;
    userId: string;
    front: string;
    back: string;
    phonetic?: string;
    tags: string[];
  };
  created: boolean;
};

type DictionaryPackagesResponse = { packages: DictionaryPackageInfo[] };

/** 词典包只读取 Gateway 状态；不把大词典内容放入浏览器缓存。 */
export function useDictionaryPackagesQuery(enabled = true) {
  return useQuery<DictionaryPackagesResponse>({
    queryKey: [...QUERY_KEYS.DICTIONARY, 'packages'],
    enabled,
    queryFn: async () => {
      const response = await fetch(`${GATEWAY_BASE_URL}/api/dictionary/packages`);
      if (!response.ok) throw new Error('暂时无法读取词典包状态。');
      return (await response.json()) as DictionaryPackagesResponse;
    },
    staleTime: 1000 * 30,
  });
}

/** 用户显式确认后才下载词典包；成功后使本地查询结果和包状态同步刷新。 */
export function useInstallDictionaryPackageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (packageId: string) => {
      const response = await fetch(
        `${GATEWAY_BASE_URL}/api/dictionary/packages/${encodeURIComponent(packageId)}/install`,
        { method: 'POST' }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { userMessage?: string };
        } | null;
        throw new Error(body?.error?.userMessage ?? '词典包安装失败，请检查网络后重试。');
      }
      return (await response.json()) as DictionaryPackageInfo;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.DICTIONARY, 'packages'] });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DICTIONARY });
    },
  });
}

/** 收集本地词典条目为用户生词卡；界面不直接构造或持久化 FSRS 状态。 */
export function useCollectDictionaryEntryMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const response = await fetch(
        `${GATEWAY_BASE_URL}/api/vocabulary/${encodeURIComponent(userId)}/entries/${encodeURIComponent(entryId)}/collect`,
        { method: 'POST' }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { userMessage?: string };
        } | null;
        throw new Error(body?.error?.userMessage ?? '暂时无法加入生词本，请稍后重试。');
      }
      return (await response.json()) as DictionaryEntryCollection;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CARDS });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DAILY_PLAN });
    },
  });
}

/** 通用本地词典查询；日语未命中时由 Gateway 返回 OJAD 外链，前端不直接请求 OJAD。 */
export function useDictionaryLookupQuery(
  language: 'ja' | 'en' | 'ko',
  query: string
) {
  const normalized = query.trim();
  return useQuery<DictionaryLookupResult>({
    queryKey: [...QUERY_KEYS.DICTIONARY, language, normalized],
    enabled: Boolean(normalized),
    queryFn: async () => {
      const response = await fetch(
        `${GATEWAY_BASE_URL}/api/dictionary/${language}?q=${encodeURIComponent(normalized)}`
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { userMessage?: string };
        } | null;
        throw new Error(body?.error?.userMessage ?? '暂时无法查询本地词典，请稍后重试。');
      }
      return (await response.json()) as DictionaryLookupResult;
    },
    staleTime: 1000 * 60 * 10,
  });
}

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
      language?: 'JA' | 'EN' | 'KO';
      topic?: string;
    }) => {
      const res = await apiClient.api.reading.generate[':userId'].$post({
        param: { userId },
        json: {
          origin: payload.origin || 'ai',
          difficulty: payload.difficulty || 2,
          language: payload.language || 'EN',
          topic: payload.topic || 'education and media literacy',
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
      language?: 'JA' | 'EN' | 'KO';
    }) => {
      const res = await apiClient.api.reading.practice[':userId'].$post({
        param: { userId },
        json: {
          setId: payload.setId,
          score: payload.score,
          totalQuestions: payload.totalQuestions,
          language: payload.language || 'EN',
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DAILY_PLAN });
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

// ===================== P5：可配置练习计划 =====================

/** 练习计划模板列表 */
export function usePracticeTemplatesQuery(userId = DEFAULT_USER_ID, langOverride?: string) {
  const profileLang = useUserProfileStore((s) => s.profile.targetLanguage);
  const targetLanguage = normalizeTrackLanguage(langOverride || profileLang);
  return useQuery<PracticePlanTemplate[]>({
    queryKey: [...QUERY_KEYS.PRACTICE_TEMPLATES, userId, targetLanguage],
    queryFn: async () => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/practice/templates/${userId}?lang=${targetLanguage}&includeDisabled=1`
      );
      if (!res.ok) throw new Error('加载练习计划模板失败');
      return (await res.json()) as PracticePlanTemplate[];
    },
  });
}

/** 保存（新建/更新）模板；成功后失效模板列表 */
export function useSavePracticeTemplateMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (template: PracticePlanTemplate) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { userMessage?: string } } | null;
        throw new Error(body?.error?.userMessage ?? '保存模板失败');
      }
      return (await res.json()) as PracticePlanTemplate;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.PRACTICE_TEMPLATES, userId] });
    },
  });
}

/** 删除模板 */
export function useDeletePracticeTemplateMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/practice/templates/${userId}/${encodeURIComponent(templateId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('删除模板失败');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.PRACTICE_TEMPLATES, userId] });
    },
  });
}

/** P5-E2：启用/停用模板（仅改 enabled，不递增 revision） */
export function useTogglePracticeTemplateMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { templateId: string; enabled: boolean }) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/practice/templates/${userId}/${encodeURIComponent(params.templateId)}/enabled`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: params.enabled }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { userMessage?: string } } | null;
        throw new Error(body?.error?.userMessage ?? '更新模板状态失败');
      }
      return (await res.json()) as PracticePlanTemplate;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.PRACTICE_TEMPLATES, userId] });
    },
  });
}

/** P5-E2：复制模板（新 id、revision 重置、默认停用） */
export function useCopyPracticeTemplateMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/practice/templates/${userId}/${encodeURIComponent(templateId)}/copy`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { userMessage?: string } } | null;
        throw new Error(body?.error?.userMessage ?? '复制模板失败');
      }
      return (await res.json()) as PracticePlanTemplate;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.PRACTICE_TEMPLATES, userId] });
    },
  });
}

/** 开始一次练习运行（从模板冻结或一次性自定义块） */
export function useStartPracticeRunMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { language: 'en' | 'ja' | 'ko'; templateId?: string; blocks?: PracticeBlockSpec[] }) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/runs/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...params }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { userMessage?: string } } | null;
        throw new Error(body?.error?.userMessage ?? '开始练习失败');
      }
      return (await res.json()) as PracticePlanRun;
    },
    onSuccess: (run) => {
      queryClient.setQueryData([...QUERY_KEYS.PRACTICE_RUN, userId, run.id], { run, attempts: [] });
      // P5-E3：新开 run 立即出现在今日计划（幂等追加练习计划步骤）
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.DAILY_PLAN, userId] });
    },
  });
}

/** 读取运行 + 其尝试 */
export function usePracticeRunQuery(runId: string | null, userId = DEFAULT_USER_ID) {
  return useQuery<{ run: PracticePlanRun | null; attempts: PracticeItemAttempt[] }>({
    queryKey: [...QUERY_KEYS.PRACTICE_RUN, userId, runId],
    enabled: Boolean(runId),
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/runs/${userId}/${runId}`);
      if (!res.ok) throw new Error('加载练习运行失败');
      return (await res.json()) as { run: PracticePlanRun | null; attempts: PracticeItemAttempt[] };
    },
    staleTime: 1000 * 5,
  });
}

/** 保存草稿（主观题写到一半） */
export function useSavePracticeDraftMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { runId: string; itemId: string; userAnswer: string }) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/runs/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...params }),
      });
      if (!res.ok) throw new Error('保存草稿失败');
      return (await res.json()) as PracticeItemAttempt;
    },
    onSuccess: (attempt) => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.PRACTICE_RUN, userId, attempt.runId] });
    },
  });
}

/** 提交客观题（即时自动判定） */
export function useSubmitObjectiveMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      runId: string;
      itemId: string;
      userAnswer: string;
      isCorrect?: boolean;
      score?: number;
      testedSkillId?: string;
      timeSpentMs?: number;
    }) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/runs/submit-objective`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...params }),
      });
      if (!res.ok) throw new Error('提交客观题失败');
      return (await res.json()) as PracticeItemAttempt;
    },
    onSuccess: (attempt) => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.PRACTICE_RUN, userId, attempt.runId] });
    },
  });
}

/** 提交主观题（已由 learning.assess 批改） */
export function useSubmitSubjectiveMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      runId: string;
      itemId: string;
      userAnswer: string;
      gradingResult: Record<string, unknown>;
      timeSpentMs?: number;
    }) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/runs/submit-subjective`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...params }),
      });
      if (!res.ok) throw new Error('提交主观题失败');
      return (await res.json()) as PracticeItemAttempt;
    },
    onSuccess: (attempt) => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.PRACTICE_RUN, userId, attempt.runId] });
    },
  });
}

/** 批量提交（用 learning.assess.grade_batch 的结果） */
export function useSubmitBatchMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      runId: string;
      items: Array<{ itemId: string; userAnswer: string; gradingResult: Record<string, unknown>; timeSpentMs?: number }>;
    }) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/runs/submit-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...params }),
      });
      if (!res.ok) throw new Error('批量提交失败');
      return (await res.json()) as { attempts: PracticeItemAttempt[]; batchSummary: { total: number; graded: number; correct: number } };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.PRACTICE_RUN, userId, variables.runId] });
    },
  });
}

/** 完成运行（原子写学习统计） */
export function useFinalizePracticeRunMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/runs/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, runId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { userMessage?: string } } | null;
        throw new Error(body?.error?.userMessage ?? '完成练习失败');
      }
      return (await res.json()) as PracticePlanRun;
    },
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.PRACTICE_RUN, userId, run.id] });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DAILY_TASK });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DAILY_PLAN });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LEARNING_ANALYSIS });
    },
  });
}

/** 批量主观题评测（复用 learning.assess HTTP 路由，action=grade_batch） */
export interface AssessBatchResult {
  results: Array<{ itemId: string; grading: Record<string, unknown> }>;
  summary: { total: number; correct: number; averageScore: number; commonIssues: string[] };
}
export function useGradeBatchMutation(userId = DEFAULT_USER_ID) {
  return useMutation({
    mutationFn: async (items: Array<{
      itemId: string;
      prompt: string;
      standardAnswer: string;
      userSubmission: string;
      testedSkillId?: string;
      language?: 'en' | 'ja' | 'ko';
    }>) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/learning/assess/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grade_batch', items }),
      });
      if (!res.ok) throw new Error('批量评测失败');
      return (await res.json()) as AssessBatchResult;
    },
  });
}

/** P5-E5：单题即时评测（learning.assess action=grade，AI_IMMEDIATE 块用） */
export interface AssessSingleResult {
  isCorrect: boolean;
  score: number;
  accuracyRate?: number;
  grammarFeedback: string;
  nativeNuanceAdvice: string;
  refinementSuggestion: string;
  mistakeDetected: boolean;
  negativeTransferTag?: string;
}
export function useGradeSingleMutation(userId = DEFAULT_USER_ID) {
  return useMutation({
    mutationFn: async (input: {
      prompt: string;
      standardAnswer: string;
      userSubmission: string;
      testedSkillId?: string;
      language: 'en' | 'ja' | 'ko';
    }) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/learning/assess/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grade', ...input }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { userMessage?: string } } | null;
        throw new Error(body?.error?.userMessage ?? '单题批改失败');
      }
      return (await res.json()) as AssessSingleResult;
    },
  });
}

/** 装配运行题目（按块从既有资产装配到 practice_collections） */
export function useAssemblePracticeRunMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/runs/${userId}/${runId}/assemble`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('装配练习题目失败');
      return (await res.json()) as {
        run: PracticePlanRun;
        blocks: Array<{ blockId: string; collectionId: string; itemCount: number }>;
        totalItems: number;
        skippedBlocks?: Array<{ blockId: string; kind: string }>;
      };
    },
    onSuccess: (_data, runId) => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.PRACTICE_RUN, userId, runId] });
    },
  });
}

/** 读取运行的所有题目（按 block 聚合） */
export interface PracticeRunnerItemDTO {
  itemId: string;
  blockId: string;
  gradingMode: 'AUTO_IMMEDIATE' | 'AI_IMMEDIATE' | 'AI_BATCH';
  question: import('@study-studio/protocol').GeneratedQuestion;
}
export function usePracticeRunItemsQuery(runId: string | null, userId = DEFAULT_USER_ID) {
  return useQuery<PracticeRunnerItemDTO[]>({
    queryKey: [...QUERY_KEYS.PRACTICE_RUN, userId, runId, 'items'],
    enabled: Boolean(runId),
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/runs/${userId}/${runId}/items`);
      if (!res.ok) throw new Error('加载练习题目失败');
      return (await res.json()) as PracticeRunnerItemDTO[];
    },
  });
}

/** P5-PhaseD：AI 计划建议草案 */
export interface PracticeProposalDTO {
  proposalId: string;
  userId: string;
  language: 'en' | 'ja' | 'ko';
  suggestedName: string;
  blocks: PracticeBlockSpec[];
  createdAt: string;
  expiresAt: string;
}
export function useProposeTemplateMutation(userId = DEFAULT_USER_ID) {
  return useMutation({
    mutationFn: async (language: 'en' | 'ja' | 'ko') => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/templates/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, language }),
      });
      if (!res.ok) throw new Error('生成计划建议失败');
      return (await res.json()) as PracticeProposalDTO;
    },
  });
}

/** P5-PhaseD：用户确认式 apply（校验一次性令牌后保存模板） */
export function useApplyProposalMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { proposalId: string; name?: string; blocks?: PracticeBlockSpec[] }) => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/templates/apply-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...input }),
      });
      if (!res.ok) throw new Error('应用建议草案失败');
      return (await res.json()) as PracticePlanTemplate;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.PRACTICE_TEMPLATES, userId] });
    },
  });
}

/** P5-PhaseD：运行汇总与下次建议 */
export interface RunSummaryDTO {
  runId: string;
  userId: string;
  language: 'en' | 'ja' | 'ko';
  source: 'ai' | 'local';
  summary: string;
  totalItems: number;
  submittedCount: number;
  gradedCount: number;
  correctCount: number;
  averageScore: number;
  commonIssues: string[];
  nextPlanSuggestions: string[];
  generatedAt: string;
  failureReason?: string;
}
export function usePracticeRunSummaryQuery(runId: string | null, userId = DEFAULT_USER_ID) {
  return useQuery<RunSummaryDTO>({
    queryKey: [...QUERY_KEYS.PRACTICE_RUN, userId, runId, 'summary'],
    enabled: Boolean(runId),
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/practice/runs/${userId}/${runId}/summary`);
      if (!res.ok) throw new Error('加载运行汇总失败');
      return (await res.json()) as RunSummaryDTO;
    },
  });
}
