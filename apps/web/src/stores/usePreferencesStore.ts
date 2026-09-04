import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PreferencesState {
  theme: 'light' | 'dark';
  furiganaEnabled: boolean;
  maskTextEnabled: boolean;
  sidebarCollapsed: boolean;
  /** 阅读双栏左侧（文章）宽度占比 0.28–0.72 */
  readingSplitRatio: number;

  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setFuriganaEnabled: (enabled: boolean) => void;
  toggleFurigana: () => void;
  setMaskTextEnabled: (enabled: boolean) => void;
  toggleMaskText: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setReadingSplitRatio: (ratio: number) => void;
}

const applyThemeToDom = (theme: 'light' | 'dark') => {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      furiganaEnabled: true,
      maskTextEnabled: false,
      sidebarCollapsed: false,
      readingSplitRatio: 0.58,

      setTheme: (theme: 'light' | 'dark') => {
        applyThemeToDom(theme);
        set({ theme });
      },

      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        applyThemeToDom(next);
        set({ theme: next });
      },

      setFuriganaEnabled: (enabled: boolean) => set({ furiganaEnabled: enabled }),
      toggleFurigana: () => set((state) => ({ furiganaEnabled: !state.furiganaEnabled })),

      setMaskTextEnabled: (enabled: boolean) => set({ maskTextEnabled: enabled }),
      toggleMaskText: () => set((state) => ({ maskTextEnabled: !state.maskTextEnabled })),

      setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),

      setReadingSplitRatio: (ratio: number) =>
        set({ readingSplitRatio: Math.min(0.72, Math.max(0.28, ratio)) }),
    }),
    {
      name: 'study_studio_user_preferences',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyThemeToDom(state.theme);
        }
      },
    }
  )
);
