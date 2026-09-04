import React from 'react';
import { Flame, CheckCircle2, Zap, BookOpen, Layers } from 'lucide-react';
import { Badge } from './ui/badge.js';
import { Progress } from './ui/progress.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import { sound } from '../utils/audio.js';

export function DailyTaskProgressBar() {
  const dailyTask = useUserProfileStore((s) => s.dailyTask);
  const profile = useUserProfileStore((s) => s.profile);
  const setOpenProfile = useUserProfileStore((s) => s.setProfileModalOpen);

  const quizRatio = Math.min(
    1,
    dailyTask.quizzesCount / Math.max(dailyTask.dailyGoalQuizzes, 1)
  );
  const cardRatio = Math.min(
    1,
    dailyTask.cardsReviewedCount / Math.max(dailyTask.dailyGoalCards, 1)
  );
  const overallRatio = (quizRatio + cardRatio) / 2;

  const isCompleted = dailyTask.isGoalCompleted;
  const isBurst = dailyTask.isOvertimeBurst;

  return (
    <div
      onClick={() => {
        sound.playClick();
        setOpenProfile(true);
      }}
      title="点击配置目标或查看每日打卡进度"
      className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
        isBurst
          ? 'bg-gradient-to-r from-amber-500/15 via-yellow-500/20 to-amber-500/15 border-amber-500/40 hover:border-amber-500 text-amber-950 dark:text-amber-100 ring-1 ring-amber-500/30'
          : isCompleted
          ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50 text-emerald-950 dark:text-emerald-100'
          : 'bg-stone-100/80 dark:bg-stone-900/60 border-amber-900/10 dark:border-amber-500/15 hover:border-amber-500/40 text-stone-700 dark:text-stone-300'
      }`}
    >
      {/* 状态徽章图标 */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isBurst ? (
          <div className="flex items-center gap-1 text-amber-500 animate-pulse font-bold text-xs">
            <Zap className="w-3.5 h-3.5 fill-amber-500" />
            <span className="hidden xl:inline text-[11px]">超额连刷</span>
          </div>
        ) : isCompleted ? (
          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline text-[11px]">已打卡</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold text-xs">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden xl:inline text-[11px]">今日目标</span>
          </div>
        )}
      </div>

      {/* 题目进度微胶囊 */}
      <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
        <BookOpen className="w-3 h-3 text-stone-400 dark:text-stone-500 shrink-0" />
        <span className="font-mono font-medium">
          {dailyTask.quizzesCount}/{dailyTask.dailyGoalQuizzes}
        </span>
        <span className="text-stone-400 dark:text-stone-500 text-[10px]">题</span>
      </div>

      {/* 闪卡进度微胶囊 */}
      <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
        <Layers className="w-3 h-3 text-stone-400 dark:text-stone-500 shrink-0" />
        <span className="font-mono font-medium">
          {dailyTask.cardsReviewedCount}/{dailyTask.dailyGoalCards}
        </span>
        <span className="text-stone-400 dark:text-stone-500 text-[10px]">卡</span>
      </div>

      {/* 综合打卡进度条 */}
      <div className="w-14 sm:w-16 h-1.5 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden shrink-0">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isBurst
              ? 'bg-gradient-to-r from-amber-400 to-yellow-300'
              : isCompleted
              ? 'bg-emerald-500'
              : 'bg-amber-500'
          }`}
          style={{ width: `${Math.round(overallRatio * 100)}%` }}
        />
      </div>

      {/* 连胜天数统计 */}
      <Badge
        variant="outline"
        className={`text-[10px] px-1.5 py-0 h-4 border shrink-0 ${
          isCompleted
            ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10'
            : 'border-amber-500/20 text-amber-700 dark:text-amber-400'
        }`}
      >
        {profile.streakDays > 0 ? `连胜 ${profile.streakDays} 天` : '未打卡'}
      </Badge>
    </div>
  );
}
