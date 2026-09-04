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

interface HeatmapDay {
  date: string;
  dayNumber: number;
  intensity: 0 | 1 | 2 | 3 | 4; // 0=未打卡, 1=轻度, 2=中度, 3=高, 4=满负荷
  quizCount: number;
  cardCount: number;
  accuracy: number;
}

export function StudyStreakHeatmap() {
  const [selectedDay, setSelectedDay] = useState<HeatmapDay | null>(null);

  // 构造最近 28 天的打卡数据
  const days: HeatmapDay[] = Array.from({ length: 28 }, (_, i) => {
    const dayNum = i + 1;
    // 模拟活跃规律：最近 12 天连续打卡
    const isRecentStreak = dayNum >= 17;
    const intensity = isRecentStreak
      ? ((dayNum % 4 + 1) as 1 | 2 | 3 | 4)
      : dayNum % 3 === 0
      ? 1
      : 0;

    return {
      date: `8月${dayNum < 10 ? '0' + dayNum : dayNum}日`,
      dayNumber: dayNum,
      intensity,
      quizCount: intensity * 6 + (intensity > 0 ? 4 : 0),
      cardCount: intensity * 8 + (intensity > 0 ? 5 : 0),
      accuracy: intensity > 0 ? 82 + (dayNum % 15) : 0,
    };
  });

  const streakDays = 12;
  const todayCompleted = 18;
  const todayTarget = 25;
  const targetPercent = Math.round((todayCompleted / todayTarget) * 100);

  const getIntensityColor = (intensity: number) => {
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
          {days.map((day) => {
            const isSelected = selectedDay?.dayNumber === day.dayNumber;
            return (
              <Button
                key={day.dayNumber}
                size="icon"
                variant="ghost"
                onClick={() => {
                  sound.playClick();
                  setSelectedDay(day);
                }}
                className={`h-8 sm:h-9 w-full rounded-lg border text-xs font-mono ${getIntensityColor(
                  day.intensity
                )} ${isSelected ? 'ring-2 ring-amber-600 scale-105' : 'hover:scale-105'}`}
              >
                {day.dayNumber}
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
          className="p-3 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs gap-2"
        >
          <div className="flex items-center gap-3">
            <span className="font-bold text-amber-950 dark:text-amber-200">
              📅 {selectedDay.date} 学习战报
            </span>
            {selectedDay.intensity > 0 ? (
              <span className="text-stone-700 dark:text-stone-300">
                完成做题 <strong className="text-amber-700 dark:text-amber-400 font-mono">{selectedDay.quizCount}</strong> 道 ·
                复习卡片 <strong className="text-amber-700 dark:text-amber-400 font-mono">{selectedDay.cardCount}</strong> 张 ·
                正确率 <strong className="text-emerald-700 dark:text-emerald-400 font-mono">{selectedDay.accuracy}%</strong>
              </span>
            ) : (
              <span className="text-stone-500">当日未进行学习记录</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDay(null)}
            className="h-auto p-0 text-[11px] text-stone-400 hover:text-stone-600 self-end sm:self-auto"
          >
            关闭详情
          </Button>
        </motion.div>
      )}
    </div>
  );
}
