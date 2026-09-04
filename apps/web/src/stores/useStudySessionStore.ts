import { create } from 'zustand';

export type NavigationTab =
  | 'QUIZ'
  | 'CARDS'
  | 'TEXTBOOK'
  | 'SHADOWING'
  | 'PITCH'
  | 'MISTAKES'
  | 'RADAR'
  | 'STATS';

export interface StudySessionState {
  activeTab: NavigationTab;
  isCommandOpen: boolean;
  cardFilter: 'ALL' | 'VOCAB' | 'GRAMMAR' | 'CONFUSION';

  setActiveTab: (tab: NavigationTab) => void;
  setIsCommandOpen: (open: boolean) => void;
  toggleCommandOpen: () => void;
  setCardFilter: (filter: 'ALL' | 'VOCAB' | 'GRAMMAR' | 'CONFUSION') => void;
}

export const useStudySessionStore = create<StudySessionState>((set) => ({
  activeTab: 'SHADOWING',
  isCommandOpen: false,
  cardFilter: 'ALL',

  setActiveTab: (activeTab) => set({ activeTab }),
  setIsCommandOpen: (isCommandOpen) => set({ isCommandOpen }),
  toggleCommandOpen: () => set((state) => ({ isCommandOpen: !state.isCommandOpen })),
  setCardFilter: (cardFilter) => set({ cardFilter }),
}));
