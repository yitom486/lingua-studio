import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Bot,
  Award,
} from 'lucide-react';
import { toast } from 'sonner';
import { sound, speechStudio } from '../utils/audio.js';
import { fireSuccessConfetti, ShimmerButton } from './magicui/index.js';
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from './ui/tabs.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import {
  useCurriculumHangulQuery,
  useHangulPracticeMutation,
} from '../queries/useLearnerQueries.js';
import type { HangulItem } from '@study-studio/protocol';
import type { AiTutorContext } from './AiTutorDrawer.js';

interface HangulStudioWorkbenchProps {
  onOpenTutor?: (ctx: AiTutorContext) => void;
}

type MatrixTab = 'CONSONANT' | 'VOWEL' | 'ADVANCED';
type DrillMode = 'AUDIO_TO_JAMO' | 'JAMO_TO_ROMA' | 'MIXED';
type RecognitionMode = 'AUDIO_TO_JAMO' | 'JAMO_TO_ROMA';
const RECOGNITION_MODES: RecognitionMode[] = ['AUDIO_TO_JAMO', 'JAMO_TO_ROMA'];
/** 题量档（0 = 全部）。 */
const DRILL_COUNTS = [10, 20, 0];

function shuffle<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = a;
  }
  return arr;
}

/** 同类池内取 3 个异项作干扰（按 sortOrder 就近优先，保证选项有迷惑性）。 */
function pickDistractors(target: HangulItem, pool: HangulItem[]): HangulItem[] {
  const others = pool.filter((h) => h.id !== target.id);
  others.sort((a, b) => Math.abs(a.sortOrder - target.sortOrder) - Math.abs(b.sortOrder - target.sortOrder));
  return shuffle(others.slice(0, Math.min(6, others.length))).slice(0, 3);
}

export function HangulStudioWorkbench({ onOpenTutor }: HangulStudioWorkbenchProps) {
  const { data: allHangul = [], refetch: refetchHangul, isLoading: isHangulLoading } = useCurriculumHangulQuery();
  const practiceMutation = useHangulPracticeMutation();

  // 矩阵状态
  const [matrixTab, setMatrixTab] = useState<MatrixTab>('CONSONANT');
  const [showRomaji, setShowRomaji] = useState(true);
  const [activeHangul, setActiveHangul] = useState<HangulItem | null>(null);

  // 自测状态
  const [isDrillActive, setIsDrillActive] = useState(false);
  const [drillMode, setDrillMode] = useState<DrillMode>('AUDIO_TO_JAMO');
  const [drillCount, setDrillCount] = useState<number>(10);
  const [plan, setPlan] = useState<HangulItem[]>([]);
  const [mixedPlan, setMixedPlan] = useState<RecognitionMode[]>([]);
  const [drillIndex, setDrillIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [drillAnswered, setDrillAnswered] = useState(0);
  const [drillCorrect, setDrillCorrect] = useState(0);
  const [roundDone, setRoundDone] = useState(false);

  // 题池跟随矩阵选项卡（进阶 = y 系母音 + 复合母音 + 收音代表音）
  const pool = useMemo(
    () =>
      matrixTab === 'ADVANCED'
        ? allHangul.filter((h) => h.type !== 'CONSONANT' && h.type !== 'VOWEL')
        : allHangul.filter((h) => h.type === matrixTab),
    [allHangul, matrixTab]
  );

  /** 进阶三类统一回写 ko.hangul.compound（与网关 skill 映射同源）。 */
  const scriptTypeFor = (item: HangulItem): 'CONSONANT' | 'VOWEL' | 'COMPOUND' =>
    item.type === 'CONSONANT' ? 'CONSONANT' : item.type === 'VOWEL' ? 'VOWEL' : 'COMPOUND';

  const current: HangulItem | undefined = plan[drillIndex];
  const activeMode: RecognitionMode =
    drillMode === 'MIXED' ? (mixedPlan[drillIndex] ?? 'AUDIO_TO_JAMO') : drillMode;

  const options = useMemo(() => {
    if (!current) return [];
    const distractors = pickDistractors(current, pool.length > 0 ? pool : allHangul);
    if (activeMode === 'AUDIO_TO_JAMO') {
      return shuffle([current.jamo, ...distractors.map((d) => d.jamo)]);
    }
    return shuffle([current.romanization, ...distractors.map((d) => d.romanization)]);
  }, [current, pool, allHangul, activeMode, drillIndex]);

  const correctAnswer = current
    ? activeMode === 'AUDIO_TO_JAMO'
      ? current.jamo
      : current.romanization
    : '';

  // 听音题切出即自动播报
  useEffect(() => {
    if (!isDrillActive || roundDone || activeMode !== 'AUDIO_TO_JAMO' || !current) return;
    void speechStudio.speak(current.audioText || current.jamo, { lang: 'KO' });
  }, [isDrillActive, roundDone, activeMode, current, drillIndex]);

  const startDrill = () => {
    const source = pool.length > 0 ? pool : allHangul;
    if (source.length === 0) {
      toast.error('谚文底座尚未加载，请稍后重试。');
      return;
    }
    const shuffled = shuffle(source);
    const list = drillCount > 0 ? shuffled.slice(0, Math.min(drillCount, shuffled.length)) : shuffled;
    setPlan(list);
    setMixedPlan(list.map(() => RECOGNITION_MODES[Math.floor(Math.random() * RECOGNITION_MODES.length)]!));
    setDrillIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setDrillAnswered(0);
    setDrillCorrect(0);
    setRoundDone(false);
    setIsDrillActive(true);
    sound.playClick();
  };

  const stopDrill = () => {
    setIsDrillActive(false);
    setRoundDone(false);
    sound.playClick();
  };

  const answer = (option: string) => {
    if (isAnswered || !current) return;
    const ok = option === correctAnswer;
    setSelectedOption(option);
    setIsAnswered(true);
    setDrillAnswered((n) => n + 1);
    if (ok) {
      setDrillCorrect((n) => n + 1);
      sound.playSuccess();
    } else {
      sound.playError();
    }
    practiceMutation.mutate({
      hangulId: current.id,
      isCorrect: ok,
      scriptType: scriptTypeFor(current),
    });
  };

  const next = () => {
    if (drillIndex + 1 >= plan.length) {
      setRoundDone(true);
      const accuracy = drillAnswered + 1 > 0 ? (drillCorrect + (selectedOption === correctAnswer ? 1 : 0)) / (drillAnswered + 1) : 0;
      if (accuracy >= 0.8) fireSuccessConfetti();
      return;
    }
    setDrillIndex((i) => i + 1);
    setSelectedOption(null);
    setIsAnswered(false);
  };

  const accuracy = drillAnswered > 0 ? Math.round((drillCorrect / drillAnswered) * 100) : 0;

  const askTutor = () => {
    if (!onOpenTutor || !current) return;
    onOpenTutor({
      questionText: `谚文「${current.jamo}」（${current.name}，罗马字 ${current.romanization}）的发音与构形，请讲解。`,
      correctAnswer: `${current.jamo} = ${current.romanization}`,
      skillTag:
        current.type === 'VOWEL'
          ? 'ko.hangul.vowel'
          : current.type === 'CONSONANT'
            ? 'ko.hangul.consonant'
            : 'ko.hangul.compound',
      explanation: current.mnemonic ?? '',
    });
  };

  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">谚文工作室</h2>
          <Badge variant="secondary">子音 14 · 母音 10 · 进阶 18</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowRomaji((v) => !v);
              sound.playClick();
            }}
          >
            {showRomaji ? '隐藏罗马字' : '显示罗马字'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refetchHangul()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            刷新
          </Button>
        </div>
      </div>

      {isHangulLoading && allHangul.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
          谚文底座加载中…
        </div>
      ) : allHangul.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
          暂无谚文数据，请确认网关已启动后点刷新。
        </div>
      ) : (
        <>
          {/* 矩阵选项卡 */}
          <Tabs value={matrixTab} onValueChange={(v) => setMatrixTab(v as MatrixTab)}>
            <TabsList>
              <TabsIndicator />
              <TabsTrigger value="CONSONANT">子音 자음</TabsTrigger>
              <TabsTrigger value="VOWEL">母音 모음</TabsTrigger>
              <TabsTrigger value="ADVANCED">进阶 복모음·받침</TabsTrigger>
            </TabsList>
          </Tabs>

          {matrixTab === 'ADVANCED' && (
            <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground leading-relaxed">
              进阶区 = y 系母音（ㅑㅕㅛㅠ）+ 复合母音（ㅒㅖㅘㅙㅝㅞㅢ；ㅐㅔㅚㅟ 已在母音区）+ 收音 7 代表音（ㄱㄴㄷㄹㅁㅂㅇ）。
              收音只发代表音：点字母卡看变音要点（如鼻音化、颚化），自测成绩记入「复音与收音」画像。
            </div>
          )}

          {/* 字母矩阵 */}
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {pool.map((h) => (
              <button
                key={h.id}
                onClick={() => {
                  setActiveHangul(h);
                  void speechStudio.speak(h.audioText || h.jamo, { lang: 'KO' });
                  sound.playClick();
                }}
                className={`rounded-xl border p-3 text-center transition hover:border-primary ${
                  activeHangul?.id === h.id ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <div className="text-2xl font-bold">{h.jamo}</div>
                {showRomaji && <div className="text-xs text-muted-foreground mt-1">{h.romanization}</div>}
              </button>
            ))}
          </div>

          {/* 选中字母详情 */}
          <AnimatePresence>
            {activeHangul && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="rounded-xl border p-4 flex items-center gap-4"
              >
                <div className="text-4xl font-bold">{activeHangul.jamo}</div>
                <div className="flex-1">
                  <div className="font-medium">
                    {activeHangul.name} · {activeHangul.romanization}
                  </div>
                  {activeHangul.mnemonic && (
                    <div className="text-sm text-muted-foreground mt-0.5">{activeHangul.mnemonic}</div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void speechStudio.speak(activeHangul.audioText || activeHangul.jamo, { lang: 'KO' })}
                >
                  <Volume2 className="h-3.5 w-3.5 mr-1" />
                  跟读
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 自测区 */}
          <div className="rounded-xl border p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">自测模式</span>
              <select
                value={drillMode}
                onChange={(e) => setDrillMode(e.target.value as DrillMode)}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              >
                <option value="AUDIO_TO_JAMO">听音辨字</option>
                <option value="JAMO_TO_ROMA">看字辨音</option>
                <option value="MIXED">综合混合</option>
              </select>
              <span className="text-sm font-medium ml-2">题量</span>
              <select
                value={drillCount}
                onChange={(e) => setDrillCount(Number(e.target.value))}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              >
                {DRILL_COUNTS.map((c) => (
                  <option key={c} value={c}>
                    {c === 0 ? '全部' : `${c} 题`}
                  </option>
                ))}
              </select>
              {!isDrillActive ? (
                <ShimmerButton onClick={startDrill}>开始自测（跟随当前选项卡题池）</ShimmerButton>
              ) : (
                <Button variant="outline" size="sm" onClick={stopDrill}>
                  结束自测
                </Button>
              )}
              {isDrillActive && (
                <Badge variant="secondary">
                  {drillAnswered} 答 · {drillCorrect} 对
                </Badge>
              )}
            </div>

            {isDrillActive && !roundDone && current && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  第 {drillIndex + 1} / {plan.length} 题 · {activeMode === 'AUDIO_TO_JAMO' ? '听发音选字母' : '看字母选罗马字'}
                </div>
                {activeMode === 'AUDIO_TO_JAMO' ? (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => void speechStudio.speak(current.audioText || current.jamo, { lang: 'KO' })}
                  >
                    <Volume2 className="h-5 w-5 mr-2" />
                    重播发音
                  </Button>
                ) : (
                  <div className="text-5xl font-bold text-center py-2">{current.jamo}</div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {options.map((opt) => {
                    const isCorrectOpt = opt === correctAnswer;
                    const isPicked = opt === selectedOption;
                    return (
                      <button
                        key={opt}
                        disabled={isAnswered}
                        onClick={() => answer(opt)}
                        className={`rounded-xl border p-3 text-lg font-medium transition ${
                          isAnswered && isCorrectOpt
                            ? 'border-green-500 bg-green-500/10'
                            : isAnswered && isPicked
                              ? 'border-red-500 bg-red-500/10'
                              : 'hover:border-primary'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {isAnswered && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      {selectedOption === correctAnswer ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          回答正确 · {current.jamo}（{current.name}）= {current.romanization}
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 text-red-500" />
                          正确答案：{correctAnswer} · {current.jamo}（{current.name}）
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={next}>
                        {drillIndex + 1 >= plan.length ? '查看战报' : '下一题'}
                      </Button>
                      {onOpenTutor && (
                        <Button size="sm" variant="outline" onClick={askTutor}>
                          <Bot className="h-3.5 w-3.5 mr-1" />
                          问 AI 老师
                        </Button>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {isDrillActive && roundDone && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2 py-4">
                <Award className="h-8 w-8 mx-auto text-primary" />
                <div className="text-lg font-semibold">本轮战报 · 正确率 {accuracy}%</div>
                <div className="text-sm text-muted-foreground">
                  共 {drillAnswered} 题 · 答对 {drillCorrect} 题（已回写学情画像与打卡）
                </div>
                <div className="flex justify-center gap-2 pt-2">
                  <ShimmerButton onClick={startDrill}>再来一轮</ShimmerButton>
                  <Button variant="outline" onClick={stopDrill}>
                    返回矩阵
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
