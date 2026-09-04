import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
  Award,
  Layers,
  ChevronRight,
  ChevronLeft,
  Sun,
  Moon,
  Sparkles,
  GraduationCap,
  Clock,
  ArrowRight,
  Bookmark,
  RotateCcw,
  Check,
  Filter,
  CheckCheck,
  Undo2,
} from 'lucide-react';
import {
  initFsrsState,
  scheduleNextReview,
  type SkillMetric,
} from '@study-studio/learner-core';
import type { CardReviewRating } from '@study-studio/protocol';
import {
  DotPattern,
  NumberTicker,
  ShimmerButton,
  fireSuccessConfetti,
} from './components/magicui/index.js';
import { sound } from './utils/audio.js';
import {
  INITIAL_QUESTIONS,
  INITIAL_CARDS,
  INITIAL_MISTAKES,
  SKILL_METRICS_JP,
  type QuizQuestionItem,
  type StudyCardItem,
  type MistakeNotebookItem,
} from './data/learning-data.js';

export function App() {
  // 主题状态：默认浅色（温暖日式纸面质感），持久化于 localStorage
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('study_studio_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('study_studio_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    sound.playClick();
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    toast.success(theme === 'light' ? '已切换至深焙炭石夜间模式' : '已切换至温润纸面亮色模式');
  };

  const [activeTab, setActiveTab] = useState<'QUIZ' | 'CARDS' | 'MISTAKES' | 'RADAR'>('QUIZ');

  // --- 1. 做题系统状态 ---
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [fillBlankInput, setFillBlankInput] = useState('');
  const [reorderSelectedChunks, setReorderSelectedChunks] = useState<string[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isCurrentAnswerCorrect, setIsCurrentAnswerCorrect] = useState(false);
  const [sessionScore, setSessionScore] = useState(0);

  const currentQ: QuizQuestionItem = INITIAL_QUESTIONS[questionIndex] ?? INITIAL_QUESTIONS[0]!;

  // --- 2. 卡片系统状态 ---
  const [cards, setCards] = useState<StudyCardItem[]>(INITIAL_CARDS);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [cardFilter, setCardFilter] = useState<'ALL' | 'VOCAB' | 'GRAMMAR' | 'CONFUSION'>('ALL');

  const filteredCards = cards.filter((c) => cardFilter === 'ALL' || c.type === cardFilter);
  const activeCard: StudyCardItem | undefined = filteredCards[currentCardIndex] || filteredCards[0];

  // --- 3. 错题本状态 ---
  const [mistakes, setMistakes] = useState<MistakeNotebookItem[]>(INITIAL_MISTAKES);
  const [mistakeFilter, setMistakeFilter] = useState<'ALL' | 'UNRESOLVED' | 'RESOLVED'>('ALL');

  // --- 4. 技能画像状态 ---
  const [metrics, setMetrics] = useState<SkillMetric[]>(SKILL_METRICS_JP);
  const [metricDimension, setMetricDimension] = useState<string>('ALL');

  // 提交做题答题
  const handleQuizSubmit = () => {
    sound.playClick();
    let correct = false;

    if (currentQ.type === 'CHOICE') {
      correct = selectedChoice === currentQ.correctAnswer;
    } else if (currentQ.type === 'FILL_BLANK') {
      correct = fillBlankInput.trim().toLowerCase() === currentQ.correctAnswer.toLowerCase();
    } else if (currentQ.type === 'REORDER') {
      correct = reorderSelectedChunks.join(' ') === currentQ.correctAnswer;
    }

    setIsCurrentAnswerCorrect(correct);
    setQuizSubmitted(true);

    if (correct) {
      sound.playSuccess();
      fireSuccessConfetti();
      setSessionScore((prev) => prev + 1);
      toast.success('回答正确！知识点掌握度提升 ＋5%');
    } else {
      sound.playMistake();
      toast.error('回答有误，系统已为您自动归入错题本并标注考点。');
    }
  };

  // 下一题处理
  const handleNextQuestion = () => {
    sound.playClick();
    setSelectedChoice(null);
    setFillBlankInput('');
    setReorderSelectedChunks([]);
    setQuizSubmitted(false);

    if (questionIndex < INITIAL_QUESTIONS.length - 1) {
      setQuestionIndex((prev) => prev + 1);
    } else {
      toast.success(`恭喜完成本轮专项练习！总得分 ${sessionScore + (isCurrentAnswerCorrect ? 1 : 0)} / ${INITIAL_QUESTIONS.length}`);
      setQuestionIndex(0);
      setSessionScore(0);
    }
  };

  // FSRS 卡片自评打分
  const handleCardReview = (rating: CardReviewRating) => {
    sound.playClick();
    if (!activeCard) return;

    const fsrsCurrent = {
      stability: activeCard.stability,
      difficulty: 5.0,
      reps: activeCard.reps,
      lapses: 0,
      dueAt: new Date().toISOString(),
      state: 'REVIEW' as const,
    };
    const nextFsrs = scheduleNextReview(fsrsCurrent, rating);

    setCards((prev) =>
      prev.map((c) =>
        c.id === activeCard.id
          ? { ...c, stability: nextFsrs.stability, reps: nextFsrs.reps }
          : c
      )
    );

    setCardFlipped(false);

    if (rating === 'GOOD' || rating === 'EASY') {
      sound.playSuccess();
      fireSuccessConfetti();
      toast.success(`评级成功：下次复习将在 ${Math.round(nextFsrs.stability)} 天后`);
    } else {
      sound.playMistake();
      toast('已加入今日重练队列，稍后将再次强化。');
    }

    if (currentCardIndex < filteredCards.length - 1) {
      setCurrentCardIndex((prev) => prev + 1);
    } else {
      setCurrentCardIndex(0);
    }
  };

  // 针对错题发起即时攻克重做
  const handleResolveMistakeRetry = (mistakeId: string) => {
    sound.playSuccess();
    fireSuccessConfetti();
    setMistakes((prev) =>
      prev.map((m) => {
        if (m.id !== mistakeId) return m;
        const newCount = m.consecutiveCorrect + 1;
        const isResolved = newCount >= 2;
        if (isResolved) {
          toast.success('太棒了！该错题连续订正正确 2 次，已成功攻克！');
        } else {
          toast('订正正确 1 次，再接再厉连续答对 1 次即可攻克！');
        }
        return {
          ...m,
          consecutiveCorrect: newCount,
          isResolved,
        };
      })
    );
  };

  const tabs: {
    id: 'QUIZ' | 'CARDS' | 'MISTAKES' | 'RADAR';
    label: string;
    icon: typeof BookOpen;
    count?: string;
  }[] = [
    { id: 'QUIZ', label: '练习做题', icon: BookOpen, count: `${questionIndex + 1}/${INITIAL_QUESTIONS.length}` },
    { id: 'CARDS', label: '卡片记忆 (FSRS)', icon: Layers, count: `${filteredCards.length}` },
    { id: 'MISTAKES', label: '错题本', icon: AlertTriangle, count: `${mistakes.filter((m) => !m.isResolved).length}` },
    { id: 'RADAR', label: '学情画像', icon: Award },
  ];

  return (
    <div
      className={`min-h-screen ${
        theme === 'dark' ? 'dark bg-[#141312] text-stone-100' : 'bg-[#fbfaf8] text-stone-800'
      } transition-colors duration-200 flex flex-col font-sans relative overflow-x-hidden`}
    >
      <Toaster position="top-center" richColors />

      {/* 温暖点阵纸页质感底纹 */}
      <DotPattern
        width={26}
        height={26}
        cx={1.5}
        cy={1.5}
        cr={1}
        className="opacity-45 dark:opacity-15"
      />

      {/* 顶部导航栏 */}
      <header className="border-b border-stone-200/80 dark:border-stone-800/80 bg-white/85 dark:bg-[#1a1917]/85 backdrop-blur-md sticky top-0 z-50 transition-colors">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.05, rotate: 2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => sound.playClick()}
              className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-xs shadow-orange-500/20 cursor-pointer"
            >
              <GraduationCap className="w-5 h-5" />
            </motion.div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-stone-900 dark:text-stone-100 tracking-tight">
                  Study Studio
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border border-orange-200/80 dark:border-orange-800/50">
                  日语专项 · JLPT N3
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">自适应外语学习系统</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200/80 dark:border-orange-800/50 text-orange-800 dark:text-orange-300 text-xs font-semibold shadow-2xs"
            >
              <TrendingUp className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span>
                连续打卡 <NumberTicker value={5} className="font-bold inline-block" /> 天
              </span>
            </motion.div>

            <div className="h-5 w-px bg-stone-200 dark:bg-stone-800" />

            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={toggleTheme}
              aria-label="切换明暗主题"
              className="p-2.5 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#211f1d] hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 shadow-2xs transition-all cursor-pointer"
            >
              {theme === 'light' ? (
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Moon className="w-4 h-4 text-orange-600" />
                  <span className="hidden md:inline">暗色</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="hidden md:inline">暖亮</span>
                </div>
              )}
            </motion.button>
          </div>
        </div>
      </header>

      {/* 主工作区 */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 flex flex-col gap-6 relative z-10">
        {/* 滑动指示标签栏 */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-200/60 dark:bg-[#1f1d1b] rounded-2xl border border-stone-200/80 dark:border-stone-800 w-fit backdrop-blur-xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  sound.playClick();
                  setActiveTab(tab.id as any);
                }}
                className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'text-orange-700 dark:text-orange-400 font-semibold'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 rounded-xl bg-white dark:bg-[#282522] shadow-xs"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.count && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive
                        ? 'bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300'
                        : 'bg-stone-200 dark:bg-stone-800 text-stone-500'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* 1. 多题型做题练习模块 (CHOICE / FILL_BLANK / REORDER)                     */}
        {/* ========================================================================= */}
        {activeTab === 'QUIZ' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-5 max-w-3xl"
          >
            <div className="bg-white dark:bg-[#1c1a18] border border-stone-200/80 dark:border-stone-800 rounded-2xl p-7 shadow-xs hover:shadow-sm transition-all relative overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200/80 dark:border-orange-800/40">
                    {currentQ.category}
                  </span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    考查技能：{currentQ.testedSkill}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-stone-400 dark:text-stone-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    第 {questionIndex + 1} / {INITIAL_QUESTIONS.length} 题
                  </span>
                </div>
              </div>

              <div className="my-6">
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">
                  {currentQ.prompt}
                </p>
                <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-wide font-['Noto_Sans_JP'] py-2">
                  {currentQ.content}
                </div>
              </div>

              {/* 题型 A：单选题 */}
              {currentQ.type === 'CHOICE' && currentQ.options && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {currentQ.options.map((opt) => {
                    const isSelected = selectedChoice === opt.key;
                    const isCorrect = opt.key === currentQ.correctAnswer;

                    let style =
                      'border-stone-200/80 dark:border-stone-800 bg-stone-50/50 dark:bg-[#24221f]/50 hover:bg-stone-100/80 dark:hover:bg-[#282522] hover:border-stone-300 dark:hover:border-stone-700 text-stone-800 dark:text-stone-200';

                    if (quizSubmitted) {
                      if (isCorrect) {
                        style =
                          'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20';
                      } else if (isSelected) {
                        style =
                          'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/20';
                      }
                    } else if (isSelected) {
                      style =
                        'border-orange-500 bg-orange-50/80 dark:bg-orange-950/50 text-orange-950 dark:text-orange-200 ring-2 ring-orange-500/30 font-semibold';
                    }

                    return (
                      <motion.button
                        whileHover={{ scale: quizSubmitted ? 1 : 1.01 }}
                        whileTap={{ scale: quizSubmitted ? 1 : 0.99 }}
                        key={opt.key}
                        disabled={quizSubmitted}
                        onClick={() => {
                          sound.playClick();
                          setSelectedChoice(opt.key);
                        }}
                        className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${style}`}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-base font-['Noto_Sans_JP']">
                            {opt.key}. {opt.text}
                          </span>
                          {quizSubmitted && (
                            <span className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                              {opt.note}
                            </span>
                          )}
                        </div>
                        {quizSubmitted && isCorrect && (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        )}
                        {quizSubmitted && isSelected && !isCorrect && (
                          <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* 题型 B：填空题 */}
              {currentQ.type === 'FILL_BLANK' && (
                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <input
                      type="text"
                      disabled={quizSubmitted}
                      value={fillBlankInput}
                      onChange={(e) => setFillBlankInput(e.target.value)}
                      placeholder="在此处输入变形后的词汇（如：降ったら）..."
                      className={`w-full p-4 rounded-xl border font-['Noto_Sans_JP'] text-base outline-hidden transition-all ${
                        quizSubmitted
                          ? isCurrentAnswerCorrect
                            ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                            : 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
                          : 'border-stone-300 dark:border-stone-700 bg-white dark:bg-[#24221f] focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
                      }`}
                    />
                    {quizSubmitted && (
                      <div className="mt-2 text-xs flex items-center gap-2">
                        {isCurrentAnswerCorrect ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" /> 回答完全正确！
                          </span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                            <XCircle className="w-4 h-4" /> 正确写法应为：{currentQ.correctAnswer}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 题型 C：词块乱序重排题 */}
              {currentQ.type === 'REORDER' && currentQ.chunks && (
                <div className="flex flex-col gap-4">
                  {/* 已选定区域 */}
                  <div className="min-h-14 p-3 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-[#1a1816] flex flex-wrap gap-2 items-center">
                    {reorderSelectedChunks.length === 0 ? (
                      <span className="text-xs text-stone-400 pl-2">点击下方词块按语序拼接成句...</span>
                    ) : (
                      reorderSelectedChunks.map((chunk, idx) => (
                        <motion.button
                          key={idx}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          disabled={quizSubmitted}
                          onClick={() => {
                            sound.playClick();
                            setReorderSelectedChunks((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-orange-500 text-white font-medium text-sm flex items-center gap-1.5 shadow-2xs cursor-pointer font-['Noto_Sans_JP']"
                        >
                          <span>{chunk}</span>
                          {!quizSubmitted && <span className="text-xs opacity-75">✕</span>}
                        </motion.button>
                      ))
                    )}
                  </div>

                  {/* 候选词块池 */}
                  <div className="flex flex-wrap gap-2.5">
                    {currentQ.chunks.map((chunk, idx) => {
                      const isUsed = reorderSelectedChunks.includes(chunk);

                      return (
                        <motion.button
                          key={idx}
                          whileHover={{ scale: isUsed || quizSubmitted ? 1 : 1.03 }}
                          whileTap={{ scale: isUsed || quizSubmitted ? 1 : 0.97 }}
                          disabled={isUsed || quizSubmitted}
                          onClick={() => {
                            sound.playClick();
                            setReorderSelectedChunks((prev) => [...prev, chunk]);
                          }}
                          className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all font-['Noto_Sans_JP'] ${
                            isUsed
                              ? 'opacity-30 border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-800 cursor-not-allowed'
                              : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-[#24221f] text-stone-800 dark:text-stone-200 hover:border-orange-400 cursor-pointer shadow-2xs'
                          }`}
                        >
                          {chunk}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 底部按钮栏 */}
              <div className="mt-7 pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <div className="text-xs text-stone-400 dark:text-stone-500">
                  答对自动放行，做错自动归档错题本
                </div>

                {!quizSubmitted ? (
                  <ShimmerButton
                    disabled={
                      (currentQ.type === 'CHOICE' && !selectedChoice) ||
                      (currentQ.type === 'FILL_BLANK' && !fillBlankInput.trim()) ||
                      (currentQ.type === 'REORDER' && reorderSelectedChunks.length !== (currentQ.chunks?.length ?? 0))
                    }
                    onClick={handleQuizSubmit}
                  >
                    <span>确认答案</span>
                    <Sparkles className="w-4 h-4" />
                  </ShimmerButton>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleNextQuestion}
                    className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <span>下一题</span>
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                )}
              </div>
            </div>

            {/* 考点剖析展开卡片 */}
            <AnimatePresence>
              {quizSubmitted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-white dark:bg-[#1c1a18] border border-stone-200/80 dark:border-stone-800 rounded-2xl p-6 shadow-xs flex flex-col gap-3.5 transition-all"
                >
                  <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-semibold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>导师考点解析</span>
                  </div>
                  <p className="text-stone-700 dark:text-stone-300 text-sm leading-relaxed font-['Noto_Sans_JP']">
                    {currentQ.explanation}
                  </p>
                  <div className="p-3.5 rounded-xl bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200/70 dark:border-orange-900/40 text-xs text-stone-700 dark:text-stone-300 flex items-start gap-2.5">
                    <span className="font-semibold text-orange-800 dark:text-orange-300 whitespace-nowrap">
                      错因归纳：
                    </span>
                    <span>
                      {isCurrentAnswerCorrect
                        ? '掌握扎实！本考点熟练度指标已得到有效巩固。'
                        : '容易受母语直译思维影响，建议在卡片记忆区反复强化接续与典型例句。'}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 2. 卡片记忆工坊 (FSRS 3D 触感卡片 + 分类过滤 + 前后卡切换)             */}
        {/* ========================================================================= */}
        {activeTab === 'CARDS' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-6 max-w-lg mx-auto w-full"
          >
            {/* 卡片分类过滤 */}
            <div className="flex items-center gap-2 p-1 rounded-xl bg-stone-100 dark:bg-[#1f1d1b] border border-stone-200/70 dark:border-stone-800/80 text-xs font-medium">
              {(['ALL', 'VOCAB', 'GRAMMAR', 'CONFUSION'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    sound.playClick();
                    setCardFilter(cat);
                    setCurrentCardIndex(0);
                    setCardFlipped(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    cardFilter === cat
                      ? 'bg-white dark:bg-stone-800 text-orange-700 dark:text-orange-400 font-bold shadow-2xs'
                      : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  {cat === 'ALL' && '全部卡片'}
                  {cat === 'VOCAB' && '核心词汇'}
                  {cat === 'GRAMMAR' && '语法句型'}
                  {cat === 'CONFUSION' && '易混辨析'}
                </button>
              ))}
            </div>

            {/* 3D 触感卡片 */}
            {activeCard && (
              <div
                className="w-full h-84 perspective-1000 cursor-pointer"
                onClick={() => {
                  sound.playClick();
                  setCardFlipped(!cardFlipped);
                }}
              >
                <motion.div
                  animate={{ rotateY: cardFlipped ? 180 : 0 }}
                  transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
                  className="w-full h-full relative transform-style-3d shadow-xs hover:shadow-md transition-shadow rounded-2xl"
                >
                  {/* 正面 */}
                  <div className="absolute inset-0 w-full h-full bg-white dark:bg-[#1c1a18] border border-stone-200/80 dark:border-stone-800 rounded-2xl p-8 flex flex-col items-center justify-between backface-hidden">
                    <div className="w-full flex items-center justify-between text-xs text-stone-400">
                      <span className="px-2.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 border border-orange-200/70 dark:border-orange-800/40 font-medium">
                        {activeCard.tag} · {activeCard.pos}
                      </span>
                      <span className="flex items-center gap-1 hover:text-orange-600">
                        点击翻面 <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-3 my-auto">
                      <div className="text-4xl font-bold font-['Noto_Sans_JP'] text-stone-900 dark:text-stone-100">
                        {activeCard.frontWord}
                      </div>
                      <div className="text-sm font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                        <span>{activeCard.reading}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-stone-400">思考词义、接续与例句后点击翻面</div>
                  </div>

                  {/* 背面 */}
                  <div className="absolute inset-0 w-full h-full bg-white dark:bg-[#1c1a18] border border-orange-200/90 dark:border-orange-900/60 rounded-2xl p-8 flex flex-col items-center justify-between backface-hidden rotate-y-180">
                    <div className="w-full flex items-center justify-between text-xs text-orange-700 dark:text-orange-400 font-medium">
                      <span className="flex items-center gap-1">
                        <Bookmark className="w-3.5 h-3.5" />
                        考点剖析
                      </span>
                      <span>正面请点翻转</span>
                    </div>

                    <div className="flex flex-col items-center gap-3 my-auto">
                      <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                        {activeCard.backMeaning}
                      </div>
                      <div className="text-sm text-stone-700 dark:text-stone-300 max-w-sm mt-1 leading-relaxed font-['Noto_Sans_JP'] text-center">
                        {activeCard.exampleJp}
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400">
                        {activeCard.exampleZh}
                      </div>
                      {activeCard.note && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded mt-1">
                          💡 {activeCard.note}
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] text-stone-400">请在下方评定您的记忆掌握度</div>
                  </div>
                </motion.div>
              </div>
            )}

            {/* 卡片切换与 FSRS 评级 */}
            {cardFlipped ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-4 gap-2.5 w-full"
              >
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleCardReview('AGAIN')}
                  className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 font-medium text-xs flex flex-col items-center gap-1 transition-all cursor-pointer"
                >
                  <span className="font-bold">生疏</span>
                  <span className="text-[10px] opacity-75">1天后</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleCardReview('HARD')}
                  className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 font-medium text-xs flex flex-col items-center gap-1 transition-all cursor-pointer"
                >
                  <span className="font-bold">困难</span>
                  <span className="text-[10px] opacity-75">2天后</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleCardReview('GOOD')}
                  className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/60 border border-orange-200 dark:border-orange-800/60 text-orange-800 dark:text-orange-300 font-medium text-xs flex flex-col items-center gap-1 transition-all cursor-pointer"
                >
                  <span className="font-bold">良好</span>
                  <span className="text-[10px] opacity-75">4天后</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleCardReview('EASY')}
                  className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 font-medium text-xs flex flex-col items-center gap-1 transition-all cursor-pointer"
                >
                  <span className="font-bold">简单</span>
                  <span className="text-[10px] opacity-75">7天后</span>
                </motion.button>
              </motion.div>
            ) : (
              <div className="flex items-center justify-between w-full text-xs text-stone-400">
                <button
                  onClick={() => {
                    sound.playClick();
                    setCurrentCardIndex((prev) => Math.max(0, prev - 1));
                  }}
                  disabled={currentCardIndex === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> 上一张
                </button>
                <span>
                  第 {currentCardIndex + 1} / {filteredCards.length} 张
                </span>
                <button
                  onClick={() => {
                    sound.playClick();
                    setCurrentCardIndex((prev) => Math.min(filteredCards.length - 1, prev + 1));
                  }}
                  disabled={currentCardIndex === filteredCards.length - 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 cursor-pointer"
                >
                  下一张 <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 3. 互动式错题本攻克模块                                                   */}
        {/* ========================================================================= */}
        {activeTab === 'MISTAKES' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-4 max-w-3xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">错题本与攻克工作台</h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  错题重做连续答对 2 次，系统将自动移出弱项并判定为攻克
                </p>
              </div>
              {/* 状态筛选 */}
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-[#1f1d1b] p-1 rounded-xl text-xs">
                {(['ALL', 'UNRESOLVED', 'RESOLVED'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => {
                      sound.playClick();
                      setMistakeFilter(filter);
                    }}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      mistakeFilter === filter
                        ? 'bg-white dark:bg-stone-800 text-orange-700 dark:text-orange-400 font-semibold shadow-2xs'
                        : 'text-stone-500'
                    }`}
                  >
                    {filter === 'ALL' && '全部'}
                    {filter === 'UNRESOLVED' && '待攻克'}
                    {filter === 'RESOLVED' && '已攻克'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3.5">
              {mistakes
                .filter((m) => {
                  if (mistakeFilter === 'UNRESOLVED') return !m.isResolved;
                  if (mistakeFilter === 'RESOLVED') return m.isResolved;
                  return true;
                })
                .map((m) => (
                  <motion.div
                    key={m.id}
                    layout
                    className={`bg-white dark:bg-[#1c1a18] border rounded-2xl p-6 shadow-xs flex flex-col gap-3.5 transition-all ${
                      m.isResolved
                        ? 'border-emerald-200/80 dark:border-emerald-900/40 opacity-75'
                        : 'border-stone-200/80 dark:border-stone-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-0.5 rounded border border-rose-200 dark:border-rose-800/40">
                          {m.categoryTag}
                        </span>
                        <span className="text-xs text-stone-400">{m.prompt}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.isResolved ? (
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50">
                            <CheckCheck className="w-3.5 h-3.5" /> 已攻克
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400">
                            连对进度：<span className="font-bold text-orange-600">{m.consecutiveCorrect}</span> / 2
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-lg font-semibold text-stone-900 dark:text-stone-100 font-['Noto_Sans_JP']">
                      {m.sentence}
                    </div>

                    <div className="text-xs text-stone-600 dark:text-stone-400 flex items-center gap-4">
                      <span>
                        你的历史错误：<span className="font-bold text-rose-600 line-through">{m.userWrongAnswer}</span>
                      </span>
                      <span>
                        标准正解：<span className="font-bold text-emerald-600 dark:text-emerald-400">{m.correctAnswer}</span>
                      </span>
                    </div>

                    <div className="text-xs text-stone-600 dark:text-stone-400 bg-stone-50 dark:bg-[#24221f] p-3.5 rounded-xl border border-stone-200/70 dark:border-stone-700/50 leading-relaxed font-['Noto_Sans_JP'] flex items-start justify-between gap-4">
                      <div>
                        <span className="font-semibold text-stone-900 dark:text-stone-200">复盘要点：</span>
                        {m.reviewNote}
                      </div>

                      {!m.isResolved && (
                        <motion.button
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => handleResolveMistakeRetry(m.id)}
                          className="shrink-0 px-3.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs transition-all cursor-pointer shadow-2xs"
                        >
                          立即重练攻克
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                ))}
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 4. 学情画像雷达模块 (维度切分 + 掌握度进度条)                           */}
        {/* ========================================================================= */}
        {activeTab === 'RADAR' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-5 max-w-3xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">语言能力与学情画像</h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  基于做题正确率与遗忘曲线模型全自动聚类
                </p>
              </div>

              {/* 维度筛选 */}
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-[#1f1d1b] p-1 rounded-xl text-xs">
                {[
                  { id: 'ALL', label: '全部' },
                  { id: 'GRAMMAR', label: '语法' },
                  { id: 'VOCABULARY', label: '词汇' },
                  { id: 'LISTENING', label: '听力' },
                  { id: 'NUANCE_PRAGMATIC', label: '语用' },
                ].map((dim) => (
                  <button
                    key={dim.id}
                    onClick={() => {
                      sound.playClick();
                      setMetricDimension(dim.id);
                    }}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      metricDimension === dim.id
                        ? 'bg-white dark:bg-stone-800 text-orange-700 dark:text-orange-400 font-semibold shadow-2xs'
                        : 'text-stone-500'
                    }`}
                  >
                    {dim.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {metrics
                .filter((m) => metricDimension === 'ALL' || m.dimension === metricDimension)
                .map((metric) => {
                  const isStrength = metric.status === 'STRENGTH';
                  const isWeakness = metric.status === 'WEAKNESS';

                  return (
                    <motion.div
                      whileHover={{ y: -2 }}
                      key={metric.id}
                      className={`p-5 rounded-2xl border transition-all bg-white dark:bg-[#1c1a18] shadow-xs flex flex-col gap-3 ${
                        isStrength
                          ? 'border-emerald-200/80 dark:border-emerald-900/50'
                          : isWeakness
                          ? 'border-rose-200/80 dark:border-rose-900/50'
                          : 'border-stone-200/80 dark:border-stone-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                          {metric.name}
                        </span>
                        {isStrength && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                            已掌握 (优势)
                          </span>
                        )}
                        {isWeakness && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50">
                            需巩固 (弱项)
                          </span>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-1.5">
                          <span>熟练掌握度</span>
                          <span className="font-bold text-stone-800 dark:text-stone-200">
                            <NumberTicker value={metric.proficiency * 100} />%
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${metric.proficiency * 100}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className={`h-full rounded-full ${
                              isStrength
                                ? 'bg-emerald-500'
                                : isWeakness
                                ? 'bg-rose-500'
                                : 'bg-orange-500'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="text-[11px] text-stone-400 dark:text-stone-500 flex justify-between items-center pt-1 border-t border-stone-100 dark:border-stone-800/60">
                        <span>
                          练习 {metric.totalAttempts} 次 · 连错 {metric.consecutiveErrors} 次
                        </span>
                        {isWeakness && (
                          <button
                            onClick={() => {
                              sound.playClick();
                              setActiveTab('QUIZ');
                              toast(`已为您加载针对【${metric.name}】的靶向练习！`);
                            }}
                            className="text-orange-600 hover:text-orange-700 font-semibold cursor-pointer"
                          >
                            靶向加练 →
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
