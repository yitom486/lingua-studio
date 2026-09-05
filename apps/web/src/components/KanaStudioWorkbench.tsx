import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2,
  Sparkles,
  Layers,
  HelpCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Bot,
  Flame,
  Award,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { sound, speechStudio } from '../utils/audio.js';
import { fireSuccessConfetti, ShimmerButton } from './magicui/index.js';
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from './ui/tabs.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import {
  useCurriculumKanaQuery,
  useKanaPracticeMutation,
  useGenerateKanaWordsMutation,
  useCollectDictionaryEntryMutation,
  type KanaWordItem,
} from '../queries/useLearnerQueries.js';
import { romajiToKana, toHiragana } from '../lib/kana-input.js';
import { confusionDistractors } from '../lib/kana-confusion.js';
import type { KanaItem } from '@study-studio/protocol';
import type { AiTutorContext } from './AiTutorDrawer.js';

interface KanaStudioWorkbenchProps {
  onOpenTutor?: (ctx: AiTutorContext) => void;
}

type MatrixTab = 'SEION' | 'DAKUON_HANDAKUON' | 'YOON';
type ScriptDisplayMode = 'HIRAGANA' | 'KATAKANA' | 'BOTH';
type DrillMode = 'AUDIO_TO_KANA' | 'KANA_TO_ROMAJI' | 'HIRA_TO_KATA' | 'WORD_DICTATION' | 'WORD_MEANING' | 'MIXED';
type RecognitionMode = 'AUDIO_TO_KANA' | 'KANA_TO_ROMAJI' | 'HIRA_TO_KATA';
const RECOGNITION_MODES: RecognitionMode[] = ['AUDIO_TO_KANA', 'KANA_TO_ROMAJI', 'HIRA_TO_KATA'];
/** 题量档（0 = 全部）。 */

/** 按读音猜书写体（回写画像用；混合书写回退 HIRAGANA）。 */
function guessWordScript(kana: string): 'HIRAGANA' | 'KATAKANA' {
  const hasKata = /[\u30A0-\u30FF]/.test(kana);
  const hasHira = /[\u3040-\u309F]/.test(kana);
  return hasKata && !hasHira ? 'KATAKANA' : 'HIRAGANA';
}

export function KanaStudioWorkbench({ onOpenTutor }: KanaStudioWorkbenchProps) {
  const { data: allKana = [], refetch: refetchKana, isLoading: isKanaLoading } = useCurriculumKanaQuery();
  const practiceMutation = useKanaPracticeMutation();

  // 界面状态
  const [matrixTab, setMatrixTab] = useState<MatrixTab>('SEION');
  const [scriptMode, setScriptMode] = useState<ScriptDisplayMode>('HIRAGANA');
  const [showRomaji, setShowRomaji] = useState(true);
  const [activeKana, setActiveKana] = useState<KanaItem | null>(null);

  // 自测考核模式状态
  const [isDrillActive, setIsDrillActive] = useState(false);
  const [drillMode, setDrillMode] = useState<DrillMode>('AUDIO_TO_KANA');
  const [drillIndex, setDrillIndex] = useState(0);
  const [drillStreak, setDrillStreak] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  // 题量与本轮战报（切模式/题量/重开自动清零）
  const [drillCount, setDrillCount] = useState<number>(0);
  const [drillAnswered, setDrillAnswered] = useState(0);
  const [drillCorrect, setDrillCorrect] = useState(0);

  const resetRoundStats = () => {
    setDrillAnswered(0);
    setDrillCorrect(0);
  };

  // 单词巩固（听写 / 词义）：词表来自 Gateway 本地词典，Agent 经 learning.content 同源调用
  const generateWords = useGenerateKanaWordsMutation();
  const collectEntry = useCollectDictionaryEntryMutation();
  const [wordList, setWordList] = useState<KanaWordItem[]>([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [wordInput, setWordInput] = useState('');
  // 学练一体：每词先学（看读音释义+跟读）再测，切词/切模式自动回到学
  const [wordStudyDone, setWordStudyDone] = useState(false);
  const isWordMode = drillMode === 'WORD_DICTATION' || drillMode === 'WORD_MEANING';
  const currentWord: KanaWordItem | undefined = wordList[wordIndex];

  useEffect(() => {
    if (!isDrillActive || !isWordMode || wordList.length > 0 || generateWords.isPending) return;
    generateWords.mutate(
      { count: 8, script: scriptMode === 'KATAKANA' ? 'KATAKANA' : 'HIRAGANA' },
      {
        onSuccess: (words) => {
          setWordList(words);
          setWordIndex(0);
        },
        onError: () => {
          toast.error('假名单词加载失败，请稍后重试。');
        },
      }
    );
  }, [isDrillActive, isWordMode, wordList.length, scriptMode, generateWords.isPending, generateWords.mutate]);

  // 新词切出即自动播报（学阶段跟读用；作答后不再重播）
  useEffect(() => {
    if (!isDrillActive || drillMode !== 'WORD_DICTATION' || !currentWord) return;
    void speechStudio.speak(currentWord.audioText || currentWord.kana, { lang: 'JA' });
  }, [isDrillActive, drillMode, currentWord]);

  // 矩阵分类过滤
  const filteredKanaList = useMemo(() => {
    if (matrixTab === 'SEION') {
      return allKana.filter((k) => k.type === 'SEION' || k.type === 'SPECIAL');
    }
    if (matrixTab === 'DAKUON_HANDAKUON') {
      return allKana.filter((k) => k.type === 'DAKUON' || k.type === 'HANDAKUON');
    }
    return allKana.filter((k) => k.type === 'YOON');
  }, [allKana, matrixTab]);

  // 按“行”组织假名
  const groupedByRow = useMemo(() => {
    const map = new Map<string, KanaItem[]>();
    for (const item of filteredKanaList) {
      if (!map.has(item.row)) {
        map.set(item.row, []);
      }
      map.get(item.row)!.push(item);
    }
    return Array.from(map.entries()).map(([rowName, items]) => ({
      rowName,
      items: items.sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  }, [filteredKanaList]);

  // 播放假名发音
  const handlePlayAudio = (kana: KanaItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    sound.playClick();
    speechStudio.speak(kana.audioText, { lang: 'JA' });
  };

  // 点击卡片聚焦
  const handleSelectKana = (kana: KanaItem) => {
    handlePlayAudio(kana);
    setActiveKana(kana);
  };

  // 生成自测题（按题量截断，0 = 全部）
  const drillItems = useMemo(() => {
    const source = allKana.length > 0 ? allKana : filteredKanaList;
    if (source.length === 0) return [];
    // 随机打乱
    const shuffled = [...source].sort(() => 0.5 - Math.random());
    return drillCount > 0 ? shuffled.slice(0, drillCount) : shuffled;
  }, [allKana, filteredKanaList, drillCount]);

  const currentDrillKana: KanaItem | undefined = drillItems[drillIndex];

  // 混合模式：每题题型提前排好，作答中途不变
  const mixedPlan = useMemo<RecognitionMode[]>(() => {
    if (drillMode !== 'MIXED') return [];
    return drillItems.map(
      () => RECOGNITION_MODES[Math.floor(Math.random() * RECOGNITION_MODES.length)]!
    );
  }, [drillMode, drillItems]);

  // 当前题实际生效题型（混合模式按排表，其余直通）
  const activeMode: DrillMode =
    drillMode === 'MIXED' ? (mixedPlan[drillIndex] ?? 'AUDIO_TO_KANA') : drillMode;

  // 生成选项（混淆优先：同行/同首字/浊音/同段，不足再随机补齐）
  const drillOptions = useMemo(() => {
    if (!currentDrillKana || drillItems.length === 0) return [];

    let correctAnswer = '';
    if (activeMode === 'AUDIO_TO_KANA') {
      correctAnswer = scriptMode === 'KATAKANA' ? currentDrillKana.katakana : currentDrillKana.hiragana;
    } else if (activeMode === 'KANA_TO_ROMAJI') {
      correctAnswer = currentDrillKana.romaji;
    } else {
      correctAnswer = currentDrillKana.katakana;
    }

    const pool = allKana.length > 0 ? allKana : drillItems;
    const distractors = confusionDistractors(
      currentDrillKana,
      pool,
      scriptMode === 'KATAKANA' ? 'KATAKANA' : 'HIRAGANA',
      3
    );

    return [correctAnswer, ...distractors].sort(() => 0.5 - Math.random());
  }, [currentDrillKana, drillItems, allKana, activeMode, scriptMode]);

  // 提交自测作答
  const handleSelectDrillOption = (option: string) => {
    if (isAnswered || !currentDrillKana) return;

    setSelectedOption(option);
    setIsAnswered(true);

    let isCorrect = false;
    if (activeMode === 'AUDIO_TO_KANA') {
      isCorrect =
        option ===
        (scriptMode === 'KATAKANA' ? currentDrillKana.katakana : currentDrillKana.hiragana);
    } else if (activeMode === 'KANA_TO_ROMAJI') {
      isCorrect = option === currentDrillKana.romaji;
    } else {
      isCorrect = option === currentDrillKana.katakana;
    }

    setDrillAnswered((n) => n + 1);
    if (isCorrect) {
      sound.playCorrect();
      setDrillCorrect((n) => n + 1);
      setDrillStreak((s) => s + 1);
      toast.success('回答正确！+1');
      if ((drillStreak + 1) % 5 === 0) {
        fireSuccessConfetti();
      }
    } else {
      sound.playMistake();
      setDrillStreak(0);
      toast.error(`回答有误，正确答案为: ${currentDrillKana.hiragana} (${currentDrillKana.romaji})`);
    }

    // 回写 Gateway SQLite 画像与足迹
    practiceMutation.mutate({
      kanaId: currentDrillKana.id,
      isCorrect,
      scriptType: scriptMode === 'KATAKANA' ? 'KATAKANA' : 'HIRAGANA',
    });
  };

  // 下一题
  const handleNextDrill = () => {
    sound.playClick();
    setSelectedOption(null);
    setIsAnswered(false);
    if (drillIndex < drillItems.length - 1) {
      setDrillIndex((i) => i + 1);
    } else {
      fireSuccessConfetti();
      toast.success('恭喜完成本轮假名自测！');
      setDrillIndex(0);
      resetRoundStats();
    }
  };

  // 词义选项（正确释义 + 同批其余词干扰项）
  const meaningOptions = useMemo(() => {
    if (!currentWord) return [];
    const correct = currentWord.meanings[0] ?? '';
    const distractors = wordList
      .filter((w) => w.id !== currentWord.id)
      .map((w) => w.meanings[0] ?? '')
      .filter((m) => m && m !== correct)
      .slice(0, 3);
    return [correct, ...distractors].sort(() => 0.5 - Math.random());
  }, [currentWord, wordList]);

  const recordWordResult = (isCorrect: boolean) => {
    if (!currentWord) return;
    practiceMutation.mutate({
      kanaId: currentWord.entryId,
      isCorrect,
      scriptType: guessWordScript(currentWord.kana),
    });
  };

  // 单词听写提交：罗马字输入即时转假名比对（规则判定 0ms；主观写作仍走 learning.assess）
  const handleSubmitWordInput = () => {
    if (isAnswered || !currentWord) return;
    const converted = romajiToKana(
      wordInput.trim(),
      allKana,
      scriptMode === 'KATAKANA' ? 'KATAKANA' : 'HIRAGANA'
    );
    const isCorrect =
      converted !== '' && toHiragana(converted) === toHiragana(currentWord.kana);
    setIsAnswered(true);
    setDrillAnswered((n) => n + 1);
    if (isCorrect) {
      sound.playCorrect();
      setDrillCorrect((n) => n + 1);
      setDrillStreak((s) => s + 1);
      toast.success('拼写正确！+1');
      if ((drillStreak + 1) % 5 === 0) {
        fireSuccessConfetti();
      }
    } else {
      sound.playMistake();
      setDrillStreak(0);
      toast.error(`拼写有误，正确答案为: ${currentWord.kana}`);
    }
    recordWordResult(isCorrect);
  };

  // 词义回想提交
  const handleSelectMeaningOption = (option: string) => {
    if (isAnswered || !currentWord) return;
    setSelectedOption(option);
    setIsAnswered(true);
    const correct = currentWord.meanings[0] ?? '';
    const isCorrect = option === correct;
    setDrillAnswered((n) => n + 1);
    if (isCorrect) {
      sound.playCorrect();
      setDrillCorrect((n) => n + 1);
      setDrillStreak((s) => s + 1);
      toast.success('回答正确！+1');
      if ((drillStreak + 1) % 5 === 0) {
        fireSuccessConfetti();
      }
    } else {
      sound.playMistake();
      setDrillStreak(0);
      toast.error(`回答有误，正确释义为: ${correct}`);
    }
    recordWordResult(isCorrect);
  };

  // 单词一键转 FSRS 生词卡（导出）
  const handleCollectWord = () => {
    if (!currentWord) return;
    collectEntry.mutate(currentWord.entryId, {
      onSuccess: () => toast.success(`已加入生词本：${currentWord.headword}`),
      onError: () => toast.error('加入生词本失败，请稍后重试。'),
    });
  };

  // 下一词 / 换一批
  const handleNextWord = () => {
    sound.playClick();
    setSelectedOption(null);
    setIsAnswered(false);
    setWordInput('');
    setWordStudyDone(false);
    if (wordIndex < wordList.length - 1) {
      setWordIndex((i) => i + 1);
    } else {
      fireSuccessConfetti();
      toast.success('本轮单词巩固完成！');
      setWordIndex(0);
      resetRoundStats();
    }
  };

  const handleRefreshWords = () => {
    sound.playClick();
    setWordList([]);
    setWordIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setWordInput('');
    setWordStudyDone(false);
    resetRoundStats();
  };

  // 呼出导师深度解析
  const handleAskTutor = (kana: KanaItem) => {
    sound.playClick();
    onOpenTutor?.({
      questionText: `请深度剖析日语假名「${kana.hiragana}」与「${kana.katakana}」(${kana.romaji})的字源笔顺、易混淆假名对照及标准发音要领：`,
      correctAnswer: `${kana.hiragana} / ${kana.katakana} (${kana.romaji})`,
      skillTag: '五十音权威底座 · 假名解构',
      explanation: `假名【${kana.hiragana}】(${kana.romaji})，${kana.mnemonic || '标准发音单元'}。注意发音嘴形与送气控制。`,
    });
  };

  return (
    <div className="space-y-6">
      {/* 顶部控制与切换栏 */}
      <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-4 sm:p-6 border border-amber-900/10 dark:border-amber-500/15 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="amber">课程底座</Badge>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                权威字形 · 标准发音 · 熟练度回写
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-stone-900 dark:text-stone-100 mt-1">
              五十音工作室 (Kana Studio)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 平/片假名切换 */}
            <div className="flex items-center bg-stone-200/70 dark:bg-stone-800/80 rounded-xl p-1 text-xs">
              <button
                onClick={() => {
                  sound.playClick();
                  setScriptMode('HIRAGANA');
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  scriptMode === 'HIRAGANA'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm font-bold'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                平假名
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  setScriptMode('KATAKANA');
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  scriptMode === 'KATAKANA'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm font-bold'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                片假名
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  setScriptMode('BOTH');
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  scriptMode === 'BOTH'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm font-bold'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                平片对照
              </button>
            </div>

            {/* 罗马音注音显示开关 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                sound.playClick();
                setShowRomaji(!showRomaji);
              }}
              className="text-xs gap-1.5"
            >
              <span>罗马字: {showRomaji ? '开' : '关'}</span>
            </Button>

            {/* 自测模式切换 */}
            <ShimmerButton
              onClick={() => {
                sound.playClick();
                setIsDrillActive(!isDrillActive);
                setSelectedOption(null);
                setIsAnswered(false);
                setWordIndex(0);
                setWordInput('');
                setWordStudyDone(false);
                resetRoundStats();
              }}
              className="px-3.5 py-1.5 text-xs font-semibold gap-1.5 shadow-md"
            >
              <Award className="w-3.5 h-3.5" />
              <span>{isDrillActive ? '返回假名矩阵' : '启动假名自测'}</span>
            </ShimmerButton>
          </div>
        </div>

        {/* 矩阵选项卡 (清音 / 浊音&半浊音 / 拗音) */}
        {!isDrillActive && (
          <div className="mt-4 pt-4 border-t border-amber-900/10 dark:border-amber-500/10 flex items-center justify-between">
            <Tabs
              value={matrixTab}
              onValueChange={(val) => {
                if (!val) return;
                sound.playClick();
                setMatrixTab(val as MatrixTab);
              }}
            >
              <TabsList className="bg-transparent p-0 border-0">
                <TabsIndicator className="bg-amber-500 shadow-sm" />
                <TabsTrigger value="SEION" className="px-3 py-1.5 text-xs data-[selected]:text-stone-950">
                  清音矩阵 (46)
                </TabsTrigger>
                <TabsTrigger value="DAKUON_HANDAKUON" className="px-3 py-1.5 text-xs data-[selected]:text-stone-950">
                  浊音与半浊音 (25)
                </TabsTrigger>
                <TabsTrigger value="YOON" className="px-3 py-1.5 text-xs data-[selected]:text-stone-950">
                  常用拗音 (33)
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <span className="text-xs text-stone-400 font-mono hidden sm:inline">
              点击格子即听发音 · 双击/聚焦查看字源解构
            </span>
          </div>
        )}
      </div>

      {/* 核心主展区：矩阵模式 vs 自测模式 */}
      <AnimatePresence mode="wait">
        {isDrillActive ? (
          /* ================= 自测模式 (Kana Drill) ================= */
          <motion.div
            key="drill"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="max-w-2xl mx-auto bg-[#faf9f6] dark:bg-[#1a1816] rounded-3xl p-6 sm:p-8 border border-amber-900/15 dark:border-amber-500/20 shadow-md space-y-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="amber">考核冲刺</Badge>
                <span className="text-xs text-stone-500">
                  {isWordMode ? (
                    wordList.length === 0 ? (
                      <>{generateWords.isPending ? '抽词中…' : '暂无词语'}</>
                    ) : (
                      <>第 {wordIndex + 1} / {wordList.length} 词</>
                    )
                  ) : drillItems.length === 0 ? (
                    <>暂无题目</>
                  ) : (
                    <>第 {drillIndex + 1} / {drillItems.length} 题</>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {drillStreak > 0 && (
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                    <Flame className="w-4 h-4 fill-amber-500 text-amber-500 animate-pulse" />
                    <span>{drillStreak} 连对</span>
                  </div>
                )}
                {drillAnswered > 0 && (
                  <div
                    className="text-xs text-stone-500 dark:text-stone-400"
                    title="本轮战报会随画像回写，导师可见你的假名薄弱项"
                  >
                    本轮 {drillCorrect}/{drillAnswered} ·{' '}
                    {Math.round((drillCorrect / drillAnswered) * 100)}%
                  </div>
                )}
                {/* 自测题型切换 */}
                <select
                  value={drillMode}
                  onChange={(e) => {
                    sound.playClick();
                    setDrillMode(e.target.value as DrillMode);
                    setSelectedOption(null);
                    setIsAnswered(false);
                    setWordIndex(0);
                    setWordInput('');
                    setWordStudyDone(false);
                    resetRoundStats();
                  }}
                  className="text-xs rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-2 py-1"
                >
                  <option value="AUDIO_TO_KANA">听音辨字</option>
                  <option value="KANA_TO_ROMAJI">看字辨音</option>
                  <option value="HIRA_TO_KATA">平片互转</option>
                  <option value="MIXED">综合混合</option>
                  <option value="WORD_DICTATION">单词听写</option>
                  <option value="WORD_MEANING">词义回想</option>
                </select>
                {!isWordMode && (
                  <select
                    value={drillCount}
                    onChange={(e) => {
                      sound.playClick();
                      setDrillCount(Number(e.target.value));
                      setDrillIndex(0);
                      setSelectedOption(null);
                      setIsAnswered(false);
                      resetRoundStats();
                    }}
                    title="每轮题量"
                    className="text-xs rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-2 py-1"
                  >
                    <option value={10}>10 题</option>
                    <option value={20}>20 题</option>
                    <option value={50}>50 题</option>
                    <option value={0}>全部</option>
                  </select>
                )}
              </div>
            </div>

            {/* 题干区域 */}
            {isWordMode ? (
              <div className="text-center py-6 space-y-4">
                {!currentWord ? (
                  <p className="text-xs text-stone-500">
                    {generateWords.isPending ? '正在从本地词典抽词…' : '暂无可用词语，请先安装日语词典包。'}
                  </p>
                ) : !wordStudyDone ? (
                  <div className="space-y-4">
                    <p className="text-xs text-stone-500">先学：看读音释义、跟读两遍，再去测验</p>
                    <div className="text-6xl font-serif font-bold text-stone-900 dark:text-stone-100">
                      {currentWord.kana}
                    </div>
                    <p className="text-sm text-stone-500 dark:text-stone-400">
                      {currentWord.headword}
                    </p>
                    <p className="text-sm text-stone-700 dark:text-stone-200">
                      {currentWord.meanings.join('；')}
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <Button
                        onClick={() => {
                          sound.playClick();
                          void speechStudio.speak(currentWord.audioText || currentWord.kana, { lang: 'JA' });
                        }}
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        跟读
                      </Button>
                      <Button
                        onClick={() => {
                          sound.playClick();
                          setWordStudyDone(true);
                        }}
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-6"
                      >
                        记住了，去测验 ➔
                      </Button>
                    </div>
                  </div>
                ) : drillMode === 'WORD_DICTATION' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-stone-500">听发音，用罗马字拼出假名（自动转换）：</p>
                    <button
                      onClick={() => {
                        sound.playClick();
                        void speechStudio.speak(currentWord.audioText || currentWord.kana, { lang: 'JA' });
                      }}
                      className="mx-auto w-20 h-20 rounded-full bg-amber-500/15 border-2 border-amber-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all text-amber-700 dark:text-amber-300 shadow-sm"
                    >
                      <Volume2 className="w-8 h-8" />
                    </button>
                    <p className="text-sm text-stone-600 dark:text-stone-300">
                      词义提示：{currentWord.meanings.join('；')}
                    </p>
                    <p className="text-4xl font-serif font-bold text-stone-900 dark:text-stone-100 min-h-[3rem]">
                      {wordInput
                        ? romajiToKana(wordInput, allKana, scriptMode === 'KATAKANA' ? 'KATAKANA' : 'HIRAGANA') || '···'
                        : '···'}
                    </p>
                    <div className="flex items-center justify-center gap-2 max-w-md mx-auto">
                      <input
                        value={wordInput}
                        onChange={(e) => setWordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSubmitWordInput();
                        }}
                        disabled={isAnswered}
                        placeholder="输入罗马字，如 ame（长音用 -，如 konpyu-ta-）"
                        className="flex-1 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-sm font-mono"
                      />
                      {!isAnswered && (
                        <Button onClick={handleSubmitWordInput} size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-5">
                          提交
                        </Button>
                      )}
                    </div>
                    {isAnswered && (
                      <p className="text-sm text-stone-600 dark:text-stone-300">
                        正确答案：<span className="font-bold font-serif">{currentWord.kana}</span>
                        <span className="text-stone-400">（{currentWord.headword}）</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-stone-500">看单词，选择正确的中文释义：</p>
                    <div className="text-6xl font-serif font-bold text-stone-900 dark:text-stone-100">
                      {currentWord.kana}
                    </div>
                    <button
                      onClick={() => {
                        sound.playClick();
                        void speechStudio.speak(currentWord.audioText || currentWord.kana, { lang: 'JA' });
                      }}
                      className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      🔊 播放发音
                    </button>
                    <div className="grid grid-cols-1 gap-3 pt-2 max-w-md mx-auto">
                      {meaningOptions.map((opt, idx) => {
                        const correct = currentWord.meanings[0] ?? '';
                        const isCorrectOpt = opt === correct;
                        const isSelected = selectedOption === opt;
                        let btnStyle =
                          'bg-white dark:bg-stone-800/80 border-stone-200 dark:border-stone-700 hover:border-amber-500/50';
                        if (isAnswered) {
                          if (isCorrectOpt) {
                            btnStyle = 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-bold';
                          } else if (isSelected) {
                            btnStyle = 'bg-rose-500/15 border-rose-500 text-rose-800 dark:text-rose-300';
                          } else {
                            btnStyle = 'opacity-40 border-stone-200 dark:border-stone-800';
                          }
                        }
                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelectMeaningOption(opt)}
                            disabled={isAnswered}
                            className={`p-3 rounded-2xl border text-sm transition-all ${btnStyle}`}
                          >
                            <span>{opt}</span>
                            {isAnswered && isCorrectOpt && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 inline ml-2" />
                            )}
                            {isAnswered && isSelected && !isCorrectOpt && (
                              <XCircle className="w-4 h-4 text-rose-500 inline ml-2" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 单词作答后操作区：转生词卡 / 换一批 / 下一词 */}
                {isAnswered && (
                  <div className="flex items-center justify-center gap-3 pt-4">
                    <Button
                      onClick={handleCollectWord}
                      disabled={collectEntry.isPending}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs text-amber-700 dark:text-amber-300"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      转生词卡
                    </Button>
                    <Button onClick={handleRefreshWords} variant="outline" size="sm" className="gap-1.5 text-xs">
                      <RefreshCw className="w-3.5 h-3.5" />
                      换一批
                    </Button>
                    <Button
                      onClick={handleNextWord}
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-6"
                    >
                      下一词 ➔
                    </Button>
                  </div>
                )}
              </div>
            ) : currentDrillKana ? (
              <div className="text-center py-6 space-y-4">
                {activeMode === 'AUDIO_TO_KANA' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-stone-500">听发音，点击选择正确的假名：</p>
                    <button
                      onClick={() => handlePlayAudio(currentDrillKana)}
                      className="mx-auto w-20 h-20 rounded-full bg-amber-500/15 border-2 border-amber-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all text-amber-700 dark:text-amber-300 shadow-sm"
                    >
                      <Volume2 className="w-8 h-8" />
                    </button>
                  </div>
                ) : activeMode === 'KANA_TO_ROMAJI' ? (
                  <div className="space-y-2">
                    <p className="text-xs text-stone-500">看假名，选择正确的罗马字发音：</p>
                    <div className="text-6xl font-serif font-bold text-stone-900 dark:text-stone-100">
                      {scriptMode === 'KATAKANA'
                        ? currentDrillKana.katakana
                        : currentDrillKana.hiragana}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-stone-500">平假名 ➔ 选出对应的片假名：</p>
                    <div className="text-6xl font-serif font-bold text-stone-900 dark:text-stone-100">
                      {currentDrillKana.hiragana}
                    </div>
                  </div>
                )}

                {/* 选项矩阵 (4 选 1) */}
                <div className="grid grid-cols-2 gap-3 pt-4 max-w-md mx-auto">
                  {drillOptions.map((opt, idx) => {
                    let isCorrectOpt = false;
                    if (activeMode === 'AUDIO_TO_KANA') {
                      isCorrectOpt =
                        opt ===
                        (scriptMode === 'KATAKANA'
                          ? currentDrillKana.katakana
                          : currentDrillKana.hiragana);
                    } else if (activeMode === 'KANA_TO_ROMAJI') {
                      isCorrectOpt = opt === currentDrillKana.romaji;
                    } else {
                      isCorrectOpt = opt === currentDrillKana.katakana;
                    }

                    const isSelected = selectedOption === opt;

                    let btnStyle =
                      'bg-white dark:bg-stone-800/80 border-stone-200 dark:border-stone-700 hover:border-amber-500/50';
                    if (isAnswered) {
                      if (isCorrectOpt) {
                        btnStyle = 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-bold';
                      } else if (isSelected) {
                        btnStyle = 'bg-rose-500/15 border-rose-500 text-rose-800 dark:text-rose-300';
                      } else {
                        btnStyle = 'opacity-40 border-stone-200 dark:border-stone-800';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectDrillOption(opt)}
                        disabled={isAnswered}
                        className={`p-4 rounded-2xl border text-xl font-serif font-bold transition-all flex items-center justify-center gap-2 ${btnStyle}`}
                      >
                        <span>{opt}</span>
                        {isAnswered && isCorrectOpt && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        )}
                        {isAnswered && isSelected && !isCorrectOpt && (
                          <XCircle className="w-4 h-4 text-rose-500" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* 作答后操作区 */}
                {isAnswered && (
                  <div className="flex items-center justify-center gap-3 pt-4">
                    <Button
                      onClick={() => handleAskTutor(currentDrillKana)}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs text-amber-700 dark:text-amber-300"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      问 AI 导师
                    </Button>
                    <Button
                      onClick={handleNextDrill}
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-6"
                    >
                      下一题 ➔
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 space-y-4">
                <p className="text-xs text-stone-500">
                  {isKanaLoading
                    ? '正在加载假名表…'
                    : '假名表为空：请确认网关已启动（默认 localhost:8080），然后重试。'}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    onClick={() => {
                      sound.playClick();
                      setIsDrillActive(false);
                    }}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    返回矩阵学习
                  </Button>
                  <Button
                    onClick={() => {
                      void refetchKana();
                    }}
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
                  >
                    重新加载
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          /* ================= 矩阵导览模式 ================= */
          <motion.div
            key="matrix"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4">
              {groupedByRow.map(({ rowName, items }) => (
                <div
                  key={rowName}
                  className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-3.5 sm:p-4 border border-amber-900/10 dark:border-amber-500/10 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="w-16 shrink-0 font-serif font-bold text-xs sm:text-sm text-stone-500 dark:text-stone-400 border-b sm:border-b-0 sm:border-r border-stone-200 dark:border-stone-800 pb-1 sm:pb-0 sm:pr-3">
                    {rowName}
                  </div>

                  <div className="flex-1 grid grid-cols-5 gap-2 sm:gap-3">
                    {items.map((kana) => {
                      const isActive = activeKana?.id === kana.id;
                      return (
                        <div
                          key={kana.id}
                          onClick={() => handleSelectKana(kana)}
                          className={`group relative p-2.5 sm:p-3.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col items-center justify-center gap-1 ${
                            isActive
                              ? 'bg-amber-500/15 border-amber-500 shadow-sm'
                              : 'bg-white dark:bg-stone-800/80 border-stone-200/80 dark:border-stone-700/80 hover:border-amber-500/50 hover:shadow-sm'
                          }`}
                        >
                          {/* 假名主字面 */}
                          <div className="text-xl sm:text-2xl font-serif font-bold text-stone-900 dark:text-stone-100 group-hover:scale-105 transition-transform flex items-baseline gap-1">
                            {scriptMode === 'HIRAGANA' && <span>{kana.hiragana}</span>}
                            {scriptMode === 'KATAKANA' && <span>{kana.katakana}</span>}
                            {scriptMode === 'BOTH' && (
                              <>
                                <span>{kana.hiragana}</span>
                                <span className="text-xs text-stone-400 font-sans font-normal">
                                  / {kana.katakana}
                                </span>
                              </>
                            )}
                          </div>

                          {/* 罗马音辅助注记 */}
                          {showRomaji && (
                            <div className="text-[11px] font-mono text-stone-400 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                              {kana.romaji}
                            </div>
                          )}

                          {/* 右上角试听小喇叭 */}
                          <button
                            onClick={(e) => handlePlayAudio(kana, e)}
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-stone-400 hover:text-amber-600"
                            title="播放发音"
                          >
                            <Volume2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 底部当前选中的假名解构卡片 */}
            {activeKana && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-500/10 dark:bg-amber-500/15 rounded-2xl p-4 sm:p-5 border border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-3xl font-serif font-bold text-stone-900 dark:text-stone-100">
                    {activeKana.hiragana}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-base text-stone-900 dark:text-stone-100">
                        平假名: {activeKana.hiragana} · 片假名: {activeKana.katakana}
                      </h4>
                      <Badge variant="amber" className="font-mono text-xs">
                        {activeKana.romaji}
                      </Badge>
                    </div>
                    <p className="text-xs text-stone-600 dark:text-stone-300 mt-1 font-serif">
                      💡 {activeKana.mnemonic || '标准五十音构成单元'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePlayAudio(activeKana)}
                    className="flex-1 sm:flex-none gap-1 text-xs"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    朗读发音
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleAskTutor(activeKana)}
                    className="flex-1 sm:flex-none gap-1 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    AI 假名点拨
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
