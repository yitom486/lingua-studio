import React from 'react';
import { motion } from 'framer-motion';
import {
  GraduationCap,
  Command,
  Flame,
  Moon,
  Sun,
  PanelLeft,
} from 'lucide-react';
import { NumberTicker } from './magicui/index.js';
import { VoiceSettingsPopover } from './VoiceSettingsPopover.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { sound } from '../utils/audio.js';
import { usePreferencesStore } from '../stores/usePreferencesStore.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import { DailyTaskProgressBar } from './DailyTaskProgressBar.js';
import { UserProfileModal } from './UserProfileModal.js';

interface AppHeaderProps {
  gateway: {
    isConnected: boolean;
    latencyMs?: number | null;
  };
  onOpenMobileNav?: () => void;
}

export function AppHeader({ gateway, onOpenMobileNav }: AppHeaderProps) {
  const theme = usePreferencesStore((s) => s.theme);
  const toggleTheme = usePreferencesStore((s) => s.toggleTheme);
  const setIsCommandOpen = useStudySessionStore((s) => s.setIsCommandOpen);
  const profile = useUserProfileStore((s) => s.profile);
  const setOpenProfile = useUserProfileStore((s) => s.setProfileModalOpen);

  return (
    <header className="border-b border-stone-200/80 dark:border-stone-800/80 bg-white/85 dark:bg-[#1a1917]/85 backdrop-blur-md sticky top-0 z-40 transition-colors">
      <div className="px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            className="md:hidden shrink-0"
            aria-label="打开导航"
            onClick={() => {
              sound.playClick();
              onOpenMobileNav?.();
            }}
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
          <motion.div
            whileHover={{ scale: 1.05, rotate: 2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => sound.playClick()}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 text-stone-950 font-bold flex items-center justify-center shadow-sm cursor-pointer shrink-0"
          >
            <GraduationCap className="w-5 h-5 text-stone-950" />
          </motion.div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base sm:text-lg text-stone-900 dark:text-stone-100 tracking-tight font-serif truncate">
                Study Studio
              </span>
              <Badge variant="amber" className="hidden sm:inline-flex text-[11px] font-semibold border-amber-500/30">
                多语种自适应架构 · 日英双通
              </Badge>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 hidden sm:block">
              自适应外语自学与靶向攻坚工作台
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* 网关实时联通状态指示 */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium transition-colors border border-amber-900/10 dark:border-amber-500/15 bg-stone-100/70 dark:bg-stone-900/60">
            <span
              className={`w-2 h-2 rounded-full ${
                gateway.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="hidden sm:inline text-stone-600 dark:text-stone-300">
              {gateway.isConnected
                ? `网关联通${gateway.latencyMs ? ` (${gateway.latencyMs}ms)` : ''}`
                : '离线模式'}
            </span>
          </div>

          {/* TTS 音色切换浮动面板 */}
          <VoiceSettingsPopover currentLanguage="JA" />

          {/* 快捷指令按钮 (Cmd+K) */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCommandOpen(true)}
            className="gap-2"
          >
            <Command className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="hidden sm:inline">快捷指令</span>
            <kbd className="text-[10px] font-mono px-1 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-500">
              ⌘K
            </kbd>
          </Button>

          {/* 实时打卡进度与超额连刷微胶囊 */}
          <DailyTaskProgressBar />

          {/* 用户画像与目标设置入口 */}
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setOpenProfile(true);
            }}
            title="点击配置学习者画像与每日目标"
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border border-amber-900/15 dark:border-amber-500/20 bg-stone-100/80 dark:bg-stone-900/70 hover:border-amber-500/50 transition-all cursor-pointer shadow-xs"
          >
            <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-[10px] font-bold text-stone-950 shrink-0">
              {profile.displayName.slice(0, 1) || '学'}
            </div>
            <span className="font-semibold text-stone-800 dark:text-stone-200 max-w-[80px] truncate">
              {profile.displayName}
            </span>
            <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-500/30 text-amber-600 dark:text-amber-400">
              {profile.studyGoal.replace('JLPT_', '')}
            </Badge>
          </button>

          {/* 连续打卡天数指示徽章 (动态数据驱动) */}
          <Badge
            variant="amber"
            onClick={() => {
              sound.playClick();
              setOpenProfile(true);
            }}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-amber-500/25 cursor-pointer hover:border-amber-500/50 transition-all"
          >
            <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
            <span>连续打卡 <NumberTicker value={profile.streakDays} className="inline-block font-mono font-bold" /> 天</span>
          </Badge>

          <div className="h-5 w-px bg-stone-200 dark:bg-stone-800 hidden sm:block" />

          {/* 明暗模式切换 */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            aria-label="切换明暗主题"
          >
            {theme === 'light' ? (
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Moon className="w-4 h-4 text-amber-600" />
                <span className="hidden md:inline">深色</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="hidden md:inline">暖亮</span>
              </div>
            )}
          </Button>
        </div>
      </div>
      <UserProfileModal />
    </header>
  );
}
