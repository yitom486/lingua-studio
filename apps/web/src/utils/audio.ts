/**
 * 基于 Web Audio API 的轻量无依赖温暖学习音效生成器与高保真多语种语音合成引擎 (TTS Studio)
 * 具备“一男一女”双音色预设与本地/外部 TTS 神经语音小外挂扩展槽位
 */

import { logger } from '@study-studio/shared';
import {
  buildOpenAiSpeechPayload,
  isHttpEndpoint,
  normalizeTtsTrackLanguage,
  openAiSpeechHeaders,
  resolveTtsSpeakRequest,
  scoreVoiceName,
  type TtsPurpose,
} from '@study-studio/tts-core';

export type TtsGender = 'FEMALE' | 'MALE';
export type SupportedLanguage = 'JA' | 'EN' | 'KO';

class SoundEngine {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // 1. 温暖柔和的按键微触感 (类似木质/机械键盘微触)
  public playClick() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.04);
    } catch {}
  }

  // 2. 答对 / 记忆掌握时的温润和弦 (类似木琴 / 卡林巴琴声)
  public playSuccess() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 大三和弦
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);

        gain.gain.setValueAtTime(0.07, ctx.currentTime + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.06 + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.06);
        osc.stop(ctx.currentTime + idx * 0.06 + 0.28);
      });
    } catch {}
  }

  public playCorrect() {
    this.playSuccess();
  }

  // 3. 做错时的安抚低音 (不刺耳、非报警声，而是温和的木质提醒)
  public playMistake() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(190, ctx.currentTime + 0.14);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.14);
    } catch {}
  }

  public playError() {
    this.playMistake();
  }

  // 4. 每日打卡达成 / 连击突破时的庆祝和弦 (Fanfare)
  public playFanfare() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 连音升华
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

        gain.gain.setValueAtTime(0.1, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.45);
      });
    } catch {}
  }
}

export const sound = new SoundEngine();

/**
 * 高保真多语种智能语音管家 (TTS Studio)
 * 智能筛选各语种最优“一男一女”音色，支持自定义本地小外挂（如 Piper / Kokoro / OpenAI-compatible 接口）
 */
class SpeechStudioEngine {
  private gender: TtsGender = 'FEMALE';
  private rate: number = 0.9;
  private customPluginUrl: string = '';
  private isCustomPluginEnabled: boolean = false;
  /** 外挂端点鉴权 Key（仅放内存 + Zustand persist 本地保存，不上传任何地方）。 */
  private customPluginApiKey: string = '';
  /** 外挂端点音色 id（空则按性别回填 alloy/echo）。 */
  private customPluginVoiceId: string = '';
  private listeners: Set<() => void> = new Set();
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    // 持久化统一由 useTtsStore (Zustand persist) 负责，引擎仅持运行时状态
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        this.loadVoices();
      };
    }
  }

  private loadVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this.voices = window.speechSynthesis.getVoices();
    this.notify();
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public getGender(): TtsGender {
    return this.gender;
  }

  public setGender(gender: TtsGender) {
    this.gender = gender;
    this.notify();
  }

  public getRate(): number {
    return this.rate;
  }

  public setRate(rate: number) {
    this.rate = Math.max(0.6, Math.min(rate, 1.5));
    this.notify();
  }

  public getCustomPluginConfig() {
    return {
      url: this.customPluginUrl,
      enabled: this.isCustomPluginEnabled,
    };
  }

  public setCustomPluginConfig(url: string, enabled: boolean) {
    this.customPluginUrl = url.trim();
    this.isCustomPluginEnabled = enabled;
    this.notify();
  }

  public getCustomPluginAuth() {
    return {
      apiKey: this.customPluginApiKey,
      voiceId: this.customPluginVoiceId,
    };
  }

  public setCustomPluginAuth(apiKey: string, voiceId: string) {
    this.customPluginApiKey = (apiKey ?? '').trim();
    this.customPluginVoiceId = (voiceId ?? '').trim();
    this.notify();
  }

  /**
   * 列出某语种下全部系统音色（供手动选择）
   */
  public listVoicesForLang(lang: SupportedLanguage = 'EN'): SpeechSynthesisVoice[] {
    if (!this.voices || this.voices.length === 0) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this.voices = window.speechSynthesis.getVoices();
      }
    }
    const langCode = lang === 'EN' ? 'en' : lang === 'KO' ? 'ko' : 'ja';
    return this.voices
      .filter((v) => v.lang.toLowerCase().startsWith(langCode))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public getVoiceByURI(voiceURI: string | null | undefined): SpeechSynthesisVoice | null {
    if (!voiceURI) return null;
    if (!this.voices || this.voices.length === 0) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this.voices = window.speechSynthesis.getVoices();
      }
    }
    return this.voices.find((v) => v.voiceURI === voiceURI) ?? null;
  }

  private scoreVoiceForGender(
    voice: SpeechSynthesisVoice,
    gender: TtsGender,
    lang: SupportedLanguage = 'EN'
  ): number {
    // 音色名线索表收归 tts-core（分语言）；此处仅做平台类型适配，数学不变。
    return scoreVoiceName(
      { name: voice.name, localService: voice.localService },
      normalizeTtsTrackLanguage(lang.toLowerCase()),
      gender
    );
  }

  /**
   * 智能挑选当前语言与性别下的最优音色。
   * preferredVoiceURI 优先（用户手动指定）。
   */
  public getBestVoice(
    lang: SupportedLanguage = 'EN',
    gender: TtsGender = this.gender,
    preferredVoiceURI?: string | null
  ): SpeechSynthesisVoice | null {
    if (preferredVoiceURI) {
      const preferred = this.getVoiceByURI(preferredVoiceURI);
      if (preferred) return preferred;
    }

    const langVoices = this.listVoicesForLang(lang);
    if (langVoices.length === 0) return null;

    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -Infinity;
    for (const v of langVoices) {
      const s = this.scoreVoiceForGender(v, gender, lang);
      if (s > bestScore) {
        bestScore = s;
        best = v;
      }
    }

    // 若最高分仍 ≤0，说明没有正向性别线索：男声时尽量避开高分女声名
    if (best && bestScore <= 0 && gender === 'MALE') {
      const nonFemale = langVoices
        .map((v) => ({ v, s: this.scoreVoiceForGender(v, 'MALE', lang) }))
        .sort((a, b) => b.s - a.s);
      return nonFemale[0]?.v ?? best;
    }

    return best ?? langVoices[0] ?? null;
  }

  /** 当前系统是否能为该语种找到「具名」对应性别音色 */
  public hasNamedGenderVoice(lang: SupportedLanguage, gender: TtsGender): boolean {
    const langVoices = this.listVoicesForLang(lang);
    return langVoices.some((v) => this.scoreVoiceForGender(v, gender, lang) >= 100);
  }

  private isSpeaking: boolean = false;
  private currentText: string = '';
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  public getCurrentText(): string {
    return this.currentText;
  }

  /**
   * 执行朗读：优先尝试小外挂，回退至原生高清声音
   */
  public async speak(
    text: string,
    options?: {
      lang?: SupportedLanguage;
      gender?: TtsGender;
      rate?: number;
      preferredVoiceURI?: string | null;
      /** 朗读用途（听写更慢等），透传 tts-core 规约器；缺省 general。 */
      purpose?: TtsPurpose;
      /** 人设昵称（Jenny / 七海 / Yuna…），用于音色名匹配与上下文记录。 */
      personaName?: string;
      /** 神经引擎透传（voiceId 覆盖小外挂默认音色；Web Speech 忽略）。 */
      neural?: { voiceId?: string; stylePrompt?: string };
      onStart?: (() => void) | undefined;
      onEnd?: (() => void) | undefined;
      onError?: ((err?: unknown) => void) | undefined;
    }
  ) {
    // 先停止当前正在播放的声音
    this.stop();

    if (!text || !text.trim()) return;

    const lang = options?.lang || 'EN';
    const gender = options?.gender || this.gender;
    // 分语言提示词 / 上下文 / 语速规约（tts-core 纯函数；用户语速设置优先）。
    const request = resolveTtsSpeakRequest({
      text,
      trackLanguage: lang.toLowerCase(),
      purpose: options?.purpose ?? 'general',
      prefs: {
        gender,
        rate: options?.rate ?? this.rate,
        preferredVoiceURI: options?.preferredVoiceURI,
        ...(options?.personaName ? { personaName: options.personaName } : {}),
      },
      ...(options?.neural ? { neural: options.neural } : {}),
    });
    const rate = request.rate;
    const hasNamed = this.hasNamedGenderVoice(lang, gender);

    this.isSpeaking = true;
    this.currentText = text;
    this.notify();
    options?.onStart?.();

    const cleanup = () => {
      this.isSpeaking = false;
      this.currentText = '';
      this.currentUtterance = null;
      this.currentAudio = null;
      this.notify();
    };

    // 1. 若配置并启用了本地小外挂（如 Piper / Kokoro / OpenAI 兼容 TTS 端点）
    if (this.isCustomPluginEnabled && isHttpEndpoint(this.customPluginUrl)) {
      try {
        const payload = buildOpenAiSpeechPayload(text, {
          voice: this.customPluginVoiceId || request.neural.voiceId,
          gender,
          bcp47: request.bcp47,
        });
        const res = await fetch(this.customPluginUrl, {
          method: 'POST',
          headers: openAiSpeechHeaders(this.customPluginApiKey),
          body: JSON.stringify(payload),
        });
        if (res.status === 401 || res.status === 403) {
          cleanup();
          options?.onError?.(
            new Error('小外挂鉴权失败（401/403），请检查 API Key 是否正确。')
          );
          return;
        }
        if (res.ok) {
          const blob = await res.blob();
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          this.currentAudio = audio;
          audio.playbackRate = rate;
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            cleanup();
            options?.onEnd?.();
          };
          audio.onerror = (e) => {
            URL.revokeObjectURL(audioUrl);
            cleanup();
            options?.onError?.(e);
          };
          await audio.play();
          return;
        }
      } catch (e) {
        logger.debug('[SpeechStudio] 小外挂服务未响应，平滑降级为系统高清音色:', e);
      }
    }

    // 2. 原生 Web Speech 引擎优选播放
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      cleanup();
      options?.onError?.(new Error('SpeechSynthesis not supported'));
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance; // 防止垃圾回收导致发音被掐断

      const voice = this.getBestVoice(lang, gender, options?.preferredVoiceURI);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = request.bcp47;
      }

      utterance.rate = rate;
      // 无具名男声时大幅降调（Chrome 常只有一条 Google US English 女声）
      utterance.pitch =
        gender === 'FEMALE' ? request.pitch : hasNamed ? request.pitch : 0.55;

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.notify();
      };

      utterance.onend = () => {
        cleanup();
        options?.onEnd?.();
      };

      utterance.onerror = (e) => {
        cleanup();
        options?.onError?.(e);
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      cleanup();
      options?.onError?.(err);
    }
  }

  public stop() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.currentText = '';
      this.notify();
    }
  }
}

export const speechStudio = new SpeechStudioEngine();

