/**
 * Azure Speech（Cognitive Services）TTS 纯函数：SSML 组装与端点/鉴权头。
 * REST 契约：POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
 * （无需 SDK；Key 只走 Ocp-Apim-Subscription-Key 头，永不进 URL/日志）。
 */
import type { TtsTrackLanguage } from './types.js';
/** 分轨道默认神经音色（通用、跨区可用）。 */
export declare const AZURE_DEFAULT_VOICES: Record<TtsTrackLanguage, string>;
export declare const AZURE_VOICE_LANG: Record<TtsTrackLanguage, string>;
export declare function azureTtsEndpoint(region: string): string;
export declare function azureTtsHeaders(apiKey: string): Record<string, string>;
export declare function escapeXmlText(text: string): string;
/**
 * 组装 SSML。rate 为本系统语速口径（1.0=常速）：按百分比直写 prosody，
 * 听写 0.75 即 rate="75%"，与 Web Speech / OpenAI speed 同向。
 */
export declare function buildAzureSsml(text: string, options?: {
    voice?: string | undefined;
    trackLanguage?: TtsTrackLanguage | undefined;
    rate?: number | undefined;
}): string;
//# sourceMappingURL=azure.d.ts.map