import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2,
  Settings,
  Sparkles,
  Check,
  Play,
  Plug,
  ExternalLink,
  ChevronDown,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  speechStudio,
  sound,
  type TtsGender,
  type SupportedLanguage,
} from '../utils/audio.js';

import { useTtsStore } from '../stores/useTtsStore.js';

interface VoiceSettingsPopoverProps {
  currentLanguage?: SupportedLanguage;
}

export function VoiceSettingsPopover({ currentLanguage = 'JA' }: VoiceSettingsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showPluginConfig, setShowPluginConfig] = useState(false);

  // Zustand Store 响应式持久化状态
  const gender = useTtsStore((s) => s.gender);
  const rate = useTtsStore((s) => s.rate);
  const customPluginUrl = useTtsStore((s) => s.customPluginUrl);
  const isCustomPluginEnabled = useTtsStore((s) => s.isCustomPluginEnabled);
  const setGender = useTtsStore((s) => s.setGender);
  const setRate = useTtsStore((s) => s.setRate);
  const setCustomPluginConfig = useTtsStore((s) => s.setCustomPluginConfig);
  const speak = useTtsStore((s) => s.speak);

  // 本地外挂编辑缓冲
  const [editUrl, setEditUrl] = useState(customPluginUrl);
  const [editEnabled, setEditEnabled] = useState(isCustomPluginEnabled);

  useEffect(() => {
    setEditUrl(customPluginUrl);
    setEditEnabled(isCustomPluginEnabled);
  }, [customPluginUrl, isCustomPluginEnabled]);

  const activeVoice = speechStudio.getBestVoice(currentLanguage, gender);
  const activeVoiceName = activeVoice ? activeVoice.name : '系统默认自然发音';

  const handleGenderChange = (newGender: TtsGender) => {
    sound.playClick();
    setGender(newGender);
    toast.success(newGender === 'FEMALE' ? '已切换至：👩 女声导师音色' : '已切换至：👨 男声助教音色');
  };

  const handleRateChange = (newRate: number) => {
    sound.playClick();
    setRate(newRate);
  };

  const handlePreview = () => {
    sound.playClick();
    let previewText = '';
    if (currentLanguage === 'EN') {
      previewText =
        gender === 'FEMALE'
          ? 'Hello! I am your English tutor Jenny. Let us practice English together.'
          : 'Hi there! I am your English assistant Guy. Welcome to Study Studio.';
    } else if (currentLanguage === 'KO') {
      previewText =
        gender === 'FEMALE'
          ? '안녕하세요! 한국어 학습을 함께 시작해 볼까요?'
          : '반갑습니다! 오늘도 열심히 한국어를 공부해 봅시다.';
    } else {
      previewText =
        gender === 'FEMALE'
          ? 'こんにちは！私は日本語チューターの七海です。'
          : 'こんにちは！私は日本語アシスタントの圭太です。一緒に頑張りましょう。';
    }

    speak(previewText, {
      lang: currentLanguage,
      gender,
      rate,
    });
  };

  const handleSavePlugin = () => {
    sound.playCorrect();
    setCustomPluginConfig(editUrl, editEnabled);
    toast.success(
      editEnabled
        ? '已启用本地 TTS 神经语音小外挂'
        : '已关闭小外挂，回退至原生高清音色'
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          sound.playClick();
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-900/80 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-semibold border border-stone-200/80 dark:border-stone-800 transition-colors shadow-2xs"
        title="语音音色与发音设置"
      >
        <Volume2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        <span>{gender === 'FEMALE' ? '👩 女声' : '👨 男声'}</span>
        <span className="text-[10px] text-stone-400 font-mono">({rate}x)</span>
        <ChevronDown className="w-3 h-3 text-stone-400" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* 背景遮罩点击关闭 */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* 弹出卡片 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 6 }}
              className="absolute right-0 top-full mt-2 w-80 p-4 rounded-2xl bg-[#faf9f6] dark:bg-[#1a1816] text-stone-900 dark:text-stone-100 shadow-2xl border border-amber-900/15 dark:border-amber-500/20 z-50 space-y-4 font-sans"
            >
              {/* 标题栏 */}
              <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold">语音合成与音色工作台</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 font-mono font-bold">
                  {currentLanguage}
                </span>
              </div>

              {/* 1. 一男一女音色切换 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
                  发音音色预设 (双导师方案)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleGenderChange('FEMALE')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      gender === 'FEMALE'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-stone-100 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-amber-500/40'
                    }`}
                  >
                    <span>👩 温柔女声</span>
                    {gender === 'FEMALE' && <Check className="w-3 h-3 text-white" />}
                  </button>

                  <button
                    onClick={() => handleGenderChange('MALE')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      gender === 'MALE'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-stone-100 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-amber-500/40'
                    }`}
                  >
                    <span>👨 阳光男声</span>
                    {gender === 'MALE' && <Check className="w-3 h-3 text-white" />}
                  </button>
                </div>

                {/* 当前探测到的高保真音色名 */}
                <div className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400 pt-0.5 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate">当前音色: {activeVoiceName}</span>
                </div>
              </div>

              {/* 2. 语速调节 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 dark:text-stone-400">
                  <span>朗读语速</span>
                  <span className="font-mono text-amber-700 dark:text-amber-300">{rate}x</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {[0.8, 0.9, 1.0, 1.2].map((r) => (
                    <button
                      key={r}
                      onClick={() => handleRateChange(r)}
                      className={`flex-1 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                        rate === r
                          ? 'bg-amber-500 text-stone-950 font-bold shadow-2xs'
                          : 'bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-300 dark:hover:bg-stone-700'
                      }`}
                    >
                      {r}x
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. 试听按钮 */}
              <button
                onClick={handlePreview}
                className="w-full py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 text-xs font-bold transition-all flex items-center justify-center gap-2 border border-amber-500/20"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>试听当前音色</span>
              </button>

              {/* 4. 本地/外部神经语音小外挂槽位 */}
              <div className="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-2">
                <button
                  onClick={() => setShowPluginConfig(!showPluginConfig)}
                  className="w-full flex items-center justify-between text-[11px] font-bold text-stone-500 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-300"
                >
                  <span className="flex items-center gap-1">
                    <Plug className="w-3 h-3 text-amber-500" />
                    本地神经语音小外挂 (Kokoro/Piper/OpenAI)
                  </span>
                  <span className="text-[10px]">{showPluginConfig ? '收起' : '配置'}</span>
                </button>

                {showPluginConfig && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-stone-600 dark:text-stone-300">
                        启用小外挂优先
                      </span>
                      <input
                        type="checkbox"
                        checked={editEnabled}
                        onChange={(e) => setEditEnabled(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-amber-600"
                      />
                    </div>
                    <input
                      type="text"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder="http://127.0.0.1:8880/v1/audio/speech"
                      className="w-full p-2 text-[11px] font-mono rounded-lg bg-white dark:bg-[#131211] border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
                    />
                    <button
                      onClick={handleSavePlugin}
                      className="w-full py-1 text-[11px] font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                    >
                      保存小外挂配置
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
