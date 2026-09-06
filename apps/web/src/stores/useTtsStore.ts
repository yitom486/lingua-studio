import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TtsPurpose } from '@study-studio/tts-core';
import {
  speechStudio,
  type TtsGender,
  type SupportedLanguage,
} from '../utils/audio.js';

export interface SpeakOptions {
  lang?: SupportedLanguage | undefined;
  gender?: TtsGender | undefined;
  rate?: number | undefined;
  /** 朗读用途（听写更慢等），透传 tts-core 规约器；缺省 general。 */
  purpose?: TtsPurpose | undefined;
  onStart?: (() => void) | undefined;
  onEnd?: (() => void) | undefined;
  onError?: ((err?: unknown) => void) | undefined;
}

export type VoicePrefKey = `${SupportedLanguage}_${TtsGender}`;

export function voicePrefKey(lang: SupportedLanguage, gender: TtsGender): VoicePrefKey {
  return `${lang}_${gender}`;
}

export interface TtsStoreState {
  // 持久化字段
  gender: TtsGender;
  rate: number;
  customPluginUrl: string;
  isCustomPluginEnabled: boolean;
  /** 外挂端点 API Key（仅存本机 localStorage）。 */
  customPluginApiKey: string;
  /** 外挂端点音色 id（空则按性别回填）。 */
  customPluginVoiceId: string;
  /** 按语种+性别记住用户手动选择的系统音色 URI */
  preferredVoices: Partial<Record<VoicePrefKey, string>>;

  // 内存运行时字段
  isSpeaking: boolean;
  currentText: string;

  // 动作
  setGender: (gender: TtsGender) => void;
  setRate: (rate: number) => void;
  setCustomPluginConfig: (url: string, enabled: boolean) => void;
  setCustomPluginAuth: (apiKey: string, voiceId: string) => void;
  setPreferredVoice: (lang: SupportedLanguage, gender: TtsGender, voiceURI: string | null) => void;
  speak: (text: string, options?: SpeakOptions) => Promise<void>;
  stop: () => void;
}

export const useTtsStore = create<TtsStoreState>()(
  persist(
    (set, get) => {
      // 监听底层 SpeechStudioEngine 的状态变更，双向保持同步
      speechStudio.subscribe(() => {
        const isSpeaking = speechStudio.getIsSpeaking();
        const currentText = speechStudio.getCurrentText();
        const engineGender = speechStudio.getGender();
        const engineRate = speechStudio.getRate();

        set((state) => {
          if (
            state.isSpeaking === isSpeaking &&
            state.currentText === currentText &&
            state.gender === engineGender &&
            state.rate === engineRate
          ) {
            return state;
          }
          return {
            isSpeaking,
            currentText,
            gender: engineGender,
            rate: engineRate,
          };
        });
      });

      return {
        gender: speechStudio.getGender(),
        rate: speechStudio.getRate(),
        customPluginUrl: speechStudio.getCustomPluginConfig().url,
        isCustomPluginEnabled: speechStudio.getCustomPluginConfig().enabled,
        customPluginApiKey: speechStudio.getCustomPluginAuth().apiKey,
        customPluginVoiceId: speechStudio.getCustomPluginAuth().voiceId,
        preferredVoices: {},
        isSpeaking: speechStudio.getIsSpeaking(),
        currentText: speechStudio.getCurrentText(),

        setGender: (gender: TtsGender) => {
          speechStudio.setGender(gender);
          set({ gender });
        },

        setRate: (rate: number) => {
          speechStudio.setRate(rate);
          set({ rate });
        },

        setCustomPluginConfig: (url: string, enabled: boolean) => {
          speechStudio.setCustomPluginConfig(url, enabled);
          set({ customPluginUrl: url, isCustomPluginEnabled: enabled });
        },

        setCustomPluginAuth: (apiKey: string, voiceId: string) => {
          speechStudio.setCustomPluginAuth(apiKey, voiceId);
          set({ customPluginApiKey: apiKey, customPluginVoiceId: voiceId });
        },

        setPreferredVoice: (lang, gender, voiceURI) => {
          const key = voicePrefKey(lang, gender);
          set((state) => {
            const next = { ...state.preferredVoices };
            if (!voiceURI) {
              delete next[key];
            } else {
              next[key] = voiceURI;
            }
            return { preferredVoices: next };
          });
        },

        speak: async (text: string, options?: SpeakOptions) => {
          const current = get();
          const lang = options?.lang || 'EN';
          const gender = options?.gender || current.gender;
          const preferredVoiceURI =
            current.preferredVoices[voicePrefKey(lang, gender)] ?? null;
          await speechStudio.speak(text, {
            lang,
            gender,
            rate: options?.rate || current.rate,
            preferredVoiceURI,
            ...(options?.purpose ? { purpose: options.purpose } : {}),
            onStart: options?.onStart,
            onEnd: options?.onEnd,
            onError: options?.onError,
          });
        },

        stop: () => {
          speechStudio.stop();
          set({ isSpeaking: false, currentText: '' });
        },
      };
    },
    {
      name: 'study_studio_tts_config',
      partialize: (state) => ({
        gender: state.gender,
        rate: state.rate,
        customPluginUrl: state.customPluginUrl,
        isCustomPluginEnabled: state.isCustomPluginEnabled,
        customPluginApiKey: state.customPluginApiKey,
        customPluginVoiceId: state.customPluginVoiceId,
        preferredVoices: state.preferredVoices,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          speechStudio.setGender(state.gender);
          speechStudio.setRate(state.rate);
          speechStudio.setCustomPluginConfig(state.customPluginUrl, state.isCustomPluginEnabled);
          speechStudio.setCustomPluginAuth(state.customPluginApiKey, state.customPluginVoiceId);
        }
      },
    }
  )
);
