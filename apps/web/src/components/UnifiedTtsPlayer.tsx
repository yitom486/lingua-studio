import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Repeat,
  ChevronLeft,
  ChevronRight,
  Mic,
  Sparkles,
  Gauge,
} from 'lucide-react';
import { useTts } from '../hooks/useTts.js';
import { sound, type SupportedLanguage, type TtsGender } from '../utils/audio.js';

export interface UnifiedTtsPlayerProps {
  /** 需要朗读的文本 */
  text: string;
  /** 目标语种 */
  lang?: SupportedLanguage;
  /** 显示形态: 'button' (独立播放按钮) | 'inline' (紧凑微标) | 'workbench' (全功能工作台控制条) */
  variant?: 'button' | 'inline' | 'workbench';
  /** 是否处于影子跟读环节 */
  shadowStep?: 'IDLE' | 'LISTENING' | 'SHADOWING';
  /** 是否开启循环朗读 */
  isLooping?: boolean;
  onToggleLoop?: () => void;
  /** 上一句 / 下一句回调 */
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** 播放生命周期钩子 */
  onPlayStart?: () => void;
  onPlayEnd?: () => void;
  className?: string;
  /** 紧凑/按钮形态下的附带文案 */
  label?: string;
}

export const UnifiedTtsPlayer: React.FC<UnifiedTtsPlayerProps> = ({
  text,
  lang = 'JA',
  variant = 'button',
  shadowStep,
  isLooping = false,
  onToggleLoop,
  onPrev,
  onNext,
  hasPrev = true,
  hasNext = true,
  onPlayStart,
  onPlayEnd,
  className = '',
  label,
}) => {
  const { isSpeaking, currentText, gender, rate, speak, stop, setGender, setRate } = useTts();

  // 当前实例是否正在发音
  const isCurrentPlaying = isSpeaking && currentText === text;

  const handleTogglePlay = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    sound.playClick();

    if (isCurrentPlaying) {
      stop();
    } else {
      onPlayStart?.();
      await speak(text, {
        lang,
        gender,
        rate,
        onStart: () => onPlayStart?.(),
        onEnd: () => onPlayEnd?.(),
      });
    }
  };

  // ---------------------------------------------------------------------------
  // 1. 微型行内图标 (inline)
  // ---------------------------------------------------------------------------
  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={handleTogglePlay}
        className={`inline-flex items-center justify-center p-1 rounded-md text-amber-700 dark:text-amber-400 hover:bg-amber-500/15 transition-all cursor-pointer ${className}`}
        title={isCurrentPlaying ? '停止发音' : `标准发音 (${lang} · ${gender === 'FEMALE' ? '女声' : '男声'})`}
      >
        {isCurrentPlaying ? (
          <VolumeX className="w-3.5 h-3.5 animate-pulse text-amber-600" />
        ) : (
          <Volume2 className="w-3.5 h-3.5 hover:scale-110 transition-transform" />
        )}
      </button>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. 独立按键模式 (button) - 适用于卡片、解析面板、做题选项
  // ---------------------------------------------------------------------------
  if (variant === 'button') {
    return (
      <motion.button
        type="button"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleTogglePlay}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-xs ${
          isCurrentPlaying
            ? 'bg-amber-500 text-stone-950 border-amber-600 shadow-amber-500/20 shadow-md'
            : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-amber-500/50 hover:bg-amber-500/10'
        } ${className}`}
        title={`朗读 (${lang} · ${gender === 'FEMALE' ? '自然女声' : '自然男声'} · ${rate}x)`}
      >
        {isCurrentPlaying ? (
          <>
            <VolumeX className="w-4 h-4 animate-pulse" />
            <span>{label || '暂停'}</span>
            {/* 微型声波柱条 */}
            <span className="flex items-center gap-0.5 ml-1">
              <span className="w-1 h-3 bg-stone-950 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1 h-4 bg-stone-950 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1 h-2 bg-stone-950 rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
          </>
        ) : (
          <>
            <Volume2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>{label || '标准发音'}</span>
            <span className="text-[10px] opacity-60 font-mono">
              {gender === 'FEMALE' ? '女' : '男'}
            </span>
          </>
        )}
      </motion.button>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. 全功能工作台控制条 (workbench) - 听力精听与影子跟读工作台专用
  // ---------------------------------------------------------------------------
  return (
    <div className={`space-y-3 ${className}`}>
      {/* 动态均衡器声波可视化 */}
      <div className="flex items-center justify-center gap-1.5 h-8 py-1">
        {[14, 26, 18, 30, 16, 22, 28, 15, 24, 12, 27, 17, 32, 19, 14].map((baseH, i) => (
          <motion.div
            key={i}
            animate={{
              height: isCurrentPlaying ? [baseH * 0.35, baseH * 1.25, baseH * 0.5] : 4,
              backgroundColor: isCurrentPlaying ? '#d97706' : '#d6d3d1',
            }}
            transition={{
              repeat: Infinity,
              duration: 0.45 + (i % 5) * 0.12,
              ease: 'easeInOut',
            }}
            className="w-1.5 rounded-full dark:bg-stone-700 transition-colors"
          />
        ))}
      </div>

      {/* 控制台操作排 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-stone-200/80 dark:border-stone-800">
        {/* 左侧：循环播放与语速档位 */}
        <div className="flex items-center gap-2">
          {onToggleLoop && (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onToggleLoop();
              }}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                isLooping
                  ? 'border-amber-500 bg-amber-500/20 text-amber-900 dark:text-amber-200 font-bold shadow-xs'
                  : 'border-stone-200 dark:border-stone-800 text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>{isLooping ? '循环跟读: 开' : '单次播放'}</span>
            </button>
          )}

          {/* 语速档位切换 (0.75x, 1x, 1.25x) */}
          <div className="flex items-center bg-stone-200/60 dark:bg-stone-900 p-0.5 rounded-xl border border-stone-300/40 dark:border-stone-800 text-xs">
            {[0.75, 1.0, 1.25].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => {
                  sound.playClick();
                  setRate(spd);
                }}
                className={`px-2 py-1 rounded-lg font-mono font-medium transition-all ${
                  Math.abs(rate - spd) < 0.05
                    ? 'bg-amber-600 text-white shadow-xs font-bold'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* 中间：上一句、主播放大按钮、下一句 */}
        <div className="flex items-center gap-3">
          {onPrev && (
            <button
              type="button"
              disabled={!hasPrev}
              onClick={() => {
                sound.playClick();
                stop();
                onPrev();
              }}
              className="p-2.5 rounded-2xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="上一句"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          <motion.button
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={handleTogglePlay}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold shadow-md transition-all cursor-pointer ${
              isCurrentPlaying
                ? 'bg-amber-600 text-white shadow-amber-600/30'
                : 'bg-amber-500 text-stone-950 hover:bg-amber-400 shadow-amber-500/25'
            }`}
            title={isCurrentPlaying ? '暂停' : '开始发音'}
          >
            {isCurrentPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-0.5" />
            )}
          </motion.button>

          {onNext && (
            <button
              type="button"
              disabled={!hasNext}
              onClick={() => {
                sound.playClick();
                stop();
                onNext();
              }}
              className="p-2.5 rounded-2xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="下一句"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 右侧：性别快速切换与语种指示 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              const nextGender: TtsGender = gender === 'FEMALE' ? 'MALE' : 'FEMALE';
              setGender(nextGender);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-200/60 dark:bg-stone-900 border border-stone-300/40 dark:border-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-amber-500/15 transition-all cursor-pointer"
            title="点击切换男女声"
          >
            <span>{gender === 'FEMALE' ? '👩 女声' : '👨 男声'}</span>
          </button>

          <span className="px-2 py-1 rounded-lg bg-stone-100 dark:bg-stone-800/80 border border-stone-200/50 dark:border-stone-700/50 text-[11px] font-mono text-stone-500 dark:text-stone-400">
            {lang === 'EN' ? '🇬🇧 英语' : lang === 'KO' ? '🇰🇷 韩语' : '🇯🇵 日语'}
          </span>
        </div>
      </div>
    </div>
  );
};
