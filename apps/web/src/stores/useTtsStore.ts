import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  speechStudio,
  type TtsGender,
  type SupportedLanguage,
} from '../utils/audio.js';

export interface SpeakOptions {
  lang?: SupportedLanguage | undefined;
  gender?: TtsGender | undefined;
  rate?: number | undefined;
  onStart?: (() => void) | undefined;
  onEnd?: (() => void) | undefined;
  onError?: ((err?: unknown) => void) | undefined;
}

export interface TtsStoreState {
  // 持久化字段
  gender: TtsGender;
  rate: number;
  customPluginUrl: string;
  isCustomPluginEnabled: boolean;

  // 内存运行时字段
  isSpeaking: boolean;
  currentText: string;

  // 动作
  setGender: (gender: TtsGender) => void;
  setRate: (rate: number) => void;
  setCustomPluginConfig: (url: string, enabled: boolean) => void;
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

        speak: async (text: string, options?: SpeakOptions) => {
          const current = get();
          await speechStudio.speak(text, {
            lang: options?.lang || 'JA',
            gender: options?.gender || current.gender,
            rate: options?.rate || current.rate,
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          speechStudio.setGender(state.gender);
          speechStudio.setRate(state.rate);
          speechStudio.setCustomPluginConfig(state.customPluginUrl, state.isCustomPluginEnabled);
        }
      },
    }
  )
);
