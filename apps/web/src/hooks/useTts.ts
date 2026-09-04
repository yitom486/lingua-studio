import { useTtsStore, type SpeakOptions } from '../stores/useTtsStore.js';
import type { TtsGender, SupportedLanguage } from '../utils/audio.js';

export interface UseTtsReturn {
  isSpeaking: boolean;
  currentText: string;
  gender: TtsGender;
  rate: number;
  speak: (text: string, options?: SpeakOptions) => Promise<void>;
  stop: () => void;
  setGender: (gender: TtsGender) => void;
  setRate: (rate: number) => void;
}

/**
 * 统一的 TTS Hook (直接代理底层 Zustand useTtsStore)
 */
export function useTts(): UseTtsReturn {
  const isSpeaking = useTtsStore((s) => s.isSpeaking);
  const currentText = useTtsStore((s) => s.currentText);
  const gender = useTtsStore((s) => s.gender);
  const rate = useTtsStore((s) => s.rate);
  const speak = useTtsStore((s) => s.speak);
  const stop = useTtsStore((s) => s.stop);
  const setGender = useTtsStore((s) => s.setGender);
  const setRate = useTtsStore((s) => s.setRate);

  return {
    isSpeaking,
    currentText,
    gender,
    rate,
    speak,
    stop,
    setGender,
    setRate,
  };
}
