import { create } from 'zustand';
import type { AiTutorContext } from '../components/AiTutorDrawer.js';

export type NavigationTab =
  | 'QUIZ'
  | 'CARDS'
  | 'TEXTBOOK'
  | 'READING'
  | 'WRITING'
  | 'SHADOWING'
  | 'PITCH'
  | 'MISTAKES'
  | 'RADAR'
  | 'STATS';

export interface StudySessionState {
  activeTab: NavigationTab;
  isCommandOpen: boolean;
  cardFilter: 'ALL' | 'VOCAB' | 'GRAMMAR' | 'CONFUSION';
  questionIndex: number;
  isTutorOpen: boolean;
  tutorContext: AiTutorContext | null;

  setActiveTab: (tab: NavigationTab) => void;
  setIsCommandOpen: (open: boolean) => void;
  toggleCommandOpen: () => void;
  setCardFilter: (filter: 'ALL' | 'VOCAB' | 'GRAMMAR' | 'CONFUSION') => void;
  setQuestionIndex: (index: number) => void;
  openTutor: (ctx: AiTutorContext) => void;
  closeTutor: () => void;
}

export const useStudySessionStore = create<StudySessionState>((set) => ({
  activeTab: 'SHADOWING',
  isCommandOpen: false,
  cardFilter: 'ALL',
  questionIndex: 0,
  isTutorOpen: false,
  tutorContext: null,

  setActiveTab: (activeTab) => set({ activeTab }),
  setIsCommandOpen: (isCommandOpen) => set({ isCommandOpen }),
  toggleCommandOpen: () => set((state) => ({ isCommandOpen: !state.isCommandOpen })),
  setCardFilter: (cardFilter) => set({ cardFilter }),
  setQuestionIndex: (questionIndex) => set({ questionIndex }),
  openTutor: (tutorContext) => set({ isTutorOpen: true, tutorContext }),
  closeTutor: () => set({ isTutorOpen: false }),
}));
