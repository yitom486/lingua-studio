import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Volume2,
  Sparkles,
  Check,
  Play,
  Plug,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  speechStudio,
  sound,
  type TtsGender,
  type SupportedLanguage,
} from '../utils/audio.js';
import { useTtsStore } from '../stores/useTtsStore.js';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover.js';
import { Slider } from './ui/slider.js';
import { Button, buttonVariants } from './ui/button.js';
import { Badge } from './ui/badge.js';

interface VoiceSettingsPopoverProps {
  currentLanguage?: SupportedLanguage;
}

export function VoiceSettingsPopover({ currentLanguage = 'JA' }: VoiceSettingsPopoverProps) {
  const [showPluginConfig, setShowPluginConfig] = useState(false);

  const gender = useTtsStore((s) => s.gender);
  const rate = useTtsStore((s) => s.rate);
  const customPluginUrl = useTtsStore((s) => s.customPluginUrl);
  const isCustomPluginEnabled = useTtsStore((s) => s.isCustomPluginEnabled);
  const setGender = useTtsStore((s) => s.setGender);
  const setRate = useTtsStore((s) => s.setRate);
  const setCustomPluginConfig = useTtsStore((s) => s.setCustomPluginConfig);
  const speak = useTtsStore((s) => s.speak);

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

    speak(previewText, { lang: currentLanguage, gender, rate });
  };

  const handleSavePlugin = () => {
    sound.playCorrect();
    setCustomPluginConfig(editUrl, editEnabled);
    toast.success(
      editEnabled ? '已启用本地 TTS 神经语音小外挂' : '已关闭小外挂，回退至原生高清音色'
    );
  };

  return (
    <Popover>
      <PopoverTrigger
        onClick={() => sound.playClick()}
        className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
        title="语音音色与发音设置"
      >
        <Volume2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        <span>{gender === 'FEMALE' ? '👩 女声' : '👨 男声'}</span>
        <span className="text-[10px] text-stone-400 font-mono">({rate}x)</span>
        <ChevronDown className="w-3 h-3 text-stone-400" />
      </PopoverTrigger>

      <PopoverContent className="w-80 space-y-4 font-sans" align="end">
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold">语音合成与音色工作台</span>
          </div>
          <Badge variant="amber" className="text-[10px] font-mono">
            {currentLanguage}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
            发音音色预设 (双导师方案)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={gender === 'FEMALE' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleGenderChange('FEMALE')}
              className="h-9"
            >
              <span>👩 温柔女声</span>
              {gender === 'FEMALE' && <Check className="w-3.5 h-3.5" />}
            </Button>
            <Button
              type="button"
              variant={gender === 'MALE' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleGenderChange('MALE')}
              className="h-9"
            >
              <span>👨 阳光男声</span>
              {gender === 'MALE' && <Check className="w-3.5 h-3.5" />}
            </Button>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400 pt-0.5 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="truncate">当前音色: {activeVoiceName}</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 dark:text-stone-400">
            <span>朗读语速 (无级滑块)</span>
            <span className="font-mono text-amber-700 dark:text-amber-300 font-bold">{rate}x</span>
          </div>
          <Slider
            value={rate}
            min={0.6}
            max={1.4}
            step={0.05}
            onValueChange={(val) => {
              const numVal = Array.isArray(val) ? val[0] : val;
              if (typeof numVal === 'number') {
                setRate(Math.round(numVal * 100) / 100);
              }
            }}
          />
          <div className="flex items-center gap-1.5 pt-1">
            {[0.8, 0.9, 1.0, 1.2].map((r) => (
              <Button
                key={r}
                type="button"
                size="sm"
                variant={Math.abs(rate - r) < 0.03 ? 'default' : 'secondary'}
                onClick={() => handleRateChange(r)}
                className="flex-1 h-7 font-mono"
              >
                {r}x
              </Button>
            ))}
          </div>
        </div>

        <Button type="button" variant="amber" className="w-full" onClick={handlePreview}>
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>试听当前音色 ({currentLanguage})</span>
        </Button>

        <div className="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-2">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between h-8 px-1"
            onClick={() => setShowPluginConfig(!showPluginConfig)}
          >
            <span className="flex items-center gap-1">
              <Plug className="w-3.5 h-3.5" />
              本地 TTS 神经语音小外挂
            </span>
            <span className="text-[10px] text-amber-600 font-mono">
              {isCustomPluginEnabled ? '已启用' : '已关闭'}
            </span>
          </Button>

          {showPluginConfig && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-stone-600 dark:text-stone-300">启用小外挂优先</span>
                <input
                  type="checkbox"
                  checked={editEnabled}
                  onChange={(e) => setEditEnabled(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-amber-600 cursor-pointer"
                />
              </div>
              <input
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="http://127.0.0.1:8880/v1/audio/speech"
                className="w-full p-2 text-[11px] font-mono rounded-lg bg-white dark:bg-[#131211] border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
              />
              <Button type="button" size="sm" className="w-full" onClick={handleSavePlugin}>
                保存小外挂配置
              </Button>
            </motion.div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
