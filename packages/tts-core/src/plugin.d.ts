/**
 * 外挂神经 TTS 端点协议（OpenAI `/v1/audio/speech` 兼容）。
 *
 * 覆盖云端（OpenAI / Azure OpenAI / 自建网关）与本地服务
 * （Piper / Kokoro 等暴露兼容接口的服务端），纯函数、无 DOM，可单测。
 * VOICEVOX 原生两步 API 不在此列（需 Midori 等兼容网关转接）。
 */
export interface OpenAiSpeechPayloadOptions {
    /** 模型名；缺省 tts-1（兼容端点多忽略本字段）。 */
    model?: string | undefined;
    /** 音色 id；缺省按性别回填 alloy/echo。 */
    voice?: string | undefined;
    gender?: 'FEMALE' | 'MALE' | undefined;
    /** BCP47（ja-JP 等），随包透传供端点选发音人。 */
    bcp47?: string | undefined;
    /** 语速 0.25–4（OpenAI 语义；本地端点可忽略）。 */
    speed?: number | undefined;
}
export declare function buildOpenAiSpeechPayload(text: string, options?: OpenAiSpeechPayloadOptions): Record<string, unknown>;
/** 有 Key 则带 Authorization（无 Key 的本地端点不发空头）。 */
export declare function openAiSpeechHeaders(apiKey?: string): Record<string, string>;
/** endpoint 形态初筛（http/https 才放行，避免 file:/javascript: 注入）。 */
export declare function isHttpEndpoint(url: string): boolean;
//# sourceMappingURL=plugin.d.ts.map