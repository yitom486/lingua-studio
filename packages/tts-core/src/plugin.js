/**
 * 外挂神经 TTS 端点协议（OpenAI `/v1/audio/speech` 兼容）。
 *
 * 覆盖云端（OpenAI / Azure OpenAI / 自建网关）与本地服务
 * （Piper / Kokoro 等暴露兼容接口的服务端），纯函数、无 DOM，可单测。
 * VOICEVOX 原生两步 API 不在此列（需 Midori 等兼容网关转接）。
 */
export function buildOpenAiSpeechPayload(text, options) {
    const payload = {
        input: text,
        model: options?.model ?? 'tts-1',
        voice: options?.voice ?? (options?.gender === 'MALE' ? 'echo' : 'alloy'),
    };
    if (options?.bcp47)
        payload.language = options.bcp47;
    if (options?.speed !== undefined && Number.isFinite(options.speed)) {
        payload.speed = Math.min(4, Math.max(0.25, options.speed));
    }
    return payload;
}
/** 有 Key 则带 Authorization（无 Key 的本地端点不发空头）。 */
export function openAiSpeechHeaders(apiKey) {
    const headers = { 'Content-Type': 'application/json' };
    const key = (apiKey ?? '').trim();
    if (key)
        headers.Authorization = `Bearer ${key}`;
    return headers;
}
/** endpoint 形态初筛（http/https 才放行，避免 file:/javascript: 注入）。 */
export function isHttpEndpoint(url) {
    const v = (url ?? '').trim().toLowerCase();
    return v.startsWith('http://') || v.startsWith('https://');
}
//# sourceMappingURL=plugin.js.map