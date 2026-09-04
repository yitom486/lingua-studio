import React, { useState, useMemo } from 'react';
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
} from '../queries/useLearnerQueries.js';
import type { KanaItem } from '@study-studio/protocol';
import type { AiTutorContext } from './AiTutorDrawer.js';

interface KanaStudioWorkbenchProps {
  onOpenTutor?: (ctx: AiTutorContext) => void;
}

type MatrixTab = 'SEION' | 'DAKUON_HANDAKUON' | 'YOON';
type ScriptDisplayMode = 'HIRAGANA' | 'KATAKANA' | 'BOTH';
type DrillMode = 'AUDIO_TO_KANA' | 'KANA_TO_ROMAJI' | 'HIRA_TO_KATA';

export function KanaStudioWorkbench({ onOpenTutor }: KanaStudioWorkbenchProps) {
  const { data: allKana = [] } = useCurriculumKanaQuery();
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

  // 生成自测题
  const drillItems = useMemo(() => {
    const source = allKana.length > 0 ? allKana : filteredKanaList;
    if (source.length === 0) return [];
    // 随机打乱
    return [...source].sort(() => 0.5 - Math.random());
  }, [allKana, filteredKanaList]);

  const currentDrillKana: KanaItem | undefined = drillItems[drillIndex];

  // 生成选项
  const drillOptions = useMemo(() => {
    if (!currentDrillKana || drillItems.length === 0) return [];

    let correctAnswer = '';
    if (drillMode === 'AUDIO_TO_KANA') {
      correctAnswer = scriptMode === 'KATAKANA' ? currentDrillKana.katakana : currentDrillKana.hiragana;
    } else if (drillMode === 'KANA_TO_ROMAJI') {
      correctAnswer = currentDrillKana.romaji;
    } else {
      correctAnswer = currentDrillKana.katakana;
    }

    const distractors = drillItems
      .filter((k) => k.id !== currentDrillKana.id)
      .slice(0, 3)
      .map((k) => {
        if (drillMode === 'AUDIO_TO_KANA') {
          return scriptMode === 'KATAKANA' ? k.katakana : k.hiragana;
        } else if (drillMode === 'KANA_TO_ROMAJI') {
          return k.romaji;
        } else {
          return k.katakana;
        }
      });

    return [correctAnswer, ...distractors].sort(() => 0.5 - Math.random());
  }, [currentDrillKana, drillItems, drillMode, scriptMode]);

  // 提交自测作答
  const handleSelectDrillOption = (option: string) => {
    if (isAnswered || !currentDrillKana) return;

    setSelectedOption(option);
    setIsAnswered(true);

    let isCorrect = false;
    if (drillMode === 'AUDIO_TO_KANA') {
      isCorrect =
        option ===
        (scriptMode === 'KATAKANA' ? currentDrillKana.katakana : currentDrillKana.hiragana);
    } else if (drillMode === 'KANA_TO_ROMAJI') {
      isCorrect = option === currentDrillKana.romaji;
    } else {
      isCorrect = option === currentDrillKana.katakana;
    }

    if (isCorrect) {
      sound.playCorrect();
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
    }
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
                  第 {drillIndex + 1} / {drillItems.length} 题
                </span>
              </div>

              <div className="flex items-center gap-3">
                {drillStreak > 0 && (
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                    <Flame className="w-4 h-4 fill-amber-500 text-amber-500 animate-pulse" />
                    <span>{drillStreak} 连对</span>
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
                  }}
                  className="text-xs rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-2 py-1"
                >
                  <option value="AUDIO_TO_KANA">听音辨字</option>
                  <option value="KANA_TO_ROMAJI">看字辨音</option>
                  <option value="HIRA_TO_KATA">平片互转</option>
                </select>
              </div>
            </div>

            {/* 题干区域 */}
            {currentDrillKana && (
              <div className="text-center py-6 space-y-4">
                {drillMode === 'AUDIO_TO_KANA' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-stone-500">听发音，点击选择正确的假名：</p>
                    <button
                      onClick={() => handlePlayAudio(currentDrillKana)}
                      className="mx-auto w-20 h-20 rounded-full bg-amber-500/15 border-2 border-amber-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all text-amber-700 dark:text-amber-300 shadow-sm"
                    >
                      <Volume2 className="w-8 h-8" />
                    </button>
                  </div>
                ) : drillMode === 'KANA_TO_ROMAJI' ? (
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
                    if (drillMode === 'AUDIO_TO_KANA') {
                      isCorrectOpt =
                        opt ===
                        (scriptMode === 'KATAKANA'
                          ? currentDrillKana.katakana
                          : currentDrillKana.hiragana);
                    } else if (drillMode === 'KANA_TO_ROMAJI') {
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
