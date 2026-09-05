/**
 * 侧栏导航与资料 AST 静态配置。
 * 运行时 badge / 薄弱项文案由 AppSidebar 注入，勿在 TSX 内再写死菜单树。
 */
import type { NavigationTab } from '../stores/useStudySessionStore.js';
import type { TrackLanguage } from '../learning/learning-shell.js';

/** 角标：静态文案，或由运行时计数/进度填充 */
export type SidebarBadgeSpec =
  | { kind: 'static'; value: string }
  | { kind: 'quizProgress' }
  | { kind: 'cardCount' }
  | { kind: 'mistakeCount' }
  | { kind: 'planProgress' };

/** 节点标题：静态，或拼接薄弱项名 */
export type SidebarLabelSpec =
  | { kind: 'static'; value: string }
  | { kind: 'weakness'; prefix: string };

export type SidebarIconKey =
  | 'Zap'
  | 'Layers'
  | 'BookOpen'
  | 'Headphones'
  | 'Mic'
  | 'AlertTriangle'
  | 'TrendingUp'
  | 'Newspaper'
  | 'PenLine'
  | 'FolderTree'
  | 'Target'
  | 'Library'
  | 'User'
  | 'Flame'
  | 'Sparkles'
  | 'CalendarCheck'
  | 'ClipboardList';

export interface SidebarNavItemDef {
  id: NavigationTab;
  label: string;
  icon: SidebarIconKey;
  badge?: SidebarBadgeSpec | undefined;
  /** 限定可见轨道；缺省时全轨道通用 */
  tracks?: TrackLanguage[] | undefined;
}

export interface SidebarNavGroupDef {
  id: string;
  label: string;
  /** 默认是否展开 */
  defaultOpen: boolean;
  items: SidebarNavItemDef[];
}

export interface SidebarAstNodeDef {
  id: string;
  label: SidebarLabelSpec;
  icon: SidebarIconKey;
  tab?: NavigationTab | undefined;
  meta?: SidebarBadgeSpec | undefined;
  defaultOpen?: boolean | undefined;
  children?: SidebarAstNodeDef[] | undefined;
  /** 限定可见轨道；缺省时全轨道通用 */
  tracks?: TrackLanguage[] | undefined;
}

/** 资料 AST 区块标题与默认展开 */
export const SIDEBAR_AST_SECTION = {
  id: 'ast',
  label: '资料 AST',
  defaultOpen: true,
} as const;

/** 分组功能导航（练习 / 记忆 / 听说） */
export const SIDEBAR_NAV_GROUPS: SidebarNavGroupDef[] = [
  {
    id: 'practice',
    label: '练习闭环',
    defaultOpen: true,
    items: [
      { id: 'TODAY', label: '今日学习', icon: 'CalendarCheck', badge: { kind: 'planProgress' } },
      { id: 'PRACTICE_PLAN', label: '练习计划', icon: 'ClipboardList', badge: { kind: 'static', value: '自定义' } },
      { id: 'QUIZ', label: '自适应做题', icon: 'Zap', badge: { kind: 'quizProgress' } },
      { id: 'READING', label: '阅读理解', icon: 'Newspaper', badge: { kind: 'static', value: '双栏' } },
      { id: 'WRITING', label: '写作翻译', icon: 'PenLine', badge: { kind: 'static', value: 'AI' } },
      {
        id: 'MISTAKES',
        label: '错题攻坚',
        icon: 'AlertTriangle',
        badge: { kind: 'mistakeCount' },
      },
    ],
  },
  {
    id: 'memory',
    label: '课程与记忆',
    defaultOpen: true,
    items: [
      { id: 'KANA', label: '五十音工作室', icon: 'Sparkles', badge: { kind: 'static', value: '假名' }, tracks: ['ja'] },
      { id: 'HANGUL', label: '谚文工作室', icon: 'Sparkles', badge: { kind: 'static', value: '谚文' }, tracks: ['ko'] },
      { id: 'CARDS', label: 'FSRS 闪卡', icon: 'Layers', badge: { kind: 'cardCount' } },
      { id: 'TEXTBOOK', label: '教材精读', icon: 'BookOpen', badge: { kind: 'static', value: 'AST' }, tracks: ['ja'] },
    ],
  },
  {
    id: 'listen',
    label: '听说专项',
    defaultOpen: true,
    items: [
      { id: 'SHADOWING', label: '听力跟读', icon: 'Headphones', badge: { kind: 'static', value: '原声' }, tracks: ['ja'] },
      { id: 'PITCH', label: '声调纠音', icon: 'Mic', badge: { kind: 'static', value: 'AI' }, tracks: ['ja'] },
    ],
  },
];

/** 用户资料区下方的 AST 树（学情 / 课程资产） */
export const SIDEBAR_AST_TREE: SidebarAstNodeDef[] = [
  {
    id: 'profile',
    label: { kind: 'static', value: '学情画像' },
    icon: 'FolderTree',
    defaultOpen: true,
    children: [
      {
        id: 'today',
        label: { kind: 'static', value: '今日学习计划' },
        icon: 'CalendarCheck',
        tab: 'TODAY',
        meta: { kind: 'planProgress' },
      },
      {
        id: 'radar',
        label: { kind: 'static', value: '能力雷达总览' },
        icon: 'TrendingUp',
        tab: 'RADAR',
        meta: { kind: 'static', value: '多维' },
      },
      {
        id: 'weak',
        label: { kind: 'weakness', prefix: '薄弱项' },
        icon: 'Target',
        tab: 'QUIZ',
        meta: { kind: 'static', value: '靶向' },
      },
      {
        id: 'due',
        label: { kind: 'static', value: '今日待复习卡片' },
        icon: 'Layers',
        tab: 'CARDS',
        meta: { kind: 'cardCount' },
      },
      {
        id: 'mistakes',
        label: { kind: 'static', value: '未攻克错题' },
        icon: 'AlertTriangle',
        tab: 'MISTAKES',
        meta: { kind: 'mistakeCount' },
      },
    ],
  },
  {
    id: 'curriculum',
    label: { kind: 'static', value: '课程资产' },
    icon: 'Library',
    defaultOpen: true,
    children: [
      {
        id: 'tb',
        label: { kind: 'static', value: '教材知识树' },
        icon: 'BookOpen',
        tab: 'TEXTBOOK',
        meta: { kind: 'static', value: '标日' },
        tracks: ['ja'],
      },
      {
        id: 'read',
        label: { kind: 'static', value: '阅读套题库' },
        icon: 'Newspaper',
        tab: 'READING',
        meta: { kind: 'static', value: 'AI/新闻' },
      },
      {
        id: 'write',
        label: { kind: 'static', value: '写作题干池' },
        icon: 'PenLine',
        tab: 'WRITING',
      },
    ],
  },
];

/** 侧栏资料区仅作缺省文案兜底；运行时姓名/连胜/目标来自 useUserProfileStore，角标来自 Query */
export const SIDEBAR_PROFILE_DEMO = {
  displayName: '学习者',
  levelBadge: 'N5',
  streakDays: 0,
  todayGoalPercent: 0,
  todayGoalLabel: '今日目标',
  defaultWeaknessLabel: '待测验',
} as const;

export interface SidebarRuntimeCounts {
  quizProgress?: string | undefined;
  cardCount?: number | undefined;
  unresolvedMistakeCount?: number | undefined;
  planProgress?: string | undefined;
  topWeaknessLabel: string;
}

export function resolveSidebarBadge(
  spec: SidebarBadgeSpec | undefined,
  runtime: SidebarRuntimeCounts
): string | undefined {
  if (!spec) return undefined;
  switch (spec.kind) {
    case 'static':
      return spec.value;
    case 'quizProgress':
      return runtime.quizProgress;
    case 'cardCount':
      return runtime.cardCount !== undefined ? String(runtime.cardCount) : undefined;
    case 'mistakeCount':
      return runtime.unresolvedMistakeCount !== undefined
        ? String(runtime.unresolvedMistakeCount)
        : undefined;
    case 'planProgress':
      return runtime.planProgress;
    default:
      return undefined;
  }
}

export function resolveSidebarLabel(
  spec: SidebarLabelSpec,
  runtime: SidebarRuntimeCounts
): string {
  if (spec.kind === 'static') return spec.value;
  return `${spec.prefix} · ${runtime.topWeaknessLabel}`;
}

/** 由配置生成折叠区初始 open map */
export function buildSidebarOpenState(): Record<string, boolean> {
  const state: Record<string, boolean> = {
    [SIDEBAR_AST_SECTION.id]: SIDEBAR_AST_SECTION.defaultOpen,
  };
  for (const g of SIDEBAR_NAV_GROUPS) {
    state[g.id] = g.defaultOpen;
  }
  return state;
}

export function buildAstOpenState(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const node of SIDEBAR_AST_TREE) {
    state[node.id] = node.defaultOpen !== false;
  }
  return state;
}
