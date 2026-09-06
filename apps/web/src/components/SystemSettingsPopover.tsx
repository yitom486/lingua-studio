import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  DatabaseBackup,
  Plug,
} from 'lucide-react';
import { toast } from 'sonner';
import { GATEWAY_BASE_URL } from '../lib/api-client.js';
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
  useAzureVoicesQuery,
  useInvalidateTtsVoices,
  type AzureVoiceOption,
} from '../queries/useLearnerQueries.js';
import { useGatewayStore } from '../stores/useGatewayStore.js';
import { getPlatform } from '../platform/capabilities.js';
import { backupDesktopDatabase } from '../platform/tauri-capabilities.js';

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

  // 神经语音（经网关代理）：三选项 + 分服务商字段 + 有效性验证
  type EngineChoice = 'system' | 'openai-compatible' | 'azure-speech';
  const customPluginUrl = useTtsStore((s) => s.customPluginUrl);
  const isCustomPluginEnabled = useTtsStore((s) => s.isCustomPluginEnabled);
  const customPluginApiKey = useTtsStore((s) => s.customPluginApiKey);
  const customPluginVoiceId = useTtsStore((s) => s.customPluginVoiceId);
  const proxyProvider = useTtsStore((s) => s.proxyProvider);
  const proxyRegion = useTtsStore((s) => s.proxyRegion);
  const azureStyle = useTtsStore((s) => s.azureStyle);
  const azureFemaleVoiceId = useTtsStore((s) => s.azureFemaleVoiceId);
  const azureMaleVoiceId = useTtsStore((s) => s.azureMaleVoiceId);
  const setCustomPluginConfig = useTtsStore((s) => s.setCustomPluginConfig);
  const setCustomPluginAuth = useTtsStore((s) => s.setCustomPluginAuth);
  const setProxyProvider = useTtsStore((s) => s.setProxyProvider);
  const setProxyRegion = useTtsStore((s) => s.setProxyRegion);
  const setAzureStyle = useTtsStore((s) => s.setAzureStyle);
  const setAzureGenderVoice = useTtsStore((s) => s.setAzureGenderVoice);
  const [editEngine, setEditEngine] = useState<EngineChoice>(
    isCustomPluginEnabled ? proxyProvider : 'system'
  );
  const [editUrl, setEditUrl] = useState(customPluginUrl);
  const [editRegion, setEditRegion] = useState(proxyRegion);
  const [editApiKey, setEditApiKey] = useState(customPluginApiKey);
  const [editVoiceId, setEditVoiceId] = useState(customPluginVoiceId);
  const [editFemaleVoiceId, setEditFemaleVoiceId] = useState(azureFemaleVoiceId);
  const [editMaleVoiceId, setEditMaleVoiceId] = useState(azureMaleVoiceId);
  const [editStyle, setEditStyle] = useState(azureStyle);
  const [validating, setValidating] = useState(false);
  const [testingNeural, setTestingNeural] = useState(false);
  const invalidateTtsVoices = useInvalidateTtsVoices();

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
  // 可安装包以 Gateway 目录为准（oewn-2025 / jmdict-e / kengdic-2021…），前端不写死 id。
  const installableDictionaries = dictionaryPackages.data?.packages ?? [];
  const dictionaryLangLabel = (language: string): string =>
    language === 'ja' ? '日语' : language === 'ko' ? '韩语' : '英语';

  // P4-B：桌面端专属（Web 端不渲染）。getPlatform 在 Tauri WebView 内返回桌面实现。
  const [isDesktop, setIsDesktop] = useState(false);
  const [backupPending, setBackupPending] = useState(false);
  useEffect(() => {
    try {
      setIsDesktop(getPlatform().isDesktop());
    } catch {
      setIsDesktop(false);
    }
  }, []);

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

  /** 音色 id 取短名（ja-JP-DaichiNeural → Daichi），顶栏按钮跟着桶走，不写死 */
  const shortVoiceNameOf = (voiceId: string): string => {
    const m = voiceId.match(/-([A-Za-z]+)Neural$/);
    return m?.[1] ?? (voiceId || '');
  };
  const femaleBucketVoiceId = editEngine === 'azure-speech' ? editFemaleVoiceId : '';
  const maleBucketVoiceId = editEngine === 'azure-speech' ? editMaleVoiceId : '';
  const femaleChipLabel = `女声${femaleBucketVoiceId ? `（${shortVoiceNameOf(femaleBucketVoiceId)}）` : ''}`;
  const maleChipLabel = `男声${maleBucketVoiceId ? `（${shortVoiceNameOf(maleBucketVoiceId)}）` : ''}`;

  const handleGenderChange = (newGender: TtsGender) => {
    sound.playClick();
    setGender(newGender);
    // 风格归属当前性别桶的音色，切性别即重置；两桶各自保留互不干扰
    setEditStyle('');
    toast.success(
      newGender === 'MALE' ? `已切换至：${maleChipLabel}` : `已切换至：${femaleChipLabel}`
    );
  };

  // 切语种时清空跨语种残留的显式音色/风格（两桶 + OpenAI 单值；挂载时不动）
  const prevLangRef = useRef(speechLang);
  useEffect(() => {
    if (prevLangRef.current !== speechLang) {
      prevLangRef.current = speechLang;
      setEditVoiceId('');
      setEditFemaleVoiceId('');
      setEditMaleVoiceId('');
      setEditStyle('');
    }
  }, [speechLang]);

  const handleVoicePick = (voiceURI: string | null) => {
    sound.playClick();
    setPreferredVoice(speechLang, gender, voiceURI);
    if (voiceURI) {
      const v = speechStudio.getVoiceByURI(voiceURI);
      toast.success(`已指定引擎音色：${v?.name ?? voiceURI}`);
    }
  };

  /** 三处同源的实际生效描述：引擎行、试听、试播验证 */
  const describeEffectiveVoice = (): string => {
    if (!editEngine || editEngine === 'system') {
      return activeSystemVoice?.name || '系统默认';
    }
    if (editEngine === 'azure-speech') {
      return effectiveAzureVoice
        ? `${effectiveAzureVoice.label} · ${effectiveAzureVoice.id}`
        : '按语种自动';
    }
    return editVoiceId || (gender === 'MALE' ? 'echo（男）' : 'alloy（女）');
  };

  const handlePreview = () => {
    sound.playClick();
    // 先落盘再播：否则下拉改了没点保存，试听用的还是旧桶，可复现“换哪个都一个声”
    persistNeuralForm();
    toast.message(`试听：${describeEffectiveVoice()}`);
    speak(getPreviewText(speechLang, gender), { lang: speechLang, gender, rate });
  };

  const persistNeuralForm = () => {
    if (editEngine === 'system') {
      setCustomPluginConfig(editUrl, false);
    } else {
      setCustomPluginConfig(editUrl, true);
      setProxyProvider(editEngine);
    }
    setProxyRegion(editRegion);
    setCustomPluginAuth(editApiKey, editVoiceId);
    setAzureGenderVoice('FEMALE', editFemaleVoiceId);
    setAzureGenderVoice('MALE', editMaleVoiceId);
    setAzureStyle(editEngine === 'azure-speech' ? editStyle : '');
  };

  const handleSaveNeural = () => {
    sound.playCorrect();
    persistNeuralForm();
    const summary =
      editEngine === 'system'
        ? '已切回系统语音'
        : editEngine === 'azure-speech'
          ? `已保存 Azure（女 ${editFemaleVoiceId || '默认'} / 男 ${editMaleVoiceId || '默认'}）`
          : `已保存兼容端点（音色 ${editVoiceId || '默认'}）`;
    toast.success(summary);
  };

  const handleValidateNeural = async () => {
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
          trackLanguage: speechLang.toLowerCase(),
          ...(editEngine === 'openai-compatible' ? { baseUrl: editUrl } : { region: editRegion }),
          ...(editApiKey ? { apiKey: editApiKey } : {}),
          // 验证用当前性别桶的音色（与实际生效一致）
          ...((() => {
            const bucketId = gender === 'MALE' ? editMaleVoiceId : editFemaleVoiceId;
            return editEngine === 'azure-speech' && bucketId ? { voice: bucketId } : {};
          })()),
          ...(editEngine === 'azure-speech' && editStyle ? { style: editStyle } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: unknown;
        voice?: unknown;
        bytes?: unknown;
        error?: { userMessage?: string };
      } | null;
      if (res.ok && data?.ok) {
        persistNeuralForm();
        void invalidateTtsVoices();
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

  const handleTestNeural = () => {
    if (editEngine === 'system') return;
    sound.playClick();
    setTestingNeural(true);
    persistNeuralForm();
    // 报出实际试播的音色：所见即所听，对不上立刻能发现
    const testDesc = describeEffectiveVoice();
    toast.message(`正在试播：${testDesc}`);
    void speak(getPreviewText(speechLang, gender), {
      lang: speechLang,
      gender,
      onEnd: () => setTestingNeural(false),
      onError: (e) => {
        setTestingNeural(false);
        toast.error(e instanceof Error ? e.message : '神经语音试播失败，请检查配置。');
      },
    });
  };

  // Azure 区域做成选择题；音色优先用网关拉取的全量表（含各音色可用风格），
  // 未加载时回退内置短表。音色与顶部男女声是同一状态：选具体音色会同步男女声，
  // 切男女声/语种则回到自动跟随，永不矛盾
  const AZURE_REGIONS = [
    'japaneast',
    'koreacentral',
    'southeastasia',
    'eastasia',
    'eastus',
    'westus2',
    'westeurope',
    'australiaeast',
  ];
  const AZURE_VOICE_FALLBACK: AzureVoiceOption[] = [
    { id: 'ja-JP-NanamiNeural', label: '七海（女）', gender: 'FEMALE', locale: 'ja-JP', styles: [] },
    { id: 'ja-JP-KeitaNeural', label: '圭太（男）', gender: 'MALE', locale: 'ja-JP', styles: [] },
    { id: 'ja-JP-AoiNeural', label: '葵（女）', gender: 'FEMALE', locale: 'ja-JP', styles: [] },
    { id: 'ja-JP-DaichiNeural', label: '大地（男）', gender: 'MALE', locale: 'ja-JP', styles: [] },
    { id: 'ko-KR-SunHiNeural', label: 'SunHi（女）', gender: 'FEMALE', locale: 'ko-KR', styles: [] },
    { id: 'ko-KR-InJoonNeural', label: 'InJoon（男）', gender: 'MALE', locale: 'ko-KR', styles: [] },
    { id: 'en-US-JennyNeural', label: 'Jenny（女）', gender: 'FEMALE', locale: 'en-US', styles: [] },
    { id: 'en-US-GuyNeural', label: 'Guy（男）', gender: 'MALE', locale: 'en-US', styles: [] },
    { id: 'en-US-AriaNeural', label: 'Aria（女）', gender: 'FEMALE', locale: 'en-US', styles: [] },
    { id: 'en-US-DavisNeural', label: 'Davis（男）', gender: 'MALE', locale: 'en-US', styles: [] },
  ];
  const { data: remoteVoices = [], isFetching: isVoicesFetching } = useAzureVoicesQuery({
    region: editRegion,
    apiKey: editApiKey,
    track: speechLang,
    // 面板打开且选了 Azure 才拉全量表（Key 不进缓存键，换 Key 后靠验证成功刷新）
    enabled: editEngine === 'azure-speech' && open,
  });
  // Key 从空到有（用户后填的常见顺序）自动刷一次音色表，否则永远停在内置短表
  const hadKeyRef = useRef(editApiKey.trim().length > 0);
  useEffect(() => {
    const hasKey = editApiKey.trim().length > 0;
    if (
      hasKey &&
      !hadKeyRef.current &&
      editEngine === 'azure-speech' &&
      editRegion.trim().length > 0
    ) {
      void invalidateTtsVoices();
    }
    hadKeyRef.current = hasKey;
  }, [editApiKey, editEngine, editRegion, invalidateTtsVoices]);
  const azureVoiceOptions: AzureVoiceOption[] = (
    remoteVoices.length > 0 ? remoteVoices : AZURE_VOICE_FALLBACK
  ).filter((v) => v.id.toLowerCase().startsWith(speechLang.toLowerCase()));
  /** 两桶各管各：女声下拉只列女声，男声下拉只列男声，互不串味 */
  const femaleOptions = azureVoiceOptions.filter((v) => v.gender === 'FEMALE');
  const maleOptions = azureVoiceOptions.filter((v) => v.gender === 'MALE');
  /** 当前性别桶选中的音色（风格取自它）；顶部男女声开关决定用哪一桶 */
  const activeBucketId = gender === 'MALE' ? editMaleVoiceId : editFemaleVoiceId;
  const activeVoice =
    azureVoiceOptions.find((v) => v.id === activeBucketId) ??
    azureVoiceOptions.find((v) => v.gender === gender) ??
    azureVoiceOptions[0];
  const voiceStyles = activeVoice?.styles ?? [];
  /** 当前实际生效的 Azure 音色 */
  const effectiveAzureVoice = activeVoice;
  /** 下拉框显示文本（SelectValue 无 children 时会裸显 value，不可传哨兵） */
  const azureVoiceTriggerLabel = (bucketId: string) =>
    bucketId
      ? (azureVoiceOptions.find((v) => v.id === bucketId)?.label ?? bucketId)
      : '默认';
  const azureRegionTriggerLabel = editRegion || '选择区域，如 japaneast';
  const OPENAI_ENDPOINT_PRESETS = [
    { label: 'OpenAI 官方', value: 'https://api.openai.com/v1/audio/speech' },
    { label: '本地默认', value: 'http://127.0.0.1:8880/v1/audio/speech' },
  ];
  const OPENAI_VOICE_PRESETS = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

  const handleInstallDictionary = (packageId: string) => {
    const target = installableDictionaries.find((item) => item.id === packageId);
    if (!target || installDictionaryPackage.isPending) return;
    sound.playClick();
    installDictionaryPackage.mutate(target.id, {
      onSuccess: (installed) => {
        toast.success(
          `${dictionaryLangLabel(target.language)}离线词典已安装：${installed.entryCount?.toLocaleString() ?? ''} 条词条`
        );
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : '词典包安装失败，请稍后重试。');
      },
    });
  };

  const handleBackupDatabase = async () => {
    if (backupPending) return;
    sound.playClick();
    setBackupPending(true);
    try {
      const dest = await backupDesktopDatabase();
      toast.success('学习数据库已备份', { description: dest });
    } catch (e) {
      // 用户取消保存对话框不算错误，不打扰
      const message = e instanceof Error ? e.message : '备份失败，请稍后重试。';
      if (!message.includes('未选择保存路径')) {
        toast.error(message);
      }
    } finally {
      setBackupPending(false);
    }
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

            {/* 引擎三选一：选择即在此，音色一并在此定 */}
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

            {/* 男女声：不写死具体人名，只定性别方向，具体音色由下方下拉定 */}
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
                <span className="truncate">{femaleChipLabel}</span>
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
                <span className="truncate">{maleChipLabel}</span>
                {gender === 'MALE' && <Check className="w-3 h-3 text-amber-500" />}
              </button>
            </div>

            <div className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">
                当前引擎: {editEngine && editEngine !== 'system' ? `${editEngine === 'azure-speech' ? 'Azure' : '兼容端点'} · ` : ''}{describeEffectiveVoice()}
              </span>
            </div>

            {/* 具体音色选择：随引擎切换，选中即生效（保存后持久） */}
            {editEngine === 'system' && langVoices.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-stone-500 dark:text-stone-400">
                  系统音色（英语请优先选 David / Mark / Guy）
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

            {editEngine === 'azure-speech' && (
              <div className="space-y-2">
                {(
                  [
                    { gender: 'FEMALE' as const, label: '女声', bucketId: editFemaleVoiceId, options: femaleOptions },
                    { gender: 'MALE' as const, label: '男声', bucketId: editMaleVoiceId, options: maleOptions },
                  ]
                ).map((group) => (
                  <div key={group.gender} className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 w-8 shrink-0">
                      {group.label}
                    </span>
                    <Select
                      value={group.bucketId || `__auto_${group.gender}`}
                      onValueChange={(v) => {
                        if (!v) return;
                        sound.playClick();
                        const next = v === `__auto_${group.gender}` ? '' : v;
                        if (group.gender === 'MALE') {
                          setEditMaleVoiceId(next);
                        } else {
                          setEditFemaleVoiceId(next);
                        }
                        // 风格归属当前性别桶的音色，换桶内音色即重置
                        if (
                          (group.gender === gender && next !== activeBucketId) ||
                          next === ''
                        ) {
                          setEditStyle('');
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-[11px] flex-1">
                        <SelectValue placeholder={`${group.label}音色（默认）`}>
                          {azureVoiceTriggerLabel(group.bucketId)}
                          {isVoicesFetching ? ' · 读取中…' : ''}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={`__auto_${group.gender}`}>默认{group.label}音色</SelectItem>
                        {group.options.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.label} · {v.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                {voiceStyles.length > 0 && (
                  <Select
                    value={editStyle || '__none'}
                    onValueChange={(v) => {
                      if (!v) return;
                      sound.playClick();
                      setEditStyle(v === '__none' ? '' : v);
                    }}
                  >
                    <SelectTrigger className="h-8 text-[11px]">
                      <SelectValue placeholder="说话风格（默认自然）">
                        {editStyle ? `风格：${editStyle}` : '说话风格（默认自然）'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">自然（无风格）</SelectItem>
                      {voiceStyles.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {remoteVoices.length > 0 ? (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 leading-relaxed">
                    已加载 {remoteVoices.length} 个{speechLang === 'JA' ? '日语' : speechLang === 'KO' ? '韩语' : '英语'}云端音色（含各音色可用风格）。
                  </p>
                ) : (
                  <p className="text-[10px] text-stone-400 leading-relaxed">
                    到下方填好区域与 Key 后自动拉取该区全量音色与说话风格。
                  </p>
                )}
              </div>
            )}

            {editEngine === 'openai-compatible' && (
              <div className="space-y-2">
                <div className="flex gap-1">
                  {OPENAI_VOICE_PRESETS.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      size="sm"
                      variant={editVoiceId === p ? 'default' : 'outline'}
                      className="flex-1 h-7 text-[11px] px-1"
                      onClick={() => {
                        sound.playClick();
                        setEditVoiceId(p);
                      }}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
                <input
                  type="text"
                  value={editVoiceId}
                  onChange={(e) => setEditVoiceId(e.target.value)}
                  placeholder="音色 id（可空，如 alloy）"
                  className="w-full p-2 text-[11px] font-mono rounded-lg bg-white dark:bg-[#131211] border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
                />
              </div>
            )}

            {editEngine === 'system' && !hasNamed && (
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

          {/* 2. 连接配置：引擎与音色到上方选择区定，这里只填连通三件套 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-300">
              <Plug className="w-3.5 h-3.5 text-amber-500" />
              <span>神经语音连接</span>
              <span className="text-[10px] font-mono text-stone-400">
                {editEngine === 'system'
                  ? '未启用'
                  : editEngine === 'azure-speech'
                    ? 'Azure·已选'
                    : '兼容端点·已选'}
              </span>
            </div>
              {editEngine === 'openai-compatible' && (
                <>
                  <div className="flex gap-1">
                    {OPENAI_ENDPOINT_PRESETS.map((p) => (
                      <Button
                        key={p.value}
                        type="button"
                        size="sm"
                        variant={editUrl === p.value ? 'default' : 'outline'}
                        className="flex-1 h-7 text-[11px]"
                        onClick={() => {
                          sound.playClick();
                          setEditUrl(p.value);
                        }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
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
                    <Select value={editRegion} onValueChange={(v) => v && setEditRegion(v)}>
                      <SelectTrigger className="h-8 text-[11px]">
                        <SelectValue placeholder="选择区域，如 japaneast">
                          {azureRegionTriggerLabel}
                        </SelectValue>
                      </SelectTrigger>
                    <SelectContent>
                      {AZURE_REGIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-stone-400 leading-relaxed">
                    Azure Speech 原生 REST：选区域 + 填 Key 即可，音色不选按语种用默认神经音色。
                  </p>
                </>
              )}
            {editEngine !== 'system' && (
              <input
                type="password"
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder="API Key（可空传本地服务；仅存本机）"
                autoComplete="off"
                className="w-full p-2 text-[11px] font-mono rounded-lg bg-white dark:bg-[#131211] border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
              />
            )}
                <p className="text-[10px] text-stone-400 leading-relaxed">
                  Key 随本次请求发往本机网关代调第三方，网关不落盘。先验证再保存。
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-[11px]"
                    disabled={validating}
                    onClick={() => void handleValidateNeural()}
                  >
                    {validating ? '验证中…' : '验证有效性'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-[11px]"
                    disabled={testingNeural}
                    onClick={handleTestNeural}
                  >
                    {testingNeural ? '试播中…' : '试播验证'}
                  </Button>
                </div>
            <Button type="button" size="sm" className="w-full h-7 text-[11px]" onClick={handleSaveNeural}>
              保存语音配置
            </Button>
          </div>

          <div className="h-px bg-stone-100 dark:bg-stone-800/80" />

          {/* 3. 词典包：内容按需进入 SQLite，避免初装体积与无授权数据混入。 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-300">
              <BookOpen className="w-3.5 h-3.5 text-amber-500" />
              <span>离线词典包</span>
            </div>
            {installableDictionaries.length > 0 ? (
              <div className="space-y-2">
                {installableDictionaries.map((dictionary) => (
                  <div
                    key={dictionary.id}
                    className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-2.5 dark:border-stone-800 dark:bg-stone-900/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-stone-800 dark:text-stone-200">
                          {dictionaryLangLabel(dictionary.language)}释义 · {dictionary.provider}
                        </p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500 dark:text-stone-400">
                          {dictionary.installed
                            ? `已写入本机 SQLite${dictionary.entryCount ? ` · ${dictionary.entryCount.toLocaleString()} 条` : ''}`
                            : dictionary.installerReady === false
                              ? '安装器即将推出，暂不可安装。'
                              : '未预装；仅在你点击安装后下载并写入本机 SQLite。'}
                        </p>
                      </div>
                      {dictionary.installed ? (
                        <Badge variant="outline" className="shrink-0 border-emerald-500/30 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="mr-1 h-3 w-3" />已安装
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                          disabled={!isConnected || installDictionaryPackage.isPending || dictionary.installerReady === false}
                          onClick={() => handleInstallDictionary(dictionary.id)}
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
                      {dictionary.licenseName} · 已保留来源与署名
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-stone-500">正在读取词典包状态…</p>
            )}
          </div>

          <div className="h-px bg-stone-100 dark:bg-stone-800/80" />

          {/* 4. 学情画像与打卡目标入口 */}
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

          {/* 5. 桌面端数据管理（仅 Tauri 壳内可见） */}
          {isDesktop && (
            <>
              <div className="h-px bg-stone-100 dark:bg-stone-800/80" />
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-300">
                  <DatabaseBackup className="w-3.5 h-3.5 text-amber-500" />
                  <span>学习数据管理</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600 dark:text-amber-400">
                    桌面端
                  </Badge>
                </div>
                <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-2.5 dark:border-stone-800 dark:bg-stone-900/50">
                  <p className="text-[10px] leading-relaxed text-stone-500 dark:text-stone-400">
                    学习库保存在本机应用数据目录，随应用重启保留。建议定期备份；恢复时把备份文件放回原目录并重启应用即可。
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 gap-1 px-2 text-[11px]"
                    disabled={backupPending}
                    onClick={() => void handleBackupDatabase()}
                  >
                    {backupPending ? (
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    备份学习数据库
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
