import { create } from 'zustand';

/**
 * 语法讲义弹窗态（独立小 store：讲义可从计划/做题/题库任何入口弹出，不占导航 Tab）。
 * openSkill 为 null 时打开为列表模式（NEED_LESSON 指路用）。
 */
interface LessonDialogState {
  open: boolean;
  openSkill: string | null;
  openLesson: (skillId?: string | null) => void;
  closeLesson: () => void;
}

export const useLessonStore = create<LessonDialogState>((set) => ({
  open: false,
  openSkill: null,
  openLesson: (skillId = null) => set({ open: true, openSkill: skillId }),
  closeLesson: () => set({ open: false, openSkill: null }),
}));
