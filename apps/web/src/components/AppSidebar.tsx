import React, { useMemo, useState } from 'react';
import {
  Zap,
  Layers,
  BookOpen,
  Headphones,
  Mic,
  AlertTriangle,
  TrendingUp,
  Newspaper,
  PenLine,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  User,
  Flame,
  FolderTree,
  Target,
  Library,
  type LucideIcon,
} from 'lucide-react';
import { NumberTicker } from './magicui/index.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { Progress } from './ui/progress.js';
import { cn } from '../lib/utils.js';
import { sound } from '../utils/audio.js';
import { usePreferencesStore } from '../stores/usePreferencesStore.js';
import { useStudySessionStore, type NavigationTab } from '../stores/useStudySessionStore.js';
import {
  SIDEBAR_AST_SECTION,
  SIDEBAR_AST_TREE,
  SIDEBAR_NAV_GROUPS,
  SIDEBAR_PROFILE_DEMO,
  buildAstOpenState,
  buildSidebarOpenState,
  resolveSidebarBadge,
  resolveSidebarLabel,
  type SidebarAstNodeDef,
  type SidebarIconKey,
  type SidebarNavItemDef,
  type SidebarRuntimeCounts,
} from '../data/sidebar-nav-data.js';

export interface AppSidebarProps {
  quizProgress?: string | undefined;
  cardCount?: number | undefined;
  unresolvedMistakeCount?: number | undefined;
  /** 薄弱项示例名，来自学情 */
  topWeaknessLabel?: string | undefined;
  mobileOpen?: boolean | undefined;
  onMobileOpenChange?: ((open: boolean) => void) | undefined;
}

const SIDEBAR_ICONS: Record<SidebarIconKey, LucideIcon> = {
  Zap,
  Layers,
  BookOpen,
  Headphones,
  Mic,
  AlertTriangle,
  TrendingUp,
  Newspaper,
  PenLine,
  FolderTree,
  Target,
  Library,
  User,
  Flame,
};

type ResolvedNavItem = {
  id: NavigationTab;
  label: string;
  icon: LucideIcon;
  badge?: string | undefined;
};

function resolveNavItem(def: SidebarNavItemDef, runtime: SidebarRuntimeCounts): ResolvedNavItem {
  return {
    id: def.id,
    label: def.label,
    icon: SIDEBAR_ICONS[def.icon],
    badge: resolveSidebarBadge(def.badge, runtime),
  };
}

function resolveAstLabel(node: SidebarAstNodeDef, runtime: SidebarRuntimeCounts): string {
  return resolveSidebarLabel(node.label, runtime);
}

function NavButton({
  item,
  active,
  collapsed,
  onSelect,
}: {
  item: ResolvedNavItem;
  active: boolean;
  collapsed: boolean;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      title={item.label}
      onClick={() => {
        sound.playClick();
        onSelect();
      }}
      className={cn(
        'w-full flex items-center gap-2.5 rounded-xl text-left text-xs font-medium transition-colors cursor-pointer',
        collapsed ? 'justify-center px-2 py-2.5' : 'px-2.5 py-2',
        active
          ? 'bg-amber-500/15 text-amber-950 dark:text-amber-200 border border-amber-500/25'
          : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-800/80 border border-transparent'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate flex-1">{item.label}</span>
          {item.badge && (
            <Badge
              variant={active ? 'amber' : 'secondary'}
              className="px-1.5 py-0 text-[10px] font-bold rounded-full pointer-events-none"
            >
              {item.badge}
            </Badge>
          )}
        </>
      )}
    </button>
  );
}

function SidebarBody({
  collapsed,
  quizProgress,
  cardCount,
  unresolvedMistakeCount,
  topWeaknessLabel,
  onNavigate,
  showDesktopCollapse,
}: {
  collapsed: boolean;
  quizProgress?: string | undefined;
  cardCount?: number | undefined;
  unresolvedMistakeCount?: number | undefined;
  topWeaknessLabel: string;
  onNavigate: (tab: NavigationTab) => void;
  showDesktopCollapse?: boolean | undefined;
}) {
  const setSidebarCollapsed = usePreferencesStore((s) => s.setSidebarCollapsed);
  const activeTab = useStudySessionStore((s) => s.activeTab);

  const [openGroups, setOpenGroups] = useState(buildSidebarOpenState);
  const [astOpen, setAstOpen] = useState(buildAstOpenState);

  const runtime = useMemo<SidebarRuntimeCounts>(
    () => ({
      quizProgress,
      cardCount,
      unresolvedMistakeCount,
      topWeaknessLabel,
    }),
    [quizProgress, cardCount, unresolvedMistakeCount, topWeaknessLabel]
  );

  const groups = useMemo(
    () =>
      SIDEBAR_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.map((item) => resolveNavItem(item, runtime)),
      })),
    [runtime]
  );

  const toggleGroup = (id: string) => {
    sound.playClick();
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const profile = SIDEBAR_PROFILE_DEMO;

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-stone-200/80 dark:border-stone-800 bg-white/90 dark:bg-[#1a1917]/95 backdrop-blur-md h-full',
        collapsed ? 'w-[4.25rem]' : 'w-[16.5rem]',
        'transition-[width] duration-200'
      )}
    >
      <div
        className={cn(
          'border-b border-stone-200/80 dark:border-stone-800',
          collapsed ? 'p-2.5' : 'p-3.5'
        )}
      >
        <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
            <User className="w-4 h-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold font-serif truncate text-stone-900 dark:text-stone-100">
                  {profile.displayName}
                </span>
                <Badge variant="amber" className="text-[10px] px-1.5 py-0">
                  {profile.levelBadge}
                </Badge>
              </div>
              <p className="text-[11px] text-stone-500 truncate flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-500 fill-amber-500" />
                连续{' '}
                <NumberTicker value={profile.streakDays} className="font-mono font-bold inline" />{' '}
                天
              </p>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-[10px] text-stone-500">
              <span>{profile.todayGoalLabel}</span>
              <span className="font-mono">{profile.todayGoalPercent}%</span>
            </div>
            <Progress value={profile.todayGoalPercent} className="h-1.5" />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        <div>
          {!collapsed && (
            <button
              type="button"
              onClick={() => toggleGroup(SIDEBAR_AST_SECTION.id)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 cursor-pointer"
            >
              {openGroups[SIDEBAR_AST_SECTION.id] ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              {SIDEBAR_AST_SECTION.label}
            </button>
          )}
          {(collapsed || openGroups[SIDEBAR_AST_SECTION.id]) &&
            SIDEBAR_AST_TREE.map((node) => {
              const NodeIcon = SIDEBAR_ICONS[node.icon];
              const expanded = astOpen[node.id] !== false;
              return (
                <div key={node.id} className="mt-1">
                  {!collapsed && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setAstOpen((p) => ({ ...p, [node.id]: !expanded }));
                      }}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-stone-500 dark:text-stone-400 hover:text-amber-800 dark:hover:text-amber-300 cursor-pointer"
                    >
                      {expanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      <NodeIcon className="w-3.5 h-3.5" />
                      <span>{resolveAstLabel(node, runtime)}</span>
                    </button>
                  )}
                  {(collapsed || expanded) &&
                    node.children?.map((child) => {
                      const ChildIcon = SIDEBAR_ICONS[child.icon];
                      const label = resolveAstLabel(child, runtime);
                      const meta = resolveSidebarBadge(child.meta, runtime);
                      const active = child.tab === activeTab;
                      if (collapsed) {
                        if (!child.tab) return null;
                        return (
                          <NavButton
                            key={child.id}
                            item={{
                              id: child.tab,
                              label,
                              icon: ChildIcon,
                              badge: meta,
                            }}
                            active={active}
                            collapsed
                            onSelect={() => child.tab && onNavigate(child.tab)}
                          />
                        );
                      }
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => {
                            sound.playClick();
                            if (child.tab) onNavigate(child.tab);
                          }}
                          className={cn(
                            'w-full flex items-center gap-2 pl-7 pr-2 py-1.5 rounded-lg text-[11px] transition-colors cursor-pointer',
                            active
                              ? 'bg-amber-500/10 text-amber-950 dark:text-amber-200 font-semibold'
                              : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800/80'
                          )}
                        >
                          <ChildIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate flex-1 text-left">{label}</span>
                          {meta && (
                            <span className="text-[10px] font-mono text-stone-400">{meta}</span>
                          )}
                        </button>
                      );
                    })}
                </div>
              );
            })}
        </div>

        <div className="h-px bg-stone-200/80 dark:bg-stone-800 mx-1" />

        {groups.map((group) => {
          const expanded = openGroups[group.id] !== false;
          return (
            <div key={group.id}>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 cursor-pointer"
                >
                  {expanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  {group.label}
                </button>
              )}
              {(collapsed || expanded) && (
                <div className="space-y-0.5 mt-0.5">
                  {group.items.map((item) => (
                    <NavButton
                      key={item.id}
                      item={item}
                      active={activeTab === item.id}
                      collapsed={collapsed}
                      onSelect={() => onNavigate(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showDesktopCollapse && (
        <div className="p-2 border-t border-stone-200/80 dark:border-stone-800">
          <Button
            variant="ghost"
            size="sm"
            className={cn('w-full', collapsed && 'px-0')}
            onClick={() => {
              sound.playClick();
              setSidebarCollapsed(!collapsed);
            }}
            aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
          >
            {collapsed ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4" />
                <span>折叠侧栏</span>
              </>
            )}
          </Button>
        </div>
      )}
    </aside>
  );
}

export function AppSidebar({
  quizProgress,
  cardCount,
  unresolvedMistakeCount,
  topWeaknessLabel = SIDEBAR_PROFILE_DEMO.defaultWeaknessLabel,
  mobileOpen = false,
  onMobileOpenChange,
}: AppSidebarProps) {
  const collapsed = usePreferencesStore((s) => s.sidebarCollapsed);

  const navigate = (tab: NavigationTab) => {
    useStudySessionStore.getState().setActiveTab(tab);
    onMobileOpenChange?.(false);
  };

  return (
    <>
      <div className="hidden md:flex h-[100dvh] sticky top-0 z-30 shrink-0">
        <SidebarBody
          collapsed={collapsed}
          quizProgress={quizProgress}
          cardCount={cardCount}
          unresolvedMistakeCount={unresolvedMistakeCount}
          topWeaknessLabel={topWeaknessLabel}
          onNavigate={navigate}
          showDesktopCollapse
        />
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            className="absolute inset-0 bg-stone-950/50 backdrop-blur-sm cursor-pointer border-0"
            aria-label="关闭菜单"
            onClick={() => onMobileOpenChange?.(false)}
          />
          <div className="relative z-10 h-full shadow-2xl">
            <SidebarBody
              collapsed={false}
              quizProgress={quizProgress}
              cardCount={cardCount}
              unresolvedMistakeCount={unresolvedMistakeCount}
              topWeaknessLabel={topWeaknessLabel}
              onNavigate={navigate}
            />
          </div>
        </div>
      )}
    </>
  );
}
