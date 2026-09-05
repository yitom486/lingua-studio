import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GATEWAY_BASE_URL } from '../lib/api-client.js';

export const CODEX_QUERY_KEYS = {
  STATUS: ['agent', 'codexStatus'] as const,
  MODELS: ['agent', 'codexModels'] as const,
  THREADS: ['agent', 'codexThreads'] as const,
  THREAD_ITEMS: ['agent', 'codexThreadItems'] as const,
  COLLAB_MODES: ['agent', 'codexCollabModes'] as const,
};

export interface CodexAccountStatusDto {
  linked: boolean;
  requiresOpenaiAuth: boolean;
  planType?: string | null;
  email?: string | null;
  codexHome?: string;
  binary?: string;
  message: string;
}

export interface CodexModelDto {
  id: string;
  model: string;
  displayName: string;
  description?: string;
  isDefault?: boolean;
  hidden?: boolean;
  supportedReasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

export interface CodexThreadDto {
  id: string;
  preview: string;
  name: string | null;
  createdAt: number;
  updatedAt: number;
  ephemeral: boolean;
  cwd?: string;
  modelProvider?: string;
}

export interface CodexThreadItemDto {
  turnId: string;
  type: string;
  text?: string;
  id?: string;
}

export interface CodexCollaborationModeDto {
  name: string;
  mode: string | null;
  model: string | null;
  reasoningEffort: string | null;
}

/** 本机 Codex 登录联动状态（复用 ~/.codex，不另建凭证） */
export function useCodexStatusQuery() {
  return useQuery<CodexAccountStatusDto>({
    queryKey: CODEX_QUERY_KEYS.STATUS,
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/agent/codex/status`);
      if (!res.ok) {
        return {
          linked: false,
          requiresOpenaiAuth: true,
          message: '无法探测 Codex 状态，请确认 Gateway 已启动。',
        };
      }
      return (await res.json()) as CodexAccountStatusDto;
    },
    staleTime: 1000 * 30,
    retry: 1,
  });
}

/** 本机 Codex 可见模型列表 */
export function useCodexModelsQuery(enabled = true) {
  return useQuery<CodexModelDto[]>({
    queryKey: CODEX_QUERY_KEYS.MODELS,
    enabled,
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/agent/codex/models`);
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: CodexModelDto[] };
      return Array.isArray(data.models) ? data.models : [];
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

/** thread/list — 持久化会话历史 */
export function useCodexThreadsQuery(enabled = true) {
  return useQuery<{ threads: CodexThreadDto[]; nextCursor: string | null }>({
    queryKey: CODEX_QUERY_KEYS.THREADS,
    enabled,
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/agent/codex/threads?limit=40`);
      if (!res.ok) return { threads: [], nextCursor: null };
      return (await res.json()) as { threads: CodexThreadDto[]; nextCursor: string | null };
    },
    staleTime: 1000 * 15,
    retry: 1,
  });
}

/** thread/items/list — 恢复气泡 */
export function useCodexThreadItemsQuery(threadId: string | null, enabled = true) {
  return useQuery<CodexThreadItemDto[]>({
    queryKey: [...CODEX_QUERY_KEYS.THREAD_ITEMS, threadId],
    enabled: Boolean(threadId) && enabled,
    queryFn: async () => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/agent/codex/threads/${encodeURIComponent(threadId!)}/items?limit=100`
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { items?: CodexThreadItemDto[] };
      return Array.isArray(data.items) ? data.items : [];
    },
    staleTime: 1000 * 10,
    retry: 1,
  });
}

/** collaborationMode/list */
export function useCodexCollaborationModesQuery(enabled = true) {
  return useQuery<CodexCollaborationModeDto[]>({
    queryKey: CODEX_QUERY_KEYS.COLLAB_MODES,
    enabled,
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/agent/codex/collaboration-modes`);
      if (!res.ok) return [];
      const data = (await res.json()) as { modes?: CodexCollaborationModeDto[] };
      return Array.isArray(data.modes) ? data.modes : [];
    },
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });
}

export function useArchiveCodexThreadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/agent/codex/threads/${encodeURIComponent(threadId)}/archive`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error('归档会话失败');
      return threadId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CODEX_QUERY_KEYS.THREADS });
    },
  });
}

export function useRenameCodexThreadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { threadId: string; name: string }) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/agent/codex/threads/${encodeURIComponent(input.threadId)}/name`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: input.name }),
        }
      );
      if (!res.ok) throw new Error('重命名失败');
      return input;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CODEX_QUERY_KEYS.THREADS });
    },
  });
}
