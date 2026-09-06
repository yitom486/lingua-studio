/**
 * 分语言音色名线索与纯打分器（自 Web 端 `SpeechStudioEngine` 迁移而来，行为不变）。
 * 输入为平台无关的 `TtsVoiceDescriptor`，可在单测中直接断言。
 */
import type { TtsGender, TtsTrackLanguage, TtsVoiceDescriptor } from './types.js';
/** 指定语种 + 性别的全部匹配线索（含通用线索）。 */
export declare function voiceNameHints(trackLanguage: TtsTrackLanguage, gender: TtsGender): string[];
/** 与 `voiceNameHints` 同源的打分器：命中 +100，反串 −120，本地音色 +15。 */
export declare function scoreVoiceName(voice: Pick<TtsVoiceDescriptor, 'name' | 'localService'>, trackLanguage: TtsTrackLanguage, gender: TtsGender): number;
/** 在候选中按性别挑最优（无正向线索且要男声时，尽量避开高分女声名）。 */
export declare function pickBestVoiceName(voices: TtsVoiceDescriptor[], trackLanguage: TtsTrackLanguage, gender: TtsGender): TtsVoiceDescriptor | null;
//# sourceMappingURL=voice-match.d.ts.map