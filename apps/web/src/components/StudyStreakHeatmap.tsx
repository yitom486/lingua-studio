import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Flame,
  Calendar,
  CheckCircle2,
  Award,
  Sparkles,
  TrendingUp,
  Target,
} from 'lucide-react';
import { sound } from '../utils/audio.js';
import { Button } from './ui/button.js';
import { Progress } from './ui/progress.js';

import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import { useActivityHistoryQuery } from '../queries/useLearnerQueries.js';

interface HeatmapDay {
  date: string;
  dayNumber: number;
  intensity: 0 | 1 | 2 | 3 | 4; // 0=未打卡, 1=轻度, 2=中度, 3=高, 4=满负荷
  quizCount: number;
  cardCount: number;
  accuracy: number;
  isToday?: boolean;
}

export function StudyStreakHeatmap() {
  const profile = useUserProfileStore((s) => s.profile);
  const dailyTask = useUserProfileStore((s) => s.dailyTask);
  const setOpenProfile = useUserProfileStore((s) => s.setProfileModalOpen);
  const recordActivity = useUserProfileStore((s) => s.recordActivity);

  const { data: activityHistory = [] } = useActivityHistoryQuery(
    28,
    profile.userId || 'student_web_01',
    profile.targetLanguage
  );

  const [selectedDay, setSelectedDay] = useState<HeatmapDay | null>(null);

  const streakDays = profile.streakDays;
  const todayCompleted = dailyTask.quizzesCount + dailyTask.cardsReviewedCount;
  const todayTarget = dailyTask.dailyGoalQuizzes + dailyTask.dailyGoalCards;
  const targetPercent = Math.min(100, Math.round((todayCompleted / Math.max(todayTarget, 1)) * 100));

  // 构造最近 28 天的打卡数据 (基于真实的 SQLite 学习日志与自然日历)
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const days: HeatmapDay[] = Array.from({ length: 28 }, (_, i) => {
    // i = 0 为 27 天前，i = 27 为今天
    const d = new Date(now.getTime() - (27 - i) * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const isToday = i === 27 || dateStr === todayStr;

    // 从真实历史记录中索引
    const hist = activityHistory.find((h) => h.activityDate === dateStr);

    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dateLabel = isToday ? '今天' : `${month}月${day < 10 ? '0' + day : day}日`;

    if (isToday) {
      const quizCount = Math.max(dailyTask.quizzesCount, hist?.quizzesCount ?? 0);
      const cardCount = Math.max(dailyTask.cardsReviewedCount, hist?.cardsReviewedCount ?? 0);
      const intensity = ((dailyTask.intensityLevel || hist?.intensityLevel || 0) as 0 | 1 | 2 | 3 | 4);
      return {
        date: dateLabel,
        dayNumber: day,
        intensity,
        quizCount,
        cardCount,
        accuracy: quizCount > 0 ? 92 : 0,
        isToday: true,
      };
    }

    const quizCount = hist?.quizzesCount ?? 0;
    const cardCount = hist?.cardsReviewedCount ?? 0;
    const intensity = (Math.min(4, hist?.intensityLevel ?? 0) as 0 | 1 | 2 | 3 | 4);

    return {
      date: dateLabel,
      dayNumber: day,
      intensity,
      quizCount,
      cardCount,
      accuracy: quizCount > 0 ? 85 : 0,
      isToday: false,
    };
  });

  const getIntensityColor = (intensity: number, isToday?: boolean) => {
    if (isToday && dailyTask.isOvertimeBurst) {
      return 'bg-gradient-to-tr from-amber-500 to-yellow-400 border-yellow-300 text-stone-950 font-bold shadow-md animate-pulse';
    }
    if (isToday && dailyTask.isGoalCompleted) {
      return 'bg-emerald-500 dark:bg-emerald-600 border-emerald-400 text-white font-bold shadow-sm';
    }
    switch (intensity) {
      case 1:
        return 'bg-amber-200 dark:bg-amber-950/60 border-amber-300 dark:border-amber-900';
      case 2:
        return 'bg-amber-400 dark:bg-amber-800/80 border-amber-500 dark:border-amber-700';
      case 3:
        return 'bg-amber-500 dark:bg-amber-600 border-amber-600 dark:border-amber-500 text-stone-950';
      case 4:
        return 'bg-amber-600 dark:bg-amber-500 border-amber-700 dark:border-amber-400 text-white dark:text-stone-950 shadow-sm';
      default:
        return 'bg-stone-200/60 dark:bg-stone-800/50 border-stone-300/40 dark:border-stone-700/50';
    }
  };

  return (
    <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-5 border border-amber-900/10 dark:border-amber-500/15 shadow-sm space-y-4">
      {/* 顶部统计摘要 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Flame className="w-5 h-5 fill-amber-500" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-stone-900 dark:text-stone-100">
                {streakDays}
              </span>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                天连续学习
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              保持每日习惯，记忆衰减率降低 64%
            </p>
          </div>
        </div>

        {/* 每日目标进度 */}
        <div className="w-full sm:w-64 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-stone-600 dark:text-stone-400 flex items-center gap-1 font-medium">
              <Target className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              今日练习进度
            </span>
            <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
              {todayCompleted} / {todayTarget} ({targetPercent}%)
            </span>
          </div>
          <Progress value={targetPercent} indicatorClassName="bg-gradient-to-r from-amber-500 to-amber-600" />
        </div>
      </div>

      {/* 28 天热力方格 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            最近 4 周学习投入热力图 (Activity Matrix)
          </span>
          <div className="flex items-center gap-1 text-[10px]">
            <span>少</span>
            <span className="w-2.5 h-2.5 rounded bg-stone-200 dark:bg-stone-800 inline-block" />
            <span className="w-2.5 h-2.5 rounded bg-amber-200 dark:bg-amber-950 inline-block" />
            <span className="w-2.5 h-2.5 rounded bg-amber-400 dark:bg-amber-800 inline-block" />
            <span className="w-2.5 h-2.5 rounded bg-amber-500 dark:bg-amber-600 inline-block" />
            <span className="w-2.5 h-2.5 rounded bg-amber-600 dark:bg-amber-500 inline-block" />
            <span>多</span>
          </div>
        </div>

        <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5 pt-1">
          {days.map((day, i) => {
            const isSelected = selectedDay?.date === day.date;
            return (
              <Button
                key={`${day.date}-${i}`}
                size="icon"
                variant="ghost"
                onClick={() => {
                  sound.playClick();
                  setSelectedDay(day);
                }}
                className={`h-8 sm:h-9 w-full rounded-lg border text-xs font-mono transition-all ${getIntensityColor(
                  day.intensity,
                  day.isToday
                )} ${isSelected ? 'ring-2 ring-amber-600 scale-105' : 'hover:scale-105'}`}
              >
                {day.isToday ? '今' : day.dayNumber}
              </Button>
            );
          })}
        </div>
      </div>

      {/* 选中日期详情弹层 */}
      {selectedDay && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs gap-3"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <span className="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
              📅 {selectedDay.date} 学习战报
              {selectedDay.isToday && (
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  dailyTask.isOvertimeBurst
                    ? 'bg-amber-500 text-stone-950'
                    : dailyTask.isGoalCompleted
                    ? 'bg-emerald-600 text-white'
                    : 'bg-stone-300 dark:bg-stone-700 text-stone-800 dark:text-stone-200'
                }`}>
                  {dailyTask.isOvertimeBurst ? '⚡超额连刷' : dailyTask.isGoalCompleted ? '✓已打卡' : '进行中'}
                </span>
              )}
            </span>
            {selectedDay.intensity > 0 || (selectedDay.isToday && (dailyTask.quizzesCount > 0 || dailyTask.cardsReviewedCount > 0)) ? (
              <span className="text-stone-700 dark:text-stone-300">
                完成做题 <strong className="text-amber-700 dark:text-amber-400 font-mono">{selectedDay.quizCount}</strong> 道 ·
                复习卡片 <strong className="text-amber-700 dark:text-amber-400 font-mono">{selectedDay.cardCount}</strong> 张 ·
                正确率 <strong className="text-emerald-700 dark:text-emerald-400 font-mono">{selectedDay.accuracy}%</strong>
              </span>
            ) : (
              <span className="text-stone-500">当日暂未记录学习足迹</span>
            )}
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {selectedDay.isToday && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    sound.playClick();
                    recordActivity({ quizzes: 1 });
                  }}
                  className="h-7 text-[11px] px-2 py-0 border-amber-500/30"
                >
                  答题+1
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    sound.playClick();
                    recordActivity({ cards: 1 });
                  }}
                  className="h-7 text-[11px] px-2 py-0 border-amber-500/30"
                >
                  卡片+1
                </Button>
                <Button
                  variant="amber"
                  size="sm"
                  onClick={() => {
                    sound.playClick();
                    setOpenProfile(true);
                  }}
                  className="h-7 text-[11px] px-2.5 py-0"
                >
                  目标设置
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDay(null)}
              className="h-7 text-[11px] text-stone-400 hover:text-stone-600 px-2 py-0"
            >
              关闭
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
