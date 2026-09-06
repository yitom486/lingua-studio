/**
 * Azure Speech（Cognitive Services）TTS 纯函数：SSML 组装与端点/鉴权头。
 * REST 契约：POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
 * （无需 SDK；Key 只走 Ocp-Apim-Subscription-Key 头，永不进 URL/日志）。
 */
import type { TtsTrackLanguage } from './types.js';

/** 分轨道×性别默认神经音色（顶部男女声在自动档下直达云端）。 */
export const AZURE_DEFAULT_VOICES: Record<TtsTrackLanguage, Record<'FEMALE' | 'MALE', string>> = {
  ja: { FEMALE: 'ja-JP-NanamiNeural', MALE: 'ja-JP-KeitaNeural' },
  ko: { FEMALE: 'ko-KR-SunHiNeural', MALE: 'ko-KR-InJoonNeural' },
  en: { FEMALE: 'en-US-JennyNeural', MALE: 'en-US-GuyNeural' },
};

export const AZURE_VOICE_LANG: Record<TtsTrackLanguage, string> = {
  ja: 'ja-JP',
  ko: 'ko-KR',
  en: 'en-US',
};

export function azureTtsEndpoint(region: string): string {
  return `https://${region.trim().toLowerCase()}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

export function azureTtsHeaders(apiKey: string): Record<string, string> {
  return {
    'Ocp-Apim-Subscription-Key': (apiKey ?? '').trim(),
    'Content-Type': 'application/ssml+xml',
    'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
  };
}

export function escapeXmlText(text: string): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 组装 SSML。rate 为本系统语速口径（1.0=常速）：Azure 把 N% 理解为相对提速 N%
 * （实测 rate="100%" 时长减半），故换算为相对值：0.75 → "-25%"，1.2 → "+20%"；
 * rate 恰为 1.0 时不包 prosody，与自然语速逐字节一致。
 */
export function buildAzureSsml(
  text: string,
  options?: {
    voice?: string | undefined;
    trackLanguage?: TtsTrackLanguage | undefined;
    gender?: 'FEMALE' | 'MALE' | undefined;
    rate?: number | undefined;
  }
): string {
  const track = options?.trackLanguage ?? 'en';
  const gender = options?.gender ?? 'FEMALE';
  const voice =
    (options?.voice ?? '').trim() ||
    AZURE_DEFAULT_VOICES[track]?.[gender] ||
    AZURE_DEFAULT_VOICES.en.FEMALE;
  const lang = AZURE_VOICE_LANG[track] || AZURE_VOICE_LANG.en;
  const rate = options?.rate;
  // 注意：Azure 对无属性的 <prosody> 空壳直接回 400；无 rate 时不包 prosody。
  // 相对值换算：本系统 1.0=常速 → "+0%"（等价自然语速，直接省略）。
  let inner = escapeXmlText(text);
  if (rate !== undefined && Number.isFinite(rate)) {
    const relative = Math.min(400, Math.max(-90, Math.round((rate - 1) * 100)));
    if (relative !== 0) {
      const sign = relative > 0 ? '+' : '';
      inner = `<prosody rate="${sign}${relative}%">${inner}</prosody>`;
    }
  }
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${voice}">${inner}</voice></speak>`
  );
}
