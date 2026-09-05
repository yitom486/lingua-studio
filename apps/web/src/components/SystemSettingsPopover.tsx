import React, { useState, useEffect, useMemo } from 'react';
import {
  SlidersHorizontal,
  Volume2,
  Wifi,
  WifiOff,
  User,
  Play,
  Check,
  ChevronRight,
  Flame,
  CheckCircle2,
  BookOpen,
  Download,
  LoaderCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js';
import { Button, buttonVariants } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { Slider } from './ui/slider.js';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './ui/select.js';
import { sound, speechStudio, type TtsGender } from '../utils/audio.js';
import { useTtsStore, voicePrefKey } from '../stores/useTtsStore.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import { useLearningShell } from '../hooks/useLearningShell.js';
import {
  getPersonaLabel,
  getPreviewText,
  getTtsVoicePack,
  trackToSpeechLang,
} from '../config/tts-voice-personas.js';
import {
  useDictionaryPackagesQuery,
  useInstallDictionaryPackageMutation,
} from '../queries/useLearnerQueries.js';
import { useGatewayStore } from '../stores/useGatewayStore.js';

export function SystemSettingsPopover() {
  const [open, setOpen] = useState(false);
  const [voiceTick, setVoiceTick] = useState(0);
  const isConnected = useGatewayStore((s) => s.isConnected);
  const latencyMs = useGatewayStore((s) => s.latencyMs);

  // TTS 状态
  const gender = useTtsStore((s) => s.gender);
  const rate = useTtsStore((s) => s.rate);
  const preferredVoices = useTtsStore((s) => s.preferredVoices);
  const setGender = useTtsStore((s) => s.setGender);
  const setRate = useTtsStore((s) => s.setRate);
  const setPreferredVoice = useTtsStore((s) => s.setPreferredVoice);
  const speak = useTtsStore((s) => s.speak);

  // 学情与画像
  const profile = useUserProfileStore((s) => s.profile);
  const dailyTask = useUserProfileStore((s) => s.dailyTask);
  const setProfileModalOpen = useUserProfileStore((s) => s.setProfileModalOpen);
  const shell = useLearningShell();
  const speechLang = trackToSpeechLang(shell.track);
  const voicePack = getTtsVoicePack(speechLang);
  const prefKey = voicePrefKey(speechLang, gender);
  const preferredURI = preferredVoices[prefKey] ?? null;
  const dictionaryPackages = useDictionaryPackagesQuery(open);
  const installDictionaryPackage = useInstallDictionaryPackageMutation();
  const englishDictionary = dictionaryPackages.data?.packages.find((item) => item.id === 'oewn-2025');

  // 系统音色异步加载（Chrome onvoiceschanged）
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const bump = () => setVoiceTick((n) => n + 1);
    bump();
    window.speechSynthesis.addEventListener('voiceschanged', bump);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', bump);
  }, []);

  const langVoices = useMemo(() => {
    void voiceTick;
    return speechStudio.listVoicesForLang(speechLang);
  }, [speechLang, voiceTick]);

  const activeSystemVoice = speechStudio.getBestVoice(speechLang, gender, preferredURI);
  const hasNamed = speechStudio.hasNamedGenderVoice(speechLang, gender);

  // 切到男声且尚无偏好时，自动锁定评分最高的男声音色
  useEffect(() => {
    if (gender !== 'MALE' || preferredURI || langVoices.length === 0) return;
    const best = speechStudio.getBestVoice(speechLang, 'MALE');
    if (best && speechStudio.hasNamedGenderVoice(speechLang, 'MALE')) {
      setPreferredVoice(speechLang, 'MALE', best.voiceURI);
    }
  }, [gender, speechLang, preferredURI, langVoices.length, setPreferredVoice]);

  const handleGenderChange = (newGender: TtsGender) => {
    sound.playClick();
    setGender(newGender);
    toast.success(`已切换至：${getPersonaLabel(speechLang, newGender)}`);
  };

  const handleVoicePick = (voiceURI: string | null) => {
    sound.playClick();
    setPreferredVoice(speechLang, gender, voiceURI);
    if (voiceURI) {
      const v = speechStudio.getVoiceByURI(voiceURI);
      toast.success(`已指定引擎音色：${v?.name ?? voiceURI}`);
    }
  };

  const handlePreview = () => {
    sound.playClick();
    speak(getPreviewText(speechLang, gender), { lang: speechLang, gender, rate });
  };

  const handleInstallEnglishDictionary = () => {
    if (!englishDictionary || installDictionaryPackage.isPending) return;
    sound.playClick();
    installDictionaryPackage.mutate(englishDictionary.id, {
      onSuccess: (installed) => {
        toast.success(`英语离线词典已安装：${installed.entryCount?.toLocaleString() ?? ''} 条词条`);
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : '词典包安装失败，请稍后重试。');
      },
    });
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
            isConnected ? 'bg-emerald-500' : 'bg-amber-400'
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
            {isConnected ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Wifi className="w-3 h-3" />
                <span>已联通{latencyMs ? ` (${latencyMs}ms)` : ''}</span>
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
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600 dark:text-amber-400 font-mono"
                >
                  {voicePack.trackLabel} · {speechLang}
                </Badge>
                <button
                  type="button"
                  onClick={handlePreview}
                  className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  试听
                </button>
              </div>
            </div>

            {/* 音色男女声选择：标签随目标语种轨道切换 */}
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
                <span className="truncate">{voicePack.female.label}</span>
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
                <span className="truncate">{voicePack.male.label}</span>
                {gender === 'MALE' && <Check className="w-3 h-3 text-amber-500" />}
              </button>
            </div>

            <div className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">
                当前引擎: {activeSystemVoice?.name || '系统默认 · 随语种自动匹配'}
              </span>
            </div>

            {langVoices.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-stone-500 dark:text-stone-400">
                  手动指定系统音色（英语请优先选 David / Mark / Guy）
                </label>
                <Select
                  value={preferredURI || activeSystemVoice?.voiceURI || ''}
                  onValueChange={(val) => handleVoicePick(val || null)}
                >
                  <SelectTrigger className="h-8 text-[11px]">
                    <SelectValue placeholder="选择系统音色..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {langVoices.map((v) => (
                      <SelectItem key={v.voiceURI} value={v.voiceURI}>
                        <span className="truncate">
                          {v.name}
                          {v.localService ? ' · 本地' : ' · 云端'}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!hasNamed && (
              <p className="text-[10px] text-amber-700/90 dark:text-amber-300/90 leading-relaxed">
                {gender === 'MALE'
                  ? '未检测到具名男声（如 Microsoft David/Mark）。若列表里只有 Google US English，听感会偏女声；请在上方手动选男声，或到系统设置安装英文男声 / 启用 TTS 外挂。'
                  : '未检测到具名女声引擎；已使用该语种默认音色。'}
              </p>
            )}

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

          {/* 2. 词典包：内容按需进入 SQLite，避免初装体积与无授权数据混入。 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-300">
              <BookOpen className="w-3.5 h-3.5 text-amber-500" />
              <span>离线词典包</span>
            </div>
            {englishDictionary ? (
              <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-2.5 dark:border-stone-800 dark:bg-stone-900/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-800 dark:text-stone-200">
                      英语释义 · {englishDictionary.provider}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500 dark:text-stone-400">
                      {englishDictionary.installed
                        ? `已写入本机 SQLite${englishDictionary.entryCount ? ` · ${englishDictionary.entryCount.toLocaleString()} 条` : ''}`
                        : '未预装；仅在你点击安装后下载并写入本机 SQLite。'}
                    </p>
                  </div>
                  {englishDictionary.installed ? (
                    <Badge variant="outline" className="shrink-0 border-emerald-500/30 text-[10px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="mr-1 h-3 w-3" />已安装
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                      disabled={!isConnected || installDictionaryPackage.isPending}
                      onClick={handleInstallEnglishDictionary}
                    >
                      {installDictionaryPackage.isPending ? (
                        <LoaderCircle className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                      安装
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-stone-400">
                  {englishDictionary.licenseName} · 已保留来源与署名
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-stone-500">正在读取词典包状态…</p>
            )}
          </div>

          <div className="h-px bg-stone-100 dark:bg-stone-800/80" />

          {/* 3. 学情画像与打卡目标入口 */}
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
