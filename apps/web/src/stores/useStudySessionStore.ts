import { create } from 'zustand';
import type { GeneratedQuestion } from '@study-studio/protocol';
import type { AiTutorContext } from '../components/AiTutorDrawer.js';

export type NavigationTab =
  | 'QUIZ'
  | 'CARDS'
  | 'KANA'
  | 'TEXTBOOK'
  | 'READING'
  | 'WRITING'
  | 'SHADOWING'
  | 'PITCH'
  | 'MISTAKES'
  | 'RADAR'
  | 'STATS';

export interface PresentedQuizPackage {
  surface: 'quiz' | 'cards' | 'kana_drill' | 'reading_quiz' | 'writing';
  layout?: 'SPLIT_PASSAGE_QUESTIONS' | 'SINGLE_COLUMN' | undefined;
  collectionId?: string | undefined;
  questions: GeneratedQuestion[];
  stepIndex: number;
  passageId?: string | undefined;
  presentedAt: string;
}

export interface StudySessionState {
  activeTab: NavigationTab;
  isCommandOpen: boolean;
  cardFilter: 'ALL' | 'VOCAB' | 'GRAMMAR' | 'CONFUSION';
  questionIndex: number;
  isTutorOpen: boolean;
  tutorContext: AiTutorContext | null;
  /** Agent ui.present 灌入的临时题包（优先于静态/RPC 队列展示） */
  presentedQuiz: PresentedQuizPackage | null;

  setActiveTab: (tab: NavigationTab) => void;
  setIsCommandOpen: (open: boolean) => void;
  toggleCommandOpen: () => void;
  setCardFilter: (filter: 'ALL' | 'VOCAB' | 'GRAMMAR' | 'CONFUSION') => void;
  setQuestionIndex: (index: number) => void;
  openTutor: (ctx?: AiTutorContext | null) => void;
  closeTutor: () => void;
  presentQuiz: (pkg: Omit<PresentedQuizPackage, 'presentedAt'> & { presentedAt?: string }) => void;
  clearPresentedQuiz: () => void;
  applyUiNavigate: (target: string, openTutor?: boolean) => void;
}

const TAB_SET = new Set<string>([
  'QUIZ',
  'CARDS',
  'KANA',
  'TEXTBOOK',
  'READING',
  'WRITING',
  'SHADOWING',
  'PITCH',
  'MISTAKES',
  'RADAR',
  'STATS',
]);

export const useStudySessionStore = create<StudySessionState>((set) => ({
  activeTab: 'SHADOWING',
  isCommandOpen: false,
  cardFilter: 'ALL',
  questionIndex: 0,
  isTutorOpen: false,
  tutorContext: null,
  presentedQuiz: null,

  setActiveTab: (activeTab) => set({ activeTab }),
  setIsCommandOpen: (isCommandOpen) => set({ isCommandOpen }),
  toggleCommandOpen: () => set((state) => ({ isCommandOpen: !state.isCommandOpen })),
  setCardFilter: (cardFilter) => set({ cardFilter }),
  setQuestionIndex: (questionIndex) => set({ questionIndex }),
  openTutor: (tutorContext = null) => set({ isTutorOpen: true, tutorContext: tutorContext ?? null }),
  closeTutor: () => set({ isTutorOpen: false, tutorContext: null }),
  presentQuiz: (pkg) =>
    set({
      presentedQuiz: {
        ...pkg,
        presentedAt: pkg.presentedAt ?? new Date().toISOString(),
        stepIndex: pkg.stepIndex ?? 0,
      },
      questionIndex: pkg.stepIndex ?? 0,
      activeTab:
        pkg.surface === 'reading_quiz'
          ? 'READING'
          : pkg.surface === 'writing'
            ? 'WRITING'
            : pkg.surface === 'kana_drill'
              ? 'KANA'
              : 'QUIZ',
    }),
  clearPresentedQuiz: () => set({ presentedQuiz: null }),
  applyUiNavigate: (target, openTutor) => {
    if (target === 'TUTOR' || openTutor) {
      set({ isTutorOpen: true, tutorContext: null });
      return;
    }
    if (TAB_SET.has(target)) {
      set({ activeTab: target as NavigationTab });
    }
  },
}));
