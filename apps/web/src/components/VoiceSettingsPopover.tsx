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
import { GATEWAY_BASE_URL } from '../lib/api-client.js';
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
  const proxyProvider = useTtsStore((s) => s.proxyProvider);
  const proxyRegion = useTtsStore((s) => s.proxyRegion);
  const setGender = useTtsStore((s) => s.setGender);
  const setRate = useTtsStore((s) => s.setRate);
  const setCustomPluginConfig = useTtsStore((s) => s.setCustomPluginConfig);
  const setCustomPluginAuth = useTtsStore((s) => s.setCustomPluginAuth);
  const setProxyProvider = useTtsStore((s) => s.setProxyProvider);
  const setProxyRegion = useTtsStore((s) => s.setProxyRegion);
  const speak = useTtsStore((s) => s.speak);

  type EngineChoice = 'system' | 'openai-compatible' | 'azure-speech';
  const [editEngine, setEditEngine] = useState<EngineChoice>(
    isCustomPluginEnabled ? proxyProvider : 'system'
  );
  const [editUrl, setEditUrl] = useState(customPluginUrl);
  const [editRegion, setEditRegion] = useState(proxyRegion);
  const [editApiKey, setEditApiKey] = useState(customPluginApiKey);
  const [editVoiceId, setEditVoiceId] = useState(customPluginVoiceId);
  const [testingPlugin, setTestingPlugin] = useState(false);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    setEditEngine(isCustomPluginEnabled ? proxyProvider : 'system');
    setEditUrl(customPluginUrl);
    setEditRegion(proxyRegion);
    setEditApiKey(customPluginApiKey);
    setEditVoiceId(customPluginVoiceId);
  }, [customPluginUrl, isCustomPluginEnabled, customPluginApiKey, customPluginVoiceId, proxyProvider, proxyRegion]);

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

  const persistEngineForm = () => {
    if (editEngine === 'system') {
      setCustomPluginConfig(editUrl, false);
    } else {
      setCustomPluginConfig(editUrl, true);
      setProxyProvider(editEngine);
    }
    setProxyRegion(editRegion);
    setCustomPluginAuth(editApiKey, editVoiceId);
  };

  const handleSavePlugin = () => {
    sound.playCorrect();
    persistEngineForm();
    toast.success(
      editEngine === 'system'
        ? '已切回系统语音'
        : `已启用 ${editEngine === 'azure-speech' ? 'Azure Speech' : 'OpenAI 兼容'}（经网关代理）`
    );
  };

  const handleTestPlugin = () => {
    if (editEngine === 'azure-speech' && !editRegion.trim()) {
      toast.error('请先填写 Azure 区域（如 japaneast）。');
      return;
    }
    if (editEngine === 'openai-compatible' && !editUrl.trim()) {
      toast.error('请先填写外挂端点 URL。');
      return;
    }
    sound.playClick();
    setTestingPlugin(true);
    persistEngineForm();
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

  const handleValidateKey = async () => {
    if (editEngine === 'system') return;
    if (editEngine === 'azure-speech' && !editRegion.trim()) {
      toast.error('请先填写 Azure 区域（如 japaneast）。');
      return;
    }
    if (editEngine === 'openai-compatible' && !editUrl.trim()) {
      toast.error('请先填写外挂端点 URL。');
      return;
    }
    sound.playClick();
    setValidating(true);
    try {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/tts/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: editEngine,
          trackLanguage: resolvedLang.toLowerCase(),
          ...(editEngine === 'openai-compatible' ? { baseUrl: editUrl } : { region: editRegion }),
          ...(editApiKey ? { apiKey: editApiKey } : {}),
          ...(editVoiceId ? { voice: editVoiceId } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: unknown;
        voice?: unknown;
        bytes?: unknown;
        error?: { userMessage?: string };
      } | null;
      if (res.ok && data?.ok) {
        persistEngineForm();
        toast.success(`Key 有效：${String(data.voice ?? '')}（探针 ${String(data.bytes ?? 0)} 字节）。`);
      } else {
        toast.error(data?.error?.userMessage ?? '验证失败，请检查配置。');
      }
    } catch {
      toast.error('网关未响应：请确认网关已启动（localhost:8080）。');
    } finally {
      setValidating(false);
    }
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
              神经语音（云端 / 本地）
            </span>
            <span className="text-[10px] text-amber-600 font-mono">
              {editEngine === 'system'
                ? '系统语音'
                : editEngine === 'azure-speech'
                  ? 'Azure·已选'
                  : '兼容端点·已选'}
            </span>
          </Button>

          {showPluginConfig && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-2 text-xs"
            >
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { value: 'system', label: '系统语音' },
                    { value: 'openai-compatible', label: 'OpenAI兼容' },
                    { value: 'azure-speech', label: 'Azure' },
                  ] as const
                ).map((o) => (
                  <Button
                    key={o.value}
                    type="button"
                    size="sm"
                    variant={editEngine === o.value ? 'default' : 'outline'}
                    className="h-7 text-[11px] px-1"
                    onClick={() => {
                      sound.playClick();
                      setEditEngine(o.value);
                    }}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
              {editEngine === 'openai-compatible' && (
                <>
                  <input
                    type="text"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="端点 URL，如 https://api.openai.com/v1/audio/speech"
                    className="w-full p-2 text-[11px] font-mono rounded-lg bg-white dark:bg-[#131211] border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
                  />
                  <p className="text-[10px] text-stone-400 leading-relaxed">
                    任何 OpenAI /v1/audio/speech 兼容端点：公有云、自建网关或本地兼容服务均可直填。
                  </p>
                </>
              )}
              {editEngine === 'azure-speech' && (
                <>
                  <input
                    type="text"
                    value={editRegion}
                    onChange={(e) => setEditRegion(e.target.value)}
                    placeholder="区域，如 japaneast / koreacentral / eastus"
                    className="w-full p-2 text-[11px] font-mono rounded-lg bg-white dark:bg-[#131211] border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
                  />
                  <p className="text-[10px] text-stone-400 leading-relaxed">
                    Azure Speech 原生 REST：区域 + Key 即可，不填音色按语种用默认神经音色。
                  </p>
                </>
              )}
              {editEngine !== 'system' && (
                <>
                  <input
                    type="password"
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    placeholder="API Key（可空传本地服务；仅存本机）"
                    autoComplete="off"
                    className="w-full p-2 text-[11px] font-mono rounded-lg bg-white dark:bg-[#131211] border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
                  />
                  <input
                    type="text"
                    value={editVoiceId}
                    onChange={(e) => setEditVoiceId(e.target.value)}
                    placeholder="音色 id（可空，如 alloy / ja-JP-NanamiNeural）"
                    className="w-full p-2 text-[11px] font-mono rounded-lg bg-white dark:bg-[#131211] border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
                  />
                  <p className="text-[10px] text-stone-400 leading-relaxed">
                    Key 随本次请求发往本机网关代调第三方，网关不落盘。先验证再保存。
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={validating}
                      onClick={() => void handleValidateKey()}
                    >
                      {validating ? '验证中…' : '验证有效性'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={testingPlugin}
                      onClick={handleTestPlugin}
                    >
                      {testingPlugin ? '试播中…' : '试播验证'}
                    </Button>
                  </div>
                </>
              )}
              <Button type="button" size="sm" className="w-full" onClick={handleSavePlugin}>
                保存语音配置
              </Button>
            </motion.div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
