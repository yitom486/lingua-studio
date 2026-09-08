import React, { useState } from 'react';
import { Check, ChevronDown, Footprints, Lock, RotateCcw } from 'lucide-react';
import { sound } from '../utils/audio.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import {
  courseStageName,
  useCourseRouteQuery,
  type CourseRouteUnit,
} from '../queries/useLearnerQueries.js';
import { groupUnitsByStage } from '../utils/course-route-view.js';
import { Button } from './ui/button.js';
import { Progress } from './ui/progress.js';
import { Badge } from './ui/badge.js';

/**
 * 路线总览（大阶段展示 + 下一步 + 复习提示 + 完整解锁链）。
 * 数据来自课程路线（长期，不随每日重置）；失败/空时静默隐藏，不挡计划。
 * 挂载于今日学习页顶部（TodayPlanWorkbench），不占导航。
 */
export function CourseRouteBanner() {
  const { data: route } = useCourseRouteQuery();
  const setActiveTab = useStudySessionStore((s) => s.setActiveTab);
  const [expanded, setExpanded] = useState(false);
  if (!route || route.units.length === 0) return null;
  const nextUp = route.units.find((u) => u.unit.id === route.nextUpId) ?? null;
  const mastered = route.units.filter((u) => u.status === 'mastered').length;
  const reviewList = route.units.filter((u) => u.status === 'mastered' && u.needsReview);
  const stage = nextUp ? nextUp.unit.stage : (route.units[route.units.length - 1]?.unit.stage ?? 0);
  const goUnit = (u: CourseRouteUnit) => {
    sound.playClick();
    setActiveTab(u.unit.activity.navigateTo as Parameters<typeof setActiveTab>[0]);
  };
  const stages = expanded ? groupUnitsByStage(route.units) : [];
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
          <Button size="sm" onClick={() => goUnit(nextUp)} className="gap-1 shrink-0">
            去学 →
          </Button>
        )}
      </div>
      <Progress value={Math.round((mastered / Math.max(route.units.length, 1)) * 100)} className="h-1.5" />
      {reviewList.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/5 px-2.5 py-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-200">
            <RotateCcw className="w-3 h-3" />
            建议复习（资格保留）：
          </span>
          {reviewList.map((u) => (
            <button
              key={u.unit.id}
              type="button"
              onClick={() => goUnit(u)}
              className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-500/15 dark:text-amber-200"
              title="近期有错误，回去练两道"
            >
              {u.unit.title}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          sound.playClick();
          setExpanded((v) => !v);
        }}
        className="inline-flex items-center gap-1 text-[11px] text-stone-500 hover:text-stone-700 dark:text-stone-400"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        {expanded ? '收起完整路线' : '展开完整路线'}
      </button>
      {expanded && (
        <div className="space-y-3 pt-1">
          {stages.map((g) => (
            <div key={g.stage} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-stone-700 dark:text-stone-200">
                  {courseStageName(g.stage)}
                </p>
                <span className="font-mono text-[10px] text-stone-400">
                  {g.mastered}/{g.total}
                </span>
              </div>
              <Progress value={Math.round((g.mastered / Math.max(g.total, 1)) * 100)} className="h-1" />
              <ul className="space-y-1">
                {g.units.map((u) => (
                  <li
                    key={u.unit.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-stone-200/70 dark:border-stone-700/60 px-2.5 py-1.5"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {u.status === 'mastered' ? (
                        <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                      ) : u.status === 'available' ? (
                        <span className="w-3.5 h-3.5 shrink-0 rounded-full bg-amber-500/70" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 shrink-0 text-stone-300" />
                      )}
                      {u.status === 'available' ? (
                        <button
                          type="button"
                          onClick={() => goUnit(u)}
                          className="truncate text-xs font-semibold text-stone-800 hover:underline dark:text-stone-100"
                          title={u.unit.summary}
                        >
                          {u.unit.title}
                        </button>
                      ) : (
                        <span
                          className="truncate text-xs text-stone-500 dark:text-stone-400"
                          title={u.unit.summary}
                        >
                          {u.unit.title}
                        </span>
                      )}
                      {u.status === 'mastered' && u.needsReview && (
                        <Badge variant="amber" className="text-[10px] shrink-0">
                          需复习
                        </Badge>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-stone-400">{u.progress}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[10px] text-stone-400">
            后续单元按前置自动解锁；已掌握永不收回，近期错误只提示复习。
          </p>
        </div>
      )}
    </div>
  );
}
