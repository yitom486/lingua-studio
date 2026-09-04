import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
  Award,
  Layers,
  ChevronRight,
  Sun,
  Moon,
  Sparkles,
  GraduationCap,
  Clock,
  ArrowRight,
  Volume2,
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

export function App() {
  // 主题状态：默认浅色（阳间模式），持久化于 localStorage
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
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const [activeTab, setActiveTab] = useState<'QUIZ' | 'CARDS' | 'MISTAKES' | 'RADAR'>('QUIZ');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [cardState, setCardState] = useState(initFsrsState());

  // 典型日语句型题目
  const currentQuestion = {
    id: 'q_demo_01',
    category: '助词辨析',
    prompt: '请根据句意，选出最恰当的助词填入括号：',
    content: '夏休みに、友だちと京都（　）行きました。',
    options: [
      { key: 'A', text: 'で', note: '表示动作场所或工具手段' },
      { key: 'B', text: 'に', note: '表示移动的目的地、到达点' },
      { key: 'C', text: 'を', note: '表示宾语或离开的场所' },
      { key: 'D', text: 'から', note: '表示起点或出处' },
    ],
    correctAnswer: 'B',
    explanation:
      '句中动词为移动动词「行きました」（去了）。表示移动的目的地、着落点时，必须使用格助词「に」或方向助词「へ」；而「で」通常表示动作实际发生、进行的场所（例如：京都で写真を撮りました）。',
    testedSkill: 'jp.particle.destination_ni',
  };

  // 技能画像数据
  const skillMetrics: SkillMetric[] = [
    {
      id: 'jp.particle.destination_ni',
      dimension: 'GRAMMAR',
      name: '目的地着落点助词「に」',
      proficiency: 0.88,
      totalAttempts: 12,
      correctAttempts: 11,
      consecutiveErrors: 0,
      status: 'STRENGTH',
    },
    {
      id: 'jp.particle.action_de',
      dimension: 'GRAMMAR',
      name: '动作场所助词「で」',
      proficiency: 0.52,
      totalAttempts: 8,
      correctAttempts: 4,
      consecutiveErrors: 2,
      status: 'WEAKNESS',
    },
    {
      id: 'jp.listening.sokuon',
      dimension: 'LISTENING',
      name: '听力：促音与长音辨析',
      proficiency: 0.45,
      totalAttempts: 10,
      correctAttempts: 4,
      consecutiveErrors: 3,
      status: 'WEAKNESS',
    },
    {
      id: 'jp.vocab.n3_verbs',
      dimension: 'VOCABULARY',
      name: 'N3 核心动词搭配运用',
      proficiency: 0.92,
      totalAttempts: 30,
      correctAttempts: 28,
      consecutiveErrors: 0,
      status: 'STRENGTH',
    },
  ];

  const handleQuizSubmit = () => {
    setQuizSubmitted(true);
    if (selectedOption === currentQuestion.correctAnswer) {
      fireSuccessConfetti();
    }
  };

  const handleReviewRating = (rating: CardReviewRating) => {
    const next = scheduleNextReview(cardState, rating);
    setCardState(next);
    setCardFlipped(false);
    if (rating === 'GOOD' || rating === 'EASY') {
      fireSuccessConfetti();
    }
  };

  const tabs = [
    { id: 'QUIZ', label: '练习做题', icon: BookOpen },
    { id: 'CARDS', label: '卡片记忆 (FSRS)', icon: Layers },
    { id: 'MISTAKES', label: '错题本', icon: AlertTriangle },
    { id: 'RADAR', label: '学情画像', icon: Award },
  ] as const;

  return (
    <div
      className={`min-h-screen ${
        theme === 'dark' ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50/70 text-slate-800'
      } transition-colors duration-200 flex flex-col font-sans relative overflow-x-hidden`}
    >
      {/* 背景 DotPattern 优雅点阵纹理 */}
      <DotPattern
        width={28}
        height={28}
        cx={1.5}
        cy={1.5}
        cr={1}
        className="opacity-40 dark:opacity-20"
      />

      {/* 顶部导航栏 */}
      <header className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 transition-colors">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo 与产品定位 */}
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.05, rotate: 2 }}
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm cursor-pointer"
            >
              <GraduationCap className="w-5 h-5" />
            </motion.div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-900 dark:text-slate-100 tracking-tight">
                  Study Studio
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/50">
                  日语突破 · JLPT N3
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">基于记忆规律的自适应学习系统</p>
            </div>
          </div>

          {/* 右侧：连续学习与主题切换 */}
          <div className="flex items-center gap-3.5">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300 text-xs font-semibold shadow-xs"
            >
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                连续打卡 <NumberTicker value={5} className="font-bold inline-block" /> 天
              </span>
            </motion.div>

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />

            {/* 明暗切换按钮 */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={toggleTheme}
              aria-label="切换明暗主题"
              className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-xs transition-all cursor-pointer"
            >
              {theme === 'light' ? (
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Moon className="w-4 h-4 text-indigo-600" />
                  <span className="hidden md:inline">暗色</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="hidden md:inline">亮色</span>
                </div>
              )}
            </motion.button>
          </div>
        </div>
      </header>

      {/* 主工作区 */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 flex flex-col gap-6 relative z-10">
        {/* Magic UI 风格滑动指示标签栏 */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800 w-fit backdrop-blur-xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 rounded-xl bg-white dark:bg-slate-800 shadow-xs"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* 1. 做题练习模块 */}
        {activeTab === 'QUIZ' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-5 max-w-3xl"
          >
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/90 rounded-2xl p-7 shadow-xs hover:shadow-sm transition-all relative overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/40">
                    针对弱项练习
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">考点：助词用法辨析</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>第 1 / 5 题</span>
                </div>
              </div>

              <div className="my-6">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  {currentQuestion.prompt}
                </p>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-wide font-['Noto_Sans_JP'] py-2">
                  {currentQuestion.content}
                </div>
              </div>

              {/* 选项网格 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {currentQuestion.options.map((opt) => {
                  const isSelected = selectedOption === opt.key;
                  const isCorrect = opt.key === currentQuestion.correctAnswer;

                  let style =
                    'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/80 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-800 dark:text-slate-200';

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
                      'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-200 ring-2 ring-indigo-500/30 font-semibold';
                  }

                  return (
                    <motion.button
                      whileHover={{ scale: quizSubmitted ? 1 : 1.01 }}
                      whileTap={{ scale: quizSubmitted ? 1 : 0.99 }}
                      key={opt.key}
                      disabled={quizSubmitted}
                      onClick={() => setSelectedOption(opt.key)}
                      className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${style}`}
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold text-base font-['Noto_Sans_JP']">
                          {opt.key}. {opt.text}
                        </span>
                        {quizSubmitted && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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

              {/* 底部按钮栏 */}
              <div className="mt-7 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  答对自动放行，做错自动纳入错题本
                </div>

                {!quizSubmitted ? (
                  <ShimmerButton
                    disabled={!selectedOption}
                    onClick={handleQuizSubmit}
                  >
                    <span>确认答案</span>
                    <Sparkles className="w-4 h-4" />
                  </ShimmerButton>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setQuizSubmitted(false);
                      setSelectedOption(null);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-medium text-sm transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <span>下一题</span>
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                )}
              </div>
            </div>

            {/* AI 深度考点解析 */}
            <AnimatePresence>
              {quizSubmitted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col gap-3.5 transition-all"
                >
                  <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-semibold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>导师考点解析</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-['Noto_Sans_JP']">
                    {currentQuestion.explanation}
                  </p>
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      错因归纳：
                    </span>
                    <span>
                      助词混淆。初学者易受母语“去某地”与“在某地”思维影响；记住“移动有目的地用に，静态动作发生用で”。已自动同步至您的薄弱项画像。
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* 2. 卡片复习模块 (3D 触感翻转卡片 + FSRS) */}
        {activeTab === 'CARDS' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-6 max-w-lg mx-auto w-full"
          >
            {/* 3D 翻转卡片容器 */}
            <div
              className="w-full h-80 perspective-1000 cursor-pointer"
              onClick={() => setCardFlipped(!cardFlipped)}
            >
              <motion.div
                animate={{ rotateY: cardFlipped ? 180 : 0 }}
                transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
                className="w-full h-full relative transform-style-3d shadow-xs hover:shadow-md transition-shadow rounded-2xl"
              >
                {/* 卡片正面 */}
                <div className="absolute inset-0 w-full h-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-between backface-hidden">
                  <div className="w-full flex items-center justify-between text-xs text-slate-400">
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-medium">
                      生词卡 · JLPT N3
                    </span>
                    <span className="flex items-center gap-1 hover:text-indigo-600">
                      点击翻面 <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-3 my-auto">
                    <div className="text-5xl font-bold font-['Noto_Sans_JP'] text-slate-900 dark:text-slate-100">
                      降る
                    </div>
                    <div className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <span>ふる</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        动1 · 自动
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400">思考词义与接续后点击翻面</div>
                </div>

                {/* 卡片背面 */}
                <div className="absolute inset-0 w-full h-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 rounded-2xl p-8 flex flex-col items-center justify-between backface-hidden rotate-y-180">
                  <div className="w-full flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                    <span>考点剖析</span>
                    <span>正面请点翻转</span>
                  </div>

                  <div className="flex flex-col items-center gap-3 my-auto">
                    <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">
                      下 (雨、雪等)
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-300 max-w-sm mt-1 leading-relaxed font-['Noto_Sans_JP']">
                      明日、雨が<span className="font-bold underline decoration-indigo-500 underline-offset-4">降ったら</span>、試合は中止です。
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      明天要是下雨的话，比赛就中止。
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400">请在下方选择您的熟练度</div>
                </div>
              </motion.div>
            </div>

            {/* FSRS 评级按钮 */}
            {cardFlipped && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-4 gap-2.5 w-full"
              >
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleReviewRating('AGAIN')}
                  className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 font-medium text-xs flex flex-col items-center gap-1 transition-all cursor-pointer"
                >
                  <span className="font-bold">生疏</span>
                  <span className="text-[10px] opacity-75">1天后</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleReviewRating('HARD')}
                  className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 font-medium text-xs flex flex-col items-center gap-1 transition-all cursor-pointer"
                >
                  <span className="font-bold">困难</span>
                  <span className="text-[10px] opacity-75">2天后</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleReviewRating('GOOD')}
                  className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 text-indigo-800 dark:text-indigo-300 font-medium text-xs flex flex-col items-center gap-1 transition-all cursor-pointer"
                >
                  <span className="font-bold">良好</span>
                  <span className="text-[10px] opacity-75">4天后</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleReviewRating('EASY')}
                  className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 font-medium text-xs flex flex-col items-center gap-1 transition-all cursor-pointer"
                >
                  <span className="font-bold">简单</span>
                  <span className="text-[10px] opacity-75">7天后</span>
                </motion.button>
              </motion.div>
            )}

            <div className="text-xs text-slate-500 dark:text-slate-400">
              FSRS 记忆稳定性：<span className="font-semibold text-slate-800 dark:text-slate-200">{cardState.stability.toFixed(1)}</span> · 累计复习：{cardState.reps} 次
            </div>
          </motion.div>
        )}

        {/* 3. 错题本模块 */}
        {activeTab === 'MISTAKES' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-4 max-w-3xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">待攻克错题清单</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">错题重做连续答对 2 次将自动归档攻克</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50">
                1 题待攻克
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-0.5 rounded border border-rose-200 dark:border-rose-800/40">
                  错因：助词混淆
                </span>
                <span className="text-xs text-slate-400">攻克进度：0 / 2</span>
              </div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 font-['Noto_Sans_JP']">
                図書館（　）本を読みます。
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-3">
                <span>你的错误作答：<span className="font-bold text-rose-600">に</span></span>
                <span>标准答案：<span className="font-bold text-emerald-600 dark:text-emerald-400">で</span></span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-700/50 leading-relaxed font-['Noto_Sans_JP']">
                <span className="font-semibold text-slate-900 dark:text-slate-200">复盘要点：</span>
                在图书馆进行“读书”这一动作，强调动作发生的场所，必须使用助词「で」。只有表示存在场所时才使用「に」（如：図書館に本があります）。
              </div>
            </div>
          </motion.div>
        )}

        {/* 4. 学情画像雷达模块 */}
        {activeTab === 'RADAR' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-5 max-w-3xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">语言能力与学情画像</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">系统根据近 50 次做题与卡片复习数据动态计算</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {skillMetrics.map((metric) => {
                const isStrength = metric.status === 'STRENGTH';
                const isWeakness = metric.status === 'WEAKNESS';

                return (
                  <motion.div
                    whileHover={{ y: -2 }}
                    key={metric.id}
                    className={`p-5 rounded-2xl border transition-all bg-white dark:bg-slate-900 shadow-xs flex flex-col gap-3 ${
                      isStrength
                        ? 'border-emerald-200/80 dark:border-emerald-900/50'
                        : isWeakness
                        ? 'border-rose-200/80 dark:border-rose-900/50'
                        : 'border-slate-200/80 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
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
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                        <span>掌握度</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          <NumberTicker value={metric.proficiency * 100} />%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${metric.proficiency * 100}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          className={`h-full rounded-full ${
                            isStrength
                              ? 'bg-emerald-500'
                              : isWeakness
                              ? 'bg-rose-500'
                              : 'bg-indigo-600'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 dark:text-slate-500 flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800/60">
                      <span>练习 {metric.totalAttempts} 次</span>
                      <span>连续错误 {metric.consecutiveErrors} 次</span>
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
