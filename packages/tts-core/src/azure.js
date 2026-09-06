/** 分轨道默认神经音色（通用、跨区可用）。 */
export const AZURE_DEFAULT_VOICES = {
    ja: 'ja-JP-NanamiNeural',
    ko: 'ko-KR-SunHiNeural',
    en: 'en-US-JennyNeural',
};
export const AZURE_VOICE_LANG = {
    ja: 'ja-JP',
    ko: 'ko-KR',
    en: 'en-US',
};
export function azureTtsEndpoint(region) {
    return `https://${region.trim().toLowerCase()}.tts.speech.microsoft.com/cognitiveservices/v1`;
}
export function azureTtsHeaders(apiKey) {
    return {
        'Ocp-Apim-Subscription-Key': (apiKey ?? '').trim(),
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
    };
}
export function escapeXmlText(text) {
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
export function buildAzureSsml(text, options) {
    const track = options?.trackLanguage ?? 'en';
    const voice = (options?.voice ?? '').trim() || AZURE_DEFAULT_VOICES[track] || AZURE_DEFAULT_VOICES.en;
    const lang = AZURE_VOICE_LANG[track] || AZURE_VOICE_LANG.en;
    const rate = options?.rate;
    const prosody = rate !== undefined && Number.isFinite(rate)
        ? ` rate="${Math.min(400, Math.max(25, Math.round(rate * 100)))}%"`
        : '';
    return (`<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
        `<voice name="${voice}"><prosody${prosody}>${escapeXmlText(text)}</prosody></voice></speak>`);
}
//# sourceMappingURL=azure.js.map