/**
 * 目标语种轨道 UI 壳层核心配置 (LearningShell SSOT)
 * 决定导航入口可见性、Tab 允许集、特性开关、文案偏置与默认阅读语言。
 */
import type { NavigationTab } from '../stores/useStudySessionStore.js';

export type TrackLanguage = 'ja' | 'en' | 'ko';

export interface LearningShellConfig {
  track: TrackLanguage;
  trackName: string;
  /** 侧栏导航与路由允许挂载的 Tab 集合 */
  allowedTabs: NavigationTab[];
  /** 语种特性与扩展开关 */
  featureFlags: {
    kanaStudio: boolean;
    pitchAccent: boolean;
    furiganaToggle: boolean;
    englishNewsMultiSource: boolean;
    koreanInterim: boolean;
  };
  /** 学习域文案偏置（保持 zh-CN Chrome 界面母语，仅调整学习术语与提示） */
  copy: {
    levelSchemeLabel: string; // 例如「CEFR / 考研分段」或「JLPT 能力考」
    emptySkillsHint: string;
    targetWeaknessLabel: string;
    readingEmptyHint: string;
  };
  /** 双源阅读默认语言 */
  defaultReadingLang: 'JA' | 'EN' | 'KO';
  /** 非法 Tab 自动跳回的降级兜底 Tab */
  fallbackTab: NavigationTab;
}

export const LEARNING_SHELL_CONFIGS: Record<TrackLanguage, LearningShellConfig> = {
  en: {
    track: 'en',
    trackName: '英语',
    allowedTabs: ['QUIZ', 'CARDS', 'READING', 'WRITING', 'MISTAKES', 'RADAR'],
    featureFlags: {
      kanaStudio: false,
      pitchAccent: false,
      furiganaToggle: false,
      englishNewsMultiSource: true,
      koreanInterim: false,
    },
    copy: {
      levelSchemeLabel: 'CEFR / 考研分段',
      emptySkillsHint: '暂无英语技能评测记录 · 开始自适应做题后系统将自动构建真实能力画像',
      targetWeaknessLabel: '考研/六级核心难点',
      readingEmptyHint: '暂无英语篇目，点击右上角生成或拉取最新外媒新闻',
    },
    defaultReadingLang: 'EN',
    fallbackTab: 'QUIZ',
  },
  ja: {
    track: 'ja',
    trackName: '日语',
    allowedTabs: [
      'QUIZ',
      'CARDS',
      'READING',
      'WRITING',
      'TEXTBOOK',
      'SHADOWING',
      'PITCH',
      'KANA',
      'MISTAKES',
      'RADAR',
    ],
    featureFlags: {
      kanaStudio: true,
      pitchAccent: true,
      furiganaToggle: true,
      englishNewsMultiSource: false,
      koreanInterim: false,
    },
    copy: {
      levelSchemeLabel: 'JLPT 能力考',
      emptySkillsHint: '暂无日语技能评测记录 · 开始自适应做题后系统将自动构建真实能力画像',
      targetWeaknessLabel: 'JLPT 核心语法与助词',
      readingEmptyHint: '暂无日语篇目，点击右上角生成或拉取 NHK 新闻',
    },
    defaultReadingLang: 'JA',
    fallbackTab: 'QUIZ',
  },
  ko: {
    track: 'ko',
    trackName: '韩语',
    allowedTabs: ['QUIZ', 'CARDS', 'READING', 'MISTAKES', 'RADAR'],
    featureFlags: {
      kanaStudio: false,
      pitchAccent: false,
      furiganaToggle: false,
      englishNewsMultiSource: false,
      koreanInterim: true,
    },
    copy: {
      levelSchemeLabel: 'TOPIK (interim 预研)',
      emptySkillsHint: '韩语学习轨道搭建中 · 敬请期待自适应题库上线',
      targetWeaknessLabel: 'TOPIK 核心词汇与句式',
      readingEmptyHint: '韩语轨道脚手架体验中',
    },
    defaultReadingLang: 'KO',
    fallbackTab: 'READING',
  },
};

export function normalizeTrackLanguage(lang: string | undefined | null): TrackLanguage {
  if (lang === 'en') return 'en';
  if (lang === 'ko') return 'ko';
  return 'ja';
}

export function getLearningShellConfig(track: string | undefined | null): LearningShellConfig {
  const normalized = normalizeTrackLanguage(track);
  return LEARNING_SHELL_CONFIGS[normalized];
}
