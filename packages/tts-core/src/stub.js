/**
 * 仅供单测的假引擎：不发声，只记录调用并立即完成。
 * 生产代码禁止注册（接入一律真机）。
 */
import { ok } from '@study-studio/shared';
export class StubTtsEngine {
    id = 'stub';
    label = 'Stub (tests only)';
    calls = [];
    stoppedCount = 0;
    async speak(request) {
        this.calls.push(request);
        return ok({
            stop: () => {
                this.stoppedCount += 1;
            },
            finished: Promise.resolve(),
        });
    }
    stopAll() {
        this.stoppedCount += 1;
    }
}
//# sourceMappingURL=stub.js.map