import React from 'react';
import { motion } from 'framer-motion';
import {
  GraduationCap,
  Command,
  Flame,
  Moon,
  Sun,
} from 'lucide-react';
import { NumberTicker } from './magicui/index.js';
import { VoiceSettingsPopover } from './VoiceSettingsPopover.js';
import { sound } from '../utils/audio.js';
import { usePreferencesStore } from '../stores/usePreferencesStore.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';

interface AppHeaderProps {
  gateway: {
    isConnected: boolean;
    latencyMs?: number | null;
  };
}

export function AppHeader({ gateway }: AppHeaderProps) {
  const theme = usePreferencesStore((s) => s.theme);
  const toggleTheme = usePreferencesStore((s) => s.toggleTheme);
  const setIsCommandOpen = useStudySessionStore((s) => s.setIsCommandOpen);

  return (
    <header className="border-b border-stone-200/80 dark:border-stone-800/80 bg-white/85 dark:bg-[#1a1917]/85 backdrop-blur-md sticky top-0 z-40 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => sound.playClick()}
            className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 text-stone-950 font-bold flex items-center justify-center shadow-sm cursor-pointer"
          >
            <GraduationCap className="w-5 h-5 text-stone-950" />
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-stone-900 dark:text-stone-100 tracking-tight font-serif">
                Study Studio
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                多语种自适应架构 · 日英双通
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">自适应外语自学与靶向攻坚工作台</p>
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

          {/* TTS 音色切换浮动面板 (一男一女与小外挂配置) */}
          <VoiceSettingsPopover currentLanguage="JA" />

          {/* 快捷指令按钮 (Cmd+K) */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsCommandOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900/60 hover:border-amber-500/40 text-stone-600 dark:text-stone-300 text-xs font-medium transition-all"
          >
            <Command className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="hidden sm:inline">快捷指令</span>
            <kbd className="text-[10px] font-mono px-1 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-500">
              ⌘K
            </kbd>
          </motion.button>

          {/* 连续打卡天数指示徽章 */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs font-semibold">
            <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
            <span>连续打卡 <NumberTicker value={12} className="inline-block font-mono font-bold" /> 天</span>
          </div>

          <div className="h-5 w-px bg-stone-200 dark:bg-stone-800 hidden sm:block" />

          {/* 明暗模式切换 */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={toggleTheme}
            aria-label="切换明暗主题"
            className="p-2.5 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#211f1d] hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 shadow-2xs transition-all cursor-pointer"
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
          </motion.button>
        </div>
      </div>
    </header>
  );
}
