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
    if (typeof window !== 'undefined') {
      const savedGender = localStorage.getItem('study_studio_tts_gender') as TtsGender | null;
      if (savedGender === 'FEMALE' || savedGender === 'MALE') {
        this.gender = savedGender;
      }
      const savedRate = localStorage.getItem('study_studio_tts_rate');
      if (savedRate) {
        this.rate = parseFloat(savedRate) || 0.9;
      }
      const savedPlugin = localStorage.getItem('study_studio_custom_tts_url');
      if (savedPlugin) {
        this.customPluginUrl = savedPlugin;
      }
      const savedPluginEnabled = localStorage.getItem('study_studio_custom_tts_enabled');
      this.isCustomPluginEnabled = savedPluginEnabled === 'true';

      if ('speechSynthesis' in window) {
        this.loadVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          this.loadVoices();
        };
      }
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
    if (typeof window !== 'undefined') {
      localStorage.setItem('study_studio_tts_gender', gender);
    }
    this.notify();
  }

  public getRate(): number {
    return this.rate;
  }

  public setRate(rate: number) {
    this.rate = Math.max(0.6, Math.min(rate, 1.5));
    if (typeof window !== 'undefined') {
      localStorage.setItem('study_studio_tts_rate', this.rate.toString());
    }
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
    if (typeof window !== 'undefined') {
      localStorage.setItem('study_studio_custom_tts_url', this.customPluginUrl);
      localStorage.setItem('study_studio_custom_tts_enabled', enabled ? 'true' : 'false');
    }
    this.notify();
  }

  /**
   * 智能挑选当前语言与性别下的最优音色
   */
  public getBestVoice(
    lang: SupportedLanguage = 'JA',
    gender: TtsGender = this.gender
  ): SpeechSynthesisVoice | null {
    if (!this.voices || this.voices.length === 0) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this.voices = window.speechSynthesis.getVoices();
      }
    }
    if (this.voices.length === 0) return null;

    const langCode = lang === 'EN' ? 'en' : lang === 'KO' ? 'ko' : 'ja';
    const langVoices = this.voices.filter((v) =>
      v.lang.toLowerCase().startsWith(langCode)
    );

    if (langVoices.length === 0) return null;

    // 女声优选关键词
    const femaleKeywords = [
      'nanami',
      'jenny',
      'sunhi',
      'natural',
      'neural',
      'female',
      'woman',
      'zira',
      'kyoko',
      'samantha',
      'yuna',
    ];

    // 男声优选关键词
    const maleKeywords = [
      'keita',
      'guy',
      'injoon',
      'natural',
      'neural',
      'male',
      'man',
      'david',
      'otoya',
      'ichiro',
      'daniel',
      'heami',
    ];

    const targetKeywords = gender === 'FEMALE' ? femaleKeywords : maleKeywords;

    // 1. 优先匹配包含具体高保真名称的音色
    for (const kw of targetKeywords) {
      const found = langVoices.find((v) => v.name.toLowerCase().includes(kw));
      if (found) return found;
    }

    // 2. 次选包含 Natural / Online 的高质量音色
    const naturalVoice = langVoices.find(
      (v) =>
        v.name.toLowerCase().includes('natural') ||
        v.name.toLowerCase().includes('online') ||
        v.name.toLowerCase().includes('google')
    );
    if (naturalVoice) return naturalVoice;

    // 3. 兜底返回该语言首个音色
    return langVoices[0] ?? null;
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
      onStart?: (() => void) | undefined;
      onEnd?: (() => void) | undefined;
      onError?: ((err?: unknown) => void) | undefined;
    }
  ) {
    // 先停止当前正在播放的声音
    this.stop();

    if (!text || !text.trim()) return;

    const lang = options?.lang || 'JA';
    const gender = options?.gender || this.gender;
    const rate = options?.rate || this.rate;

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

      const voice = this.getBestVoice(lang, gender);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = lang === 'EN' ? 'en-US' : lang === 'KO' ? 'ko-KR' : 'ja-JP';
      }

      utterance.rate = rate;
      utterance.pitch = gender === 'FEMALE' ? 1.05 : 0.95;

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

