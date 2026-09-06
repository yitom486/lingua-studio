/**
 * TTS 领域契约（@study-studio/tts-core，零厂商依赖）。
 *
 * 约定：
 * - 本包只定义抽象（引擎接口、请求规约、分语言提示词/上下文）与纯函数，
 *   不 import 任何具体 TTS 厂商 SDK，也不触碰 DOM / speechSynthesis。
 * - 具体引擎（Web Speech 真机、外挂神经端点）各自实现 `TtsEngine` 并注册；
 *   `StubTtsEngine` 仅供单测，生产代码禁止注册。
 */
export {};
//# sourceMappingURL=types.js.map