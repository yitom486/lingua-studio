import { useQuery } from '@tanstack/react-query';
import { GATEWAY_BASE_URL } from '../lib/api-client.js';

export const CODEX_QUERY_KEYS = {
  STATUS: ['agent', 'codexStatus'] as const,
  MODELS: ['agent', 'codexModels'] as const,
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
