import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PreferencesState {
  theme: 'light' | 'dark';
  furiganaEnabled: boolean;
  maskTextEnabled: boolean;
  sidebarCollapsed: boolean;
  /** 阅读双栏左侧（文章）宽度占比 0.28–0.72 */
  readingSplitRatio: number;
  /** 自由教练面板宽度（px），可拖拽 */
  coachPanelWidthPx: number;
  /** 自由教练面板是否打开（刷新后恢复显隐；关闭不清会话） */
  coachPanelOpen: boolean;
  /** Study Coach 选用的 Codex 模型 id；空=本机默认 */
  coachModelId: string;
  /** 思考等级（turn/start.effort） */
  coachEffort: string;
  /** 审批策略：never | on-request | untrusted */
  coachApprovalPolicy: string;
  /** 恢复的 Codex thread id；空=新建 */
  coachThreadId: string;
  /** false=ephemeral 临时；true=落盘持久化 */
  coachPersistThread: boolean;
  /** collaborationMode：default | plan | 服务端返回的 name */
  coachCollaborationMode: string;

  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setFuriganaEnabled: (enabled: boolean) => void;
  toggleFurigana: () => void;
  setMaskTextEnabled: (enabled: boolean) => void;
  toggleMaskText: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setReadingSplitRatio: (ratio: number) => void;
  setCoachPanelWidthPx: (widthPx: number) => void;
  setCoachPanelOpen: (open: boolean) => void;
  setCoachModelId: (modelId: string) => void;
  setCoachEffort: (effort: string) => void;
  setCoachApprovalPolicy: (policy: string) => void;
  setCoachThreadId: (threadId: string) => void;
  setCoachPersistThread: (persist: boolean) => void;
  setCoachCollaborationMode: (mode: string) => void;
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
      coachPanelWidthPx: 420,
      coachPanelOpen: false,
      coachModelId: '',
      coachEffort: 'medium',
      coachApprovalPolicy: 'never',
      coachThreadId: '',
      coachPersistThread: true,
      coachCollaborationMode: '',

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

      setCoachPanelWidthPx: (widthPx: number) =>
        set({
          coachPanelWidthPx: Math.min(960, Math.max(320, Math.round(widthPx))),
        }),
      setCoachPanelOpen: (coachPanelOpen: boolean) => set({ coachPanelOpen }),

      setCoachModelId: (coachModelId: string) => set({ coachModelId }),
      setCoachEffort: (coachEffort: string) => set({ coachEffort }),
      setCoachApprovalPolicy: (coachApprovalPolicy: string) => set({ coachApprovalPolicy }),
      setCoachThreadId: (coachThreadId: string) => set({ coachThreadId }),
      setCoachPersistThread: (coachPersistThread: boolean) => set({ coachPersistThread }),
      setCoachCollaborationMode: (coachCollaborationMode: string) =>
        set({ coachCollaborationMode }),
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
