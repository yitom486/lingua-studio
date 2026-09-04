import { useState, useEffect, useCallback } from 'react';
import { speechStudio, type TtsGender, type SupportedLanguage } from '../utils/audio.js';

export interface UseTtsReturn {
  isSpeaking: boolean;
  currentText: string;
  gender: TtsGender;
  rate: number;
  speak: (
    text: string,
    options?: {
      lang?: SupportedLanguage;
      gender?: TtsGender;
      rate?: number;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err?: unknown) => void;
    }
  ) => Promise<void>;
  stop: () => void;
  setGender: (gender: TtsGender) => void;
  setRate: (rate: number) => void;
}

/**
 * 统一的 TTS 响应式状态与调度 Hook
 */
export function useTts(): UseTtsReturn {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(speechStudio.getIsSpeaking());
  const [currentText, setCurrentText] = useState<string>(speechStudio.getCurrentText());
  const [gender, setGenderState] = useState<TtsGender>(speechStudio.getGender());
  const [rate, setRateState] = useState<number>(speechStudio.getRate());

  useEffect(() => {
    const unsubscribe = speechStudio.subscribe(() => {
      setIsSpeaking(speechStudio.getIsSpeaking());
      setCurrentText(speechStudio.getCurrentText());
      setGenderState(speechStudio.getGender());
      setRateState(speechStudio.getRate());
    });
    return unsubscribe;
  }, []);

  const speak = useCallback(
    async (
      text: string,
      options?: {
        lang?: SupportedLanguage;
        gender?: TtsGender;
        rate?: number;
        onStart?: () => void;
        onEnd?: () => void;
        onError?: (err?: unknown) => void;
      }
    ) => {
      await speechStudio.speak(text, options);
    },
    []
  );

  const stop = useCallback(() => {
    speechStudio.stop();
  }, []);

  const setGender = useCallback((g: TtsGender) => {
    speechStudio.setGender(g);
  }, []);

  const setRate = useCallback((r: number) => {
    speechStudio.setRate(r);
  }, []);

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
