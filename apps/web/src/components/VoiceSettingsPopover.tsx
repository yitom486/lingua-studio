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
import { useLearningShell } from '../hooks/useLearningShell.js';
import {
  getPersonaLabel,
  getPreviewText,
  getTtsVoicePack,
  trackToSpeechLang,
} from '../config/tts-voice-personas.js';

interface VoiceSettingsPopoverProps {
  currentLanguage?: SupportedLanguage;
}

export function VoiceSettingsPopover({ currentLanguage }: VoiceSettingsPopoverProps) {
  const shell = useLearningShell();
  const resolvedLang = currentLanguage ?? trackToSpeechLang(shell.track);
  const voicePack = getTtsVoicePack(resolvedLang);
  const [showPluginConfig, setShowPluginConfig] = useState(false);

  const gender = useTtsStore((s) => s.gender);
  const rate = useTtsStore((s) => s.rate);
  const customPluginUrl = useTtsStore((s) => s.customPluginUrl);
  const isCustomPluginEnabled = useTtsStore((s) => s.isCustomPluginEnabled);
  const customPluginApiKey = useTtsStore((s) => s.customPluginApiKey);
  const customPluginVoiceId = useTtsStore((s) => s.customPluginVoiceId);
  const setGender = useTtsStore((s) => s.setGender);
  const setRate = useTtsStore((s) => s.setRate);
  const setCustomPluginConfig = useTtsStore((s) => s.setCustomPluginConfig);
  const setCustomPluginAuth = useTtsStore((s) => s.setCustomPluginAuth);
  const speak = useTtsStore((s) => s.speak);

  const [editUrl, setEditUrl] = useState(customPluginUrl);
  const [editEnabled, setEditEnabled] = useState(isCustomPluginEnabled);
  const [editApiKey, setEditApiKey] = useState(customPluginApiKey);
  const [editVoiceId, setEditVoiceId] = useState(customPluginVoiceId);
  const [testingPlugin, setTestingPlugin] = useState(false);

  useEffect(() => {
    setEditUrl(customPluginUrl);
    setEditEnabled(isCustomPluginEnabled);
    setEditApiKey(customPluginApiKey);
    setEditVoiceId(customPluginVoiceId);
  }, [customPluginUrl, isCustomPluginEnabled, customPluginApiKey, customPluginVoiceId]);

  const activeVoice = speechStudio.getBestVoice(resolvedLang, gender);
  const activeVoiceName = activeVoice ? activeVoice.name : '系统默认自然发音';

  const handleGenderChange = (newGender: TtsGender) => {
    sound.playClick();
    setGender(newGender);
    toast.success(`已切换至：${getPersonaLabel(resolvedLang, newGender)}`);
  };

  const handleRateChange = (newRate: number) => {
    sound.playClick();
    setRate(newRate);
  };

  const handlePreview = () => {
    sound.playClick();
    speak(getPreviewText(resolvedLang, gender), { lang: resolvedLang, gender, rate });
  };

  const handleSavePlugin = () => {
    sound.playCorrect();
    setCustomPluginConfig(editUrl, editEnabled);
    setCustomPluginAuth(editApiKey, editVoiceId);
    toast.success(
      editEnabled ? '已启用本地 TTS 神经语音小外挂' : '已关闭小外挂，回退至原生高清音色'
    );
  };

  const handleTestPlugin = () => {
    if (!editUrl.trim()) {
      toast.error('请先填写外挂端点 URL。');
      return;
    }
    sound.playClick();
    setTestingPlugin(true);
    // 先落盘当前编辑值再试播，试的即所得
    setCustomPluginConfig(editUrl, true);
    setEditEnabled(true);
    setCustomPluginAuth(editApiKey, editVoiceId);
    void speak(getPreviewText(resolvedLang, gender), {
      lang: resolvedLang,
      gender,
      onEnd: () => setTestingPlugin(false),
      onError: (e) => {
        setTestingPlugin(false);
        toast.error(e instanceof Error ? e.message : '小外挂试播失败，请检查 URL / Key。');
      },
    });
  };

  return (
    <Popover>
      <PopoverTrigger
        onClick={() => sound.playClick()}
        className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
        title="语音音色与发音设置"
      >
        <Volume2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        <span>{gender === 'FEMALE' ? voicePack.female.displayName : voicePack.male.displayName}</span>
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
            {voicePack.trackLabel} · {resolvedLang}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
            发音音色预设（随目标语种自动切换人设）
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={gender === 'FEMALE' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleGenderChange('FEMALE')}
              className="h-9"
            >
              <span>{voicePack.female.label}</span>
              {gender === 'FEMALE' && <Check className="w-3.5 h-3.5" />}
            </Button>
            <Button
              type="button"
              variant={gender === 'MALE' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleGenderChange('MALE')}
              className="h-9"
            >
              <span>{voicePack.male.label}</span>
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
          <span>试听当前音色 ({resolvedLang})</span>
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
              <input
                type="password"
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder="API Key（可空；仅存本机）"
                autoComplete="off"
                className="w-full p-2 text-[11px] font-mono rounded-lg bg-white dark:bg-[#131211] border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
              />
              <input
                type="text"
                value={editVoiceId}
                onChange={(e) => setEditVoiceId(e.target.value)}
                placeholder="音色 id（可空，如 alloy / 女声晓晓）"
                className="w-full p-2 text-[11px] font-mono rounded-lg bg-white dark:bg-[#131211] border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
              />
              <p className="text-[10px] text-stone-400 leading-relaxed">
                OpenAI /v1/audio/speech 兼容端点：云端（OpenAI、Azure、自建网关）或本地服务（Piper / Kokoro 兼容层）均可。
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="flex-1" disabled={testingPlugin} onClick={handleTestPlugin}>
                  {testingPlugin ? '试播中…' : '试播验证'}
                </Button>
                <Button type="button" size="sm" className="flex-1" onClick={handleSavePlugin}>
                  保存小外挂配置
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
