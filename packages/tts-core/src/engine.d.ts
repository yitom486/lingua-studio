/**
 * TTS 引擎抽象与注册表。
 *
 * - 具体引擎（Web Speech 真机、外挂神经端点、未来服务端引擎）实现 `TtsEngine` 并注册；
 *   调用方只认 `getActiveTtsEngine()`，不对具体引擎产生任何感知（Zero Provider Leak）。
 * - `StubTtsEngine` 另见 `./stub.js`，仅供单测。
 */
import type { Result, BusinessError } from '@study-studio/shared';
import type { TtsSpeakHandle, TtsSpeakRequest, TtsVoiceDescriptor, TtsTrackLanguage } from './types.js';
export interface TtsEngine {
    readonly id: string;
    readonly label: string;
    speak(request: TtsSpeakRequest): Promise<Result<TtsSpeakHandle, BusinessError>>;
    stopAll(): void;
    listVoices?(trackLanguage: TtsTrackLanguage): TtsVoiceDescriptor[];
}
/** 注册引擎；同 id 重复注册直接覆盖（以后注册者为准）。 */
export declare function registerTtsEngine(engine: TtsEngine): void;
export declare function setActiveTtsEngine(id: string): boolean;
export declare function getActiveTtsEngine(): TtsEngine | undefined;
export declare function listTtsEngines(): TtsEngine[];
/** 仅供单测隔离（生产代码禁止调用）。 */
export declare function __resetTtsEnginesForTest(): void;
//# sourceMappingURL=engine.d.ts.map