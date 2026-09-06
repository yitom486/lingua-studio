/**
 * 仅供单测的假引擎：不发声，只记录调用并立即完成。
 * 生产代码禁止注册（接入一律真机）。
 */
import { type Result, type BusinessError } from '@study-studio/shared';
import type { TtsSpeakHandle, TtsSpeakRequest } from './types.js';
import type { TtsEngine } from './engine.js';
export declare class StubTtsEngine implements TtsEngine {
    readonly id = "stub";
    readonly label = "Stub (tests only)";
    readonly calls: TtsSpeakRequest[];
    stoppedCount: number;
    speak(request: TtsSpeakRequest): Promise<Result<TtsSpeakHandle, BusinessError>>;
    stopAll(): void;
}
//# sourceMappingURL=stub.d.ts.map