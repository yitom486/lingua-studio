import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { HangulItem, HangulScriptType, KanaItem, ReadingPassageSet, NewsTopic } from '@study-studio/protocol';
import { logger } from '@study-studio/shared';
import { apiClient, GATEWAY_BASE_URL } from '../lib/api-client.js';
import { DEFAULT_USER_ID, QUERY_KEYS } from './query-keys.js';

/** P1-2 拆分：词典/假名/课程阅读/新闻组（自 useLearnerQueries.ts 逐行平移，仅改 import）。 */

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
        logger.debug('[useCurriculumKanaQuery] Hono RPC fallback to local memory', e);
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
        logger.debug('[useKanaPracticeMutation] Failed to post kana practice', e);
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE });
    },
  });
}

/** 谚文字母全表查询 (Hono RPC，课程底座长效缓存 30 分钟) */
export function useCurriculumHangulQuery(type?: string) {
  return useQuery<HangulItem[]>({
    queryKey: [...QUERY_KEYS.HANGUL, type ?? 'ALL'],
    queryFn: async () => {
      try {
        const res = await apiClient.api.curriculum.hangul.$get({
          query: type ? { type } : {},
        });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            return list as HangulItem[];
          }
        }
      } catch (e) {
        logger.debug('[useCurriculumHangulQuery] Hono RPC fallback to local memory', e);
      }
      return [];
    },
    staleTime: 1000 * 60 * 30,
  });
}

/** 提交谚文练习结果并回写画像 (Hono RPC) */
export function useHangulPracticeMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      hangulId: string;
      isCorrect: boolean;
      scriptType?: HangulScriptType;
    }) => {
      try {
        const res = await apiClient.api.curriculum.hangul.practice[':userId'].$post({
          param: { userId },
          json: {
            hangulId: payload.hangulId,
            isCorrect: payload.isCorrect,
            scriptType: payload.scriptType || 'CONSONANT',
          },
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (e) {
        logger.debug('[useHangulPracticeMutation] Failed to post hangul practice', e);
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
        const query: Record<string, string> = {};
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
        logger.debug('[useReadingSetsQuery] Hono RPC fallback', e);
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
        // 连字符路由在 Hono 客户端类型中缺失，此处为显式边界断言（与此前 as any 等价）。
        const readingApi = apiClient.api.reading as unknown as {
          'news-topics': { $get: () => Promise<Response> };
        };
        const res = await readingApi['news-topics'].$get();
        if (res.ok) {
          const topics = await res.json();
          if (Array.isArray(topics) && topics.length > 0) return topics as NewsTopic[];
        }
      } catch (e) {
        logger.debug('[useNewsTopicsQuery] fallback to protocol NEWS_TOPICS', e);
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
  /** 安装器是否就绪（未就绪显示“即将推出”，不发起安装）。 */
  installerReady?: boolean;
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
        if (!res.ok) throw new Error('暂时无法读取声调基准词表，请稍后重试。');
        const data = (await res.json()) as { pitchEntries?: PitchLexiconItem[] };
        if (!Array.isArray(data.pitchEntries)) throw new Error('声调基准词表返回格式异常。');
        return data.pitchEntries;
      } catch (e) {
        logger.debug('[usePitchLexiconQuery] gateway request failed', e);
        throw e instanceof Error ? e : new Error('暂时无法读取声调基准词表。');
      }
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

export type KanaWordItem = {
  id: string;
  /** 词典条目 id（可直接调收集接口转 FSRS 生词卡）。 */
  entryId: string;
  headword: string;
  /** 假名读音（听写播报与作答比对用）。 */
  kana: string;
  meanings: string[];
  /** TTS 朗读文本（即 kana）。 */
  audioText: string;
  sourceLabel: string;
};

/** 调用 Gateway learning.content 生成假名单词（听写/词义巩固，系统随机出题）。 */
export function useGenerateKanaWordsMutation(userId = DEFAULT_USER_ID) {
  return useMutation({
    mutationFn: async (payload?: { count?: number; script?: 'HIRAGANA' | 'KATAKANA' }) => {
      const res = await apiClient.api.learning.content[':userId'].$post({
        param: { userId },
        json: {
          action: 'generate_kana_words',
          count: payload?.count || 8,
          collect: false,
          language: 'ja',
          ...(payload?.script ? { script: payload.script } : {}),
        },
      });
      if (!res.ok) throw new Error('生成假名单词失败');
      const data = (await res.json()) as { kanaWords?: KanaWordItem[] };
      if (!data.kanaWords?.length) throw new Error('假名单词为空');
      return data.kanaWords;
    },
  });
}

/** 韩语词语（听写选词/词义回想，韩语表层形 + 英文释义，无需输入法）。 */
export interface HangulWordItem {
  id: string;
  entryId: string;
  korean: string;
  meanings: string[];
  audioText: string;
  sourceLabel: string;
}

/** 调用 Gateway learning.content 生成韩语单词（词池=已安装韩语词典包，未安装抛错由 UI 显式引导）。 */
export function useGenerateHangulWordsMutation(userId = DEFAULT_USER_ID) {
  return useMutation({
    mutationFn: async (payload?: { count?: number }) => {
      const res = await apiClient.api.learning.content[':userId'].$post({
        param: { userId },
        json: {
          action: 'generate_hangul_words',
          count: payload?.count || 8,
          collect: false,
          language: 'ko',
        },
      });
      if (!res.ok) throw new Error('生成韩语单词失败');
      const data = (await res.json()) as { hangulWords?: HangulWordItem[] };
      if (!data.hangulWords?.length) throw new Error('韩语单词为空');
      return data.hangulWords;
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
