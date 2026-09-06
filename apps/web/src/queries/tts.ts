import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@study-studio/shared';
import { GATEWAY_BASE_URL } from '../lib/api-client.js';
import { QUERY_KEYS } from './query-keys.js';
import { normalizeTrackLanguage } from '../learning/learning-shell.js';

/** P-TTS：语音合成代理查询组（声音列表/有效性验证，Key 永不进缓存键）。 */

export interface AzureVoiceOption {
  id: string;
  label: string;
  gender: 'FEMALE' | 'MALE';
  locale: string;
  styles: string[];
}

/**
 * 拉取 Azure 全量音色（按当前轨道过滤，含各音色可用风格）。
 * apiKey 只随请求体发送，不进 queryKey；失败返回空数组（调用方回退内置短表）。
 */
export function useAzureVoicesQuery(params: {
  region: string;
  apiKey: string;
  track?: string;
  enabled: boolean;
}) {
  const { region, apiKey, track, enabled } = params;
  const trackLanguage = normalizeTrackLanguage(track);
  return useQuery<AzureVoiceOption[]>({
    queryKey: [...QUERY_KEYS.TTS_VOICES, trackLanguage, region],
    enabled: enabled && region.trim().length > 0,
    queryFn: async () => {
      try {
        const res = await fetch(`${GATEWAY_BASE_URL}/api/tts/voices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'azure-speech',
            region,
            ...(apiKey ? { apiKey } : {}),
            trackLanguage,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { voices?: AzureVoiceOption[] };
          if (data && Array.isArray(data.voices)) return data.voices;
        }
      } catch (e) {
        logger.debug('[useAzureVoicesQuery] Failed to load azure voices', e);
      }
      return [];
    },
    staleTime: 1000 * 60 * 30,
  });
}

/** Key/区域变更后刷新声音列表缓存。 */
export function useInvalidateTtsVoices() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TTS_VOICES });
}
