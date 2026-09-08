import React from 'react';
import { Footprints, Lock } from 'lucide-react';
import { sound } from '../utils/audio.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { courseStageName, useCourseRouteQuery } from '../queries/useLearnerQueries.js';
import { Button } from './ui/button.js';
import { Progress } from './ui/progress.js';

/**
 * 路线横幅（大阶段展示 + 下一步）：当前阶段 · 下一步单元及进度 · 掌握计数。
 * 数据来自课程路线（长期，不随每日重置）；失败/空时静默隐藏，不挡计划。
 * 挂载于今日学习页顶部（TodayPlanWorkbench），不占导航。
 */
export function CourseRouteBanner() {
  const { data: route } = useCourseRouteQuery();
  const setActiveTab = useStudySessionStore((s) => s.setActiveTab);
  if (!route || route.units.length === 0) return null;
  const nextUp = route.units.find((u) => u.unit.id === route.nextUpId) ?? null;
  const mastered = route.units.filter((u) => u.status === 'mastered').length;
  const stage = nextUp ? nextUp.unit.stage : (route.units[route.units.length - 1]?.unit.stage ?? 0);
  const goNext = () => {
    if (!nextUp) return;
    sound.playClick();
    const tab = nextUp.unit.activity.navigateTo;
    setActiveTab(tab as Parameters<typeof setActiveTab>[0]);
  };
  return (
    <div className="rounded-2xl border border-emerald-900/10 dark:border-emerald-500/15 bg-[#f6faf7] dark:bg-[#151a16] p-4 shadow-sm space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shrink-0">
            <Footprints className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              当前：{courseStageName(stage)} · 已掌握 {mastered}/{route.units.length} 单元
            </p>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
              {nextUp ? `下一步：${nextUp.unit.title}` : '本轨道路线已走完，保持复习即可'}
            </h3>
            {nextUp && (
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                {nextUp.unit.summary}（{nextUp.progress}）
              </p>
            )}
          </div>
        </div>
        {nextUp && (
          <Button size="sm" onClick={goNext} className="gap-1 shrink-0">
            去学 →
          </Button>
        )}
      </div>
      <Progress value={Math.round((mastered / Math.max(route.units.length, 1)) * 100)} className="h-1.5" />
      {route.units.some((u) => u.status === 'locked') && (
        <p className="text-[10px] text-stone-400 flex items-center gap-1">
          <Lock className="w-3 h-3" />
          后续单元按前置自动解锁；已掌握永不收回
        </p>
      )}
    </div>
  );
}
