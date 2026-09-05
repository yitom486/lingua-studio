import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { GATEWAY_BASE_URL } from '../lib/api-client.js';

export const CODEX_QUERY_KEYS = {
  STATUS: ['agent', 'codexStatus'] as const,
  MODELS: ['agent', 'codexModels'] as const,
  THREADS: ['agent', 'codexThreads'] as const,
  THREAD_ITEMS: ['agent', 'codexThreadItems'] as const,
  COLLAB_MODES: ['agent', 'codexCollabModes'] as const,
  QUEUE: ['agent', 'codexQueue'] as const,
  SKILLS: ['agent', 'codexSkills'] as const,
  RATE_LIMITS: ['agent', 'codexRateLimits'] as const,
  MCP_SERVERS: ['agent', 'codexMcpServers'] as const,
  REALTIME_CAPABILITY: ['agent', 'codexRealtimeCapability'] as const,
};

type CodexInvalidateListener = (event: {
  kind: 'queue' | 'skills';
  threadId?: string;
}) => void;

const codexInvalidateListeners = new Set<CodexInvalidateListener>();

/** GatewayClient 收到旁路通知时调用 */
export function emitCodexInvalidate(event: {
  kind: 'queue' | 'skills';
  threadId?: string;
}): void {
  for (const listener of codexInvalidateListeners) {
    listener(event);
  }
}

/** 订阅 Codex 旁路失效（queue/changed、skills/changed） */
export function useCodexRealtimeInvalidation(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const listener: CodexInvalidateListener = (event) => {
      if (event.kind === 'queue') {
        if (event.threadId) {
          void qc.invalidateQueries({
            queryKey: [...CODEX_QUERY_KEYS.QUEUE, event.threadId],
          });
        } else {
          void qc.invalidateQueries({ queryKey: CODEX_QUERY_KEYS.QUEUE });
        }
        return;
      }
      if (event.kind === 'skills') {
        void qc.invalidateQueries({ queryKey: CODEX_QUERY_KEYS.SKILLS });
      }
    };
    codexInvalidateListeners.add(listener);
    return () => {
      codexInvalidateListeners.delete(listener);
    };
  }, [qc]);
}

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
  toolName?: string;
  arguments?: Record<string, unknown>;
}

export interface CodexCollaborationModeDto {
  name: string;
  mode: string | null;
  model: string | null;
  reasoningEffort: string | null;
}

export interface CodexQueuedSubmissionDto {
  id: string;
  text: string;
  clientUserMessageId: string;
}

export interface CodexSkillDto {
  name: string;
  description: string;
  enabled: boolean;
  scope?: string;
  path?: string;
}

export interface CodexRateLimitsDto {
  limitId: string | null;
  limitName: string | null;
  planType: string | null;
  primaryUsedPercent: number | null;
  primaryResetsAt: number | null;
  secondaryUsedPercent: number | null;
  secondaryResetsAt: number | null;
}

export interface CodexMcpServerStatusDto {
  name: string;
  authStatus: string;
  toolCount: number;
  pluginId: string | null;
}

/** EXPERIMENTAL — 本机 realtime 能力探测（无 UI） */
export interface CodexRealtimeCapabilityDto {
  available: boolean;
  experimental: true;
  message: string;
  voices?: {
    v1: string[];
    v2: string[];
    defaultV1: string | null;
    defaultV2: string | null;
  };
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

export function useCompactCodexThreadMutation() {
  return useMutation({
    mutationFn: async (threadId: string) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/agent/codex/threads/${encodeURIComponent(threadId)}/compact`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error('压缩会话失败');
      return threadId;
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

export function useForkCodexThreadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { threadId: string; ephemeral?: boolean }) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/agent/codex/threads/${encodeURIComponent(input.threadId)}/fork`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ephemeral: input.ephemeral ?? false,
          }),
        }
      );
      if (!res.ok) throw new Error('分叉会话失败');
      return (await res.json()) as { threadId: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CODEX_QUERY_KEYS.THREADS });
    },
  });
}

export function useCodexQueueQuery(threadId: string | null, enabled = true) {
  return useQuery<CodexQueuedSubmissionDto[]>({
    queryKey: [...CODEX_QUERY_KEYS.QUEUE, threadId],
    enabled: Boolean(threadId) && enabled,
    queryFn: async () => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/agent/codex/threads/${encodeURIComponent(threadId!)}/queue`
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { items?: CodexQueuedSubmissionDto[] };
      return Array.isArray(data.items) ? data.items : [];
    },
    staleTime: 5_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: 1,
  });
}

export function useQueueCodexMessageMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { threadId: string; message: string }) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/agent/codex/threads/${encodeURIComponent(input.threadId)}/queue`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: input.message }),
        }
      );
      if (!res.ok) throw new Error('加入队列失败');
      return (await res.json()) as CodexQueuedSubmissionDto;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: [...CODEX_QUERY_KEYS.QUEUE, vars.threadId],
      });
    },
  });
}

export function useDeleteCodexQueueItemMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { threadId: string; queuedId: string }) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/agent/codex/threads/${encodeURIComponent(input.threadId)}/queue/${encodeURIComponent(input.queuedId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('删除队列项失败');
      return input;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: [...CODEX_QUERY_KEYS.QUEUE, vars.threadId],
      });
    },
  });
}

export function useCodexSkillsQuery(enabled = true) {
  return useQuery<CodexSkillDto[]>({
    queryKey: CODEX_QUERY_KEYS.SKILLS,
    enabled,
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/agent/codex/skills`);
      if (!res.ok) return [];
      const data = (await res.json()) as { skills?: CodexSkillDto[] };
      return Array.isArray(data.skills) ? data.skills : [];
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

export function useCodexRateLimitsQuery(enabled = true) {
  return useQuery<CodexRateLimitsDto | null>({
    queryKey: CODEX_QUERY_KEYS.RATE_LIMITS,
    enabled,
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/agent/codex/rate-limits`);
      if (!res.ok) return null;
      return (await res.json()) as CodexRateLimitsDto;
    },
    staleTime: 1000 * 60,
    retry: 1,
  });
}

export function useCodexMcpServersQuery(enabled = true) {
  return useQuery<CodexMcpServerStatusDto[]>({
    queryKey: CODEX_QUERY_KEYS.MCP_SERVERS,
    enabled,
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/agent/codex/mcp-servers`);
      if (!res.ok) return [];
      const data = (await res.json()) as { servers?: CodexMcpServerStatusDto[] };
      return Array.isArray(data.servers) ? data.servers : [];
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

/**
 * EXPERIMENTAL — 探测本机 Codex realtime 是否响应。
 * 默认不启用；仅联调时手动 enabled=true。产品 UI 未接入。
 */
export function useCodexRealtimeCapabilityQuery(enabled = false) {
  return useQuery<CodexRealtimeCapabilityDto>({
    queryKey: CODEX_QUERY_KEYS.REALTIME_CAPABILITY,
    enabled,
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/agent/codex/realtime/capability`);
      if (!res.ok) {
        return {
          available: false,
          experimental: true as const,
          message: '无法探测 realtime 能力（Gateway/Codex 未就绪）。',
        };
      }
      return (await res.json()) as CodexRealtimeCapabilityDto;
    },
    staleTime: 1000 * 60 * 5,
    retry: 0,
  });
}

/** EXPERIMENTAL — 预留 mutations；勿接到正式学习路径 */
export function useStartCodexRealtimeMutation() {
  return useMutation({
    mutationFn: async (input: {
      threadId: string;
      outputModality?: 'text' | 'audio';
      model?: string;
      voice?: string;
      prompt?: string;
    }) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/agent/codex/realtime/${encodeURIComponent(input.threadId)}/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outputModality: input.outputModality ?? 'text',
            ...(input.model ? { model: input.model } : {}),
            ...(input.voice ? { voice: input.voice } : {}),
            ...(input.prompt ? { prompt: input.prompt } : {}),
          }),
        }
      );
      if (!res.ok) throw new Error('realtime start 失败（实验性接口）');
      return (await res.json()) as { ok: boolean; experimental?: boolean; warning?: string };
    },
  });
}

export function useStopCodexRealtimeMutation() {
  return useMutation({
    mutationFn: async (threadId: string) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/agent/codex/realtime/${encodeURIComponent(threadId)}/stop`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error('realtime stop 失败（实验性接口）');
      return (await res.json()) as { ok: boolean; experimental?: boolean };
    },
  });
}
