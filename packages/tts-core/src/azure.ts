/**
 * Azure Speech（Cognitive Services）TTS 纯函数：SSML 组装与端点/鉴权头。
 * REST 契约：POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
 * （无需 SDK；Key 只走 Ocp-Apim-Subscription-Key 头，永不进 URL/日志）。
 */
import type { TtsTrackLanguage } from './types.js';

/** 分轨道默认神经音色（通用、跨区可用）。 */
export const AZURE_DEFAULT_VOICES: Record<TtsTrackLanguage, string> = {
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  en: 'en-US-JennyNeural',
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
 * 组装 SSML。rate 为本系统语速口径（1.0=常速）：按百分比直写 prosody，
 * 听写 0.75 即 rate="75%"，与 Web Speech / OpenAI speed 同向。
 */
export function buildAzureSsml(
  text: string,
  options?: {
    voice?: string | undefined;
    trackLanguage?: TtsTrackLanguage | undefined;
    rate?: number | undefined;
  }
): string {
  const track = options?.trackLanguage ?? 'en';
  const voice =
    (options?.voice ?? '').trim() || AZURE_DEFAULT_VOICES[track] || AZURE_DEFAULT_VOICES.en;
  const lang = AZURE_VOICE_LANG[track] || AZURE_VOICE_LANG.en;
  const rate = options?.rate;
  // 注意：Azure 对无属性的 <prosody> 空壳直接回 400；无 rate 时不包 prosody
  const inner =
    rate !== undefined && Number.isFinite(rate)
      ? `<prosody rate="${Math.min(400, Math.max(25, Math.round(rate * 100)))}%">${escapeXmlText(text)}</prosody>`
      : escapeXmlText(text);
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${voice}">${inner}</voice></speak>`
  );
}
