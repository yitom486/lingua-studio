import type { TtsSpeakInput, TtsSpeakRequest, TtsTrackLanguage } from './types.js';
/** 轨道归一化（大小写/常见变体均可，未知回退 en）。 */
export declare function normalizeTtsTrackLanguage(raw: unknown): TtsTrackLanguage;
export declare function bcp47ForTrack(trackLanguage: TtsTrackLanguage): string;
/** 分语言神经朗读风格提示（调用方可覆盖；Web Speech 引擎忽略本字段）。 */
export declare const TTS_STYLE_PROMPTS: Record<TtsTrackLanguage, string>;
export declare function resolveTtsSpeakRequest(input: TtsSpeakInput): TtsSpeakRequest;
//# sourceMappingURL=request.d.ts.map