/**
 * 多语种 TTS「一男一女」人设与试听文案（按目标语种轨道切换）
 * 实际发音引擎仍走 Web Speech / 外挂；此处只负责展示名与预览语。
 */
import type { SupportedLanguage, TtsGender } from '../utils/audio.js';
import type { TrackLanguage } from '../learning/learning-shell.js';

export interface TtsVoicePersona {
  gender: TtsGender;
  /** 设置面板短标签，如「女声 (Jenny)」 */
  label: string;
  /** 导师昵称 */
  displayName: string;
  /** 试听短句（目标语） */
  previewText: string;
}

export interface TtsLanguageVoicePack {
  lang: SupportedLanguage;
  trackLabel: string;
  female: TtsVoicePersona;
  male: TtsVoicePersona;
}

export const TTS_VOICE_PACKS: Record<SupportedLanguage, TtsLanguageVoicePack> = {
  EN: {
    lang: 'EN',
    trackLabel: '英语',
    female: {
      gender: 'FEMALE',
      label: '女声 (Jenny)',
      displayName: 'Jenny',
      previewText:
        'Hello! I am your English tutor Jenny. Let us practice academic English together.',
    },
    male: {
      gender: 'MALE',
      label: '男声 (Guy)',
      displayName: 'Guy',
      previewText:
        'Hi there! I am your English assistant Guy. Welcome to Lingua Studio.',
    },
  },
  JA: {
    lang: 'JA',
    trackLabel: '日语',
    female: {
      gender: 'FEMALE',
      label: '女声 (七海)',
      displayName: '七海',
      previewText: 'こんにちは！私は日本語チューターの七海です。今日も楽しく学びましょう。',
    },
    male: {
      gender: 'MALE',
      label: '男声 (圭太)',
      displayName: '圭太',
      previewText: 'こんにちは！私は日本語アシスタントの圭太です。一緒に頑張りましょう。',
    },
  },
  KO: {
    lang: 'KO',
    trackLabel: '韩语',
    female: {
      gender: 'FEMALE',
      label: '女声 (Yuna)',
      displayName: 'Yuna',
      previewText: '안녕하세요! 저는 한국어 튜터 유나입니다. 함께 열심히 공부해 볼까요?',
    },
    male: {
      gender: 'MALE',
      label: '男声 (InJoon)',
      displayName: 'InJoon',
      previewText: '반갑습니다! 저는 한국어 어시스턴트 인준입니다. 오늘도 화이팅!',
    },
  },
};

export function trackToSpeechLang(track: TrackLanguage | string | null | undefined): SupportedLanguage {
  const t = (track || '').toLowerCase();
  if (t === 'en' || t === 'eng') return 'EN';
  if (t === 'ko' || t === 'kr') return 'KO';
  if (t === 'ja' || t === 'jp') return 'JA';
  return 'EN';
}

export function getTtsVoicePack(lang: SupportedLanguage): TtsLanguageVoicePack {
  return TTS_VOICE_PACKS[lang] || TTS_VOICE_PACKS.EN;
}

export function getPersonaLabel(lang: SupportedLanguage, gender: TtsGender): string {
  const pack = getTtsVoicePack(lang);
  return gender === 'FEMALE' ? pack.female.label : pack.male.label;
}

export function getPreviewText(lang: SupportedLanguage, gender: TtsGender): string {
  const pack = getTtsVoicePack(lang);
  return gender === 'FEMALE' ? pack.female.previewText : pack.male.previewText;
}
