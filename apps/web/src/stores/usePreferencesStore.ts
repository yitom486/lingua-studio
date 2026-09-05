import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PreferencesState {
  theme: 'light' | 'dark';
  furiganaEnabled: boolean;
  maskTextEnabled: boolean;
  sidebarCollapsed: boolean;
  /** 阅读双栏左侧（文章）宽度占比 0.28–0.72 */
  readingSplitRatio: number;
  /** Study Coach 选用的 Codex 模型 id；空=本机默认 */
  coachModelId: string;
  /** 思考等级（turn/start.effort） */
  coachEffort: string;
  /** 审批策略：never | on-request | untrusted */
  coachApprovalPolicy: string;

  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setFuriganaEnabled: (enabled: boolean) => void;
  toggleFurigana: () => void;
  setMaskTextEnabled: (enabled: boolean) => void;
  toggleMaskText: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setReadingSplitRatio: (ratio: number) => void;
  setCoachModelId: (modelId: string) => void;
  setCoachEffort: (effort: string) => void;
  setCoachApprovalPolicy: (policy: string) => void;
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
      coachModelId: '',
      coachEffort: 'medium',
      coachApprovalPolicy: 'never',

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

      setCoachModelId: (coachModelId: string) => set({ coachModelId }),
      setCoachEffort: (coachEffort: string) => set({ coachEffort }),
      setCoachApprovalPolicy: (coachApprovalPolicy: string) => set({ coachApprovalPolicy }),
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
