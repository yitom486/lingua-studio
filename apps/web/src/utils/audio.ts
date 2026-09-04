/**
 * 基于 Web Audio API 的轻量无依赖温暖学习音效生成器与高保真多语种语音合成引擎 (TTS Studio)
 * 具备“一男一女”双音色预设与本地/外部 TTS 神经语音小外挂扩展槽位
 */

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

  private scoreVoiceForGender(voice: SpeechSynthesisVoice, gender: TtsGender): number {
    const name = voice.name.toLowerCase();
    // 扩展名单：覆盖 Windows / Edge / Chrome 常见英日韩音色
    const femaleHints = [
      'nanami',
      'jenny',
      'zira',
      'susan',
      'samantha',
      'kyoko',
      'sunhi',
      'yuna',
      'heami',
      'aria',
      'jenny',
      'michelle',
      'sara',
      'hazel',
      'catherine',
      'sonia',
      'female',
      'woman',
      'girl',
      '女士',
      '女声',
    ];
    const maleHints = [
      'keita',
      'otoya',
      'ichiro',
      'guy',
      'david',
      'mark',
      'daniel',
      'james',
      'george',
      'ryan',
      'christopher',
      'eric',
      'andrew',
      'thomas',
      'steffan',
      'brian',
      'ravi',
      'injoon',
      'bongjin',
      'male',
      'man',
      'boy',
      '男声',
      '男士',
    ];

    let score = 0;
    const own = gender === 'FEMALE' ? femaleHints : maleHints;
    const opposite = gender === 'FEMALE' ? maleHints : femaleHints;

    for (const kw of own) {
      if (name.includes(kw)) score += 100;
    }
    for (const kw of opposite) {
      if (name.includes(kw)) score -= 120;
    }

    // 本地桌面音色通常比单一 Google 云端音色更易分出男女
    if (voice.localService) score += 15;
    // 避免把含 Neural 但未点名的默认云端女声当男声高分
    if (gender === 'MALE' && (name.includes('jenny') || name.includes('zira') || name.includes('aria'))) {
      score -= 200;
    }
    return score;
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
      const s = this.scoreVoiceForGender(v, gender);
      if (s > bestScore) {
        bestScore = s;
        best = v;
      }
    }

    // 若最高分仍 ≤0，说明没有正向性别线索：男声时尽量避开高分女声名
    if (best && bestScore <= 0 && gender === 'MALE') {
      const nonFemale = langVoices
        .map((v) => ({ v, s: this.scoreVoiceForGender(v, 'MALE') }))
        .sort((a, b) => b.s - a.s);
      return nonFemale[0]?.v ?? best;
    }

    return best ?? langVoices[0] ?? null;
  }

  /** 当前系统是否能为该语种找到「具名」对应性别音色 */
  public hasNamedGenderVoice(lang: SupportedLanguage, gender: TtsGender): boolean {
    const langVoices = this.listVoicesForLang(lang);
    return langVoices.some((v) => this.scoreVoiceForGender(v, gender) >= 100);
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
    const rate = options?.rate || this.rate;
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
    if (this.isCustomPluginEnabled && this.customPluginUrl) {
      try {
        const payload = {
          input: text,
          model: 'tts-1',
          voice: gender === 'FEMALE' ? 'alloy' : 'echo',
        };
        const res = await fetch(this.customPluginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
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
        console.warn('[SpeechStudio] 小外挂服务未响应，平滑降级为系统高清音色:', e);
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
        utterance.lang = lang === 'EN' ? 'en-US' : lang === 'KO' ? 'ko-KR' : 'ja-JP';
      }

      utterance.rate = rate;
      // 无具名男声时大幅降调（Chrome 常只有一条 Google US English 女声）
      utterance.pitch =
        gender === 'FEMALE' ? 1.08 : hasNamed ? 0.88 : 0.55;

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

