import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Volume2,
  Wifi,
  WifiOff,
  User,
  Play,
  Check,
  ChevronRight,
  ExternalLink,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js';
import { Button, buttonVariants } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { Slider } from './ui/slider.js';
import { sound, speechStudio, type TtsGender } from '../utils/audio.js';
import { useTtsStore } from '../stores/useTtsStore.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';

interface SystemSettingsPopoverProps {
  gateway: {
    isConnected: boolean;
    latencyMs?: number | null;
  };
}

export function SystemSettingsPopover({ gateway }: SystemSettingsPopoverProps) {
  const [open, setOpen] = useState(false);

  // TTS 状态
  const gender = useTtsStore((s) => s.gender);
  const rate = useTtsStore((s) => s.rate);
  const setGender = useTtsStore((s) => s.setGender);
  const setRate = useTtsStore((s) => s.setRate);
  const speak = useTtsStore((s) => s.speak);

  // 学情与画像
  const profile = useUserProfileStore((s) => s.profile);
  const dailyTask = useUserProfileStore((s) => s.dailyTask);
  const setProfileModalOpen = useUserProfileStore((s) => s.setProfileModalOpen);

  const handleGenderChange = (newGender: TtsGender) => {
    sound.playClick();
    setGender(newGender);
    toast.success(newGender === 'FEMALE' ? '已切换至：👩 女声导师音色' : '已切换至：👨 男声助教音色');
  };

  const handlePreview = () => {
    sound.playClick();
    const previewText =
      gender === 'FEMALE'
        ? 'こんにちは！私は日本語チューターの七海です。今日も楽しく学びましょう。'
        : 'こんにちは！私は日本語アシスタントの圭太です。一緒に頑張りましょう。';
    speak(previewText, { lang: 'JA', gender, rate });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={() => sound.playClick()}
        className={buttonVariants({
          variant: 'outline',
          size: 'sm',
          className: 'gap-1.5 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-800 hover:border-amber-500/40 cursor-pointer h-8 sm:h-9 px-2.5 sm:px-3 text-xs',
        })}
        title="系统与语音设置"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
        <span className="hidden md:inline font-medium">设置</span>
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            gateway.isConnected ? 'bg-emerald-500' : 'bg-amber-400'
          }`}
        />
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 p-0 border border-stone-200/90 dark:border-stone-800/90 shadow-xl rounded-2xl bg-white/95 dark:bg-[#1a1917]/95 backdrop-blur-md overflow-hidden z-50"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-amber-500" />
            <h4 className="font-semibold text-xs text-stone-800 dark:text-stone-200">
              系统控制中心
            </h4>
          </div>
          {/* 网关轻量状态指示 */}
          <div className="flex items-center gap-1.5 text-[11px] font-medium">
            {gateway.isConnected ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Wifi className="w-3 h-3" />
                <span>已联通{gateway.latencyMs ? ` (${gateway.latencyMs}ms)` : ''}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <WifiOff className="w-3 h-3" />
                <span>离线模式</span>
              </span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {/* 1. TTS 语音设置 */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-300">
                <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                <span>发音音色与语速</span>
              </div>
              <button
                type="button"
                onClick={handlePreview}
                className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <Play className="w-2.5 h-2.5 fill-current" />
                试听
              </button>
            </div>

            {/* 音色男女声选择 */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleGenderChange('FEMALE')}
                className={`py-1.5 px-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  gender === 'FEMALE'
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-900 dark:text-amber-200 font-semibold'
                    : 'border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-600 dark:text-stone-400'
                }`}
              >
                <span className="truncate">👩 女声 (七海)</span>
                {gender === 'FEMALE' && <Check className="w-3 h-3 text-amber-500" />}
              </button>
              <button
                type="button"
                onClick={() => handleGenderChange('MALE')}
                className={`py-1.5 px-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  gender === 'MALE'
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-900 dark:text-amber-200 font-semibold'
                    : 'border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-600 dark:text-stone-400'
                }`}
              >
                <span className="truncate">👨 男声 (圭太)</span>
                {gender === 'MALE' && <Check className="w-3 h-3 text-amber-500" />}
              </button>
            </div>

            {/* 语速滑动条 */}
            <div className="pt-1">
              <div className="flex justify-between text-[11px] text-stone-500 dark:text-stone-400 mb-1.5">
                <span>朗读语速</span>
                <span className="font-mono font-semibold text-stone-700 dark:text-stone-300">
                  {rate.toFixed(1)}x
                </span>
              </div>
              <Slider
                value={rate}
                min={0.5}
                max={1.5}
                step={0.1}
                onValueChange={(val) => {
                  const numVal = Array.isArray(val) ? val[0] : val;
                  if (typeof numVal === 'number') {
                    setRate(Math.round(numVal * 100) / 100);
                  }
                }}
              />
            </div>
          </div>

          <div className="h-px bg-stone-100 dark:bg-stone-800/80" />

          {/* 2. 学情画像与打卡目标入口 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between font-medium text-stone-700 dark:text-stone-300">
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-500" />
                <span>学习者画像与打卡</span>
              </div>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600 dark:text-amber-400">
                {profile.studyGoal.replace('JLPT_', '')}
              </Badge>
            </div>

            <div
              onClick={() => {
                sound.playClick();
                setOpen(false);
                setProfileModalOpen(true);
              }}
              className="p-2.5 rounded-xl border border-stone-200/80 dark:border-stone-800 hover:border-amber-500/40 bg-stone-50/70 dark:bg-stone-900/50 flex items-center justify-between cursor-pointer group transition-all"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-600 text-stone-950 font-bold flex items-center justify-center text-xs shrink-0">
                  {profile.displayName.slice(0, 1) || '学'}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-stone-800 dark:text-stone-200 truncate">
                    {profile.displayName || '学员'}
                  </div>
                  <div className="text-[10px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                    <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-medium">
                      <Flame className="w-2.5 h-2.5 fill-current" />
                      {profile.streakDays} 天连续
                    </span>
                    <span>·</span>
                    <span>
                      {dailyTask.quizzesCount + dailyTask.cardsReviewedCount}/
                      {dailyTask.dailyGoalQuizzes + dailyTask.dailyGoalCards} 任务
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-stone-400 group-hover:text-amber-500 transition-colors shrink-0">
                <span>管理</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
