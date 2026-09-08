import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GATEWAY_BASE_URL } from '../lib/api-client.js';
import { DEFAULT_USER_ID, QUERY_KEYS } from './query-keys.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import { normalizeTrackLanguage } from '../learning/learning-shell.js';

export interface LessonSection {
  heading: string;
  body: string[];
}

export interface LessonExample {
  ja: string;
  reading: string;
  zh: string;
}

export interface LessonItem {
  skillId: string;
  language: string;
  minLevel: string;
  title: string;
  summary: string;
  sections: LessonSection[];
  examples: LessonExample[];
  pitfall: string;
  sortOrder: number;
  completed: boolean;
  completedAt?: string | undefined;
}

function rowStr(row: Record<string, unknown>, key: string, fallback = ''): string {
  const value = row[key];
  return typeof value === 'string' ? value : fallback;
}

function toLesson(row: Record<string, unknown>): LessonItem {
  const sectionsRaw = Array.isArray(row.sections) ? row.sections : [];
  const examplesRaw = Array.isArray(row.examples) ? row.examples : [];
  return {
    skillId: rowStr(row, 'skillId') || rowStr(row, 'id'),
    language: rowStr(row, 'language'),
    minLevel: rowStr(row, 'minLevel', 'NOVICE'),
    title: rowStr(row, 'title'),
    summary: rowStr(row, 'summary'),
    sections: (sectionsRaw as Array<Record<string, unknown>>)
      .filter((s) => typeof s.heading === 'string')
      .map((s) => ({
        heading: String(s.heading),
        body: Array.isArray(s.body) ? s.body.map((p) => String(p)) : [],
      })),
    examples: (examplesRaw as Array<Record<string, unknown>>)
      .filter((e) => typeof e.ja === 'string')
      .map((e) => ({
        ja: String(e.ja),
        reading: typeof e.reading === 'string' ? (e.reading as string) : '',
        zh: typeof e.zh === 'string' ? (e.zh as string) : '',
      })),
    pitfall: rowStr(row, 'pitfall'),
    sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
    completed: row.completed === true,
    ...(typeof row.completedAt === 'string' ? { completedAt: row.completedAt } : {}),
  };
}

/** 语法讲义列表（含学完态；无讲义的轨道返回空数组，UI 显式空态）。 */
export function useLessonsQuery(userId = DEFAULT_USER_ID, langOverride?: string) {
  const profileLang = useUserProfileStore((s) => s.profile.targetLanguage);
  const targetLanguage = normalizeTrackLanguage(langOverride || profileLang);
  return useQuery<LessonItem[]>({
    queryKey: [...QUERY_KEYS.LESSONS, userId, targetLanguage],
    queryFn: async () => {
      const url = `${GATEWAY_BASE_URL}/api/lessons/${userId}?lang=${targetLanguage}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('讲义加载失败');
      const list = (await res.json()) as unknown;
      if (!Array.isArray(list)) return [];
      return (list as Array<Record<string, unknown>>).map(toLesson);
    },
  });
}

/** 学完打卡（幂等；成功后刷新讲义 + 题库，解锁即时生效）。 */
export function useCompleteLessonMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const url = `${GATEWAY_BASE_URL}/api/lessons/${userId}/complete`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId }),
      });
      if (!res.ok) throw new Error('打卡失败，请重试');
      return (await res.json()) as unknown;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LESSONS }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.QUESTIONS }),
      ]);
    },
  });
}
