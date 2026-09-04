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
  Mic,
  Command,
  Flame,
  Zap,
  Bot,
  HelpCircle,
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
import { CommandPalette, type CommandAction } from './components/CommandPalette.js';
import { TextbookCurriculum } from './components/TextbookCurriculum.js';
import { PitchAccentCoach } from './components/PitchAccentCoach.js';
import { StudyStreakHeatmap } from './components/StudyStreakHeatmap.js';
import { AiTutorDrawer, type AiTutorContext } from './components/AiTutorDrawer.js';

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

  // 导航选项卡
  const [activeTab, setActiveTab] = useState<'QUIZ' | 'CARDS' | 'TEXTBOOK' | 'PITCH' | 'MISTAKES' | 'RADAR'>('QUIZ');

  // 全局指令面板 (Cmd+K)
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  // AI 导师抽屉状态
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [tutorContext, setTutorContext] = useState<AiTutorContext | null>(null);

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

  // 打开 AI 导师抽屉
  const handleOpenTutor = (ctx: AiTutorContext) => {
    sound.playClick();
    setTutorContext(ctx);
    setIsTutorOpen(true);
  };

  // 教材课程联动：启动课后专属自测
  const handleStartLessonQuiz = (lessonId: string, lessonTitle: string) => {
    setActiveTab('QUIZ');
    if (lessonId === 'biaori-l1') {
      setQuestionIndex(4); // q_05 (第1课)
    } else if (lessonId === 'biaori-l2') {
      setQuestionIndex(5); // q_06 (第2课)
    } else {
      setQuestionIndex(0);
    }
    setSelectedChoice(null);
    setFillBlankInput('');
    setReorderSelectedChunks([]);
    setQuizSubmitted(false);
    toast.success(`已为您载入《${lessonTitle}》专属测评题！`);
  };

  // 教材课程联动：加入今日生词卡
  const handleAddCardFromTextbook = (vocab: { front: string; back: string; category: string; prompt: string }) => {
    const newCard: StudyCardItem = {
      id: `card_tb_${Date.now()}`,
      type: 'VOCAB',
      frontWord: vocab.front,
      reading: '',
      tag: '教材生词',
      pos: '生词',
      backMeaning: vocab.back,
      exampleJp: vocab.prompt,
      exampleHighlight: vocab.front,
      exampleZh: '',
      stability: 1.0,
      reps: 0,
    };
    setCards((prev) => [newCard, ...prev]);
  };

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

  // 全局快捷键绑定 (Cmd+K 全局指令, 1-4 选选项/评分, 空格翻卡)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框内部按键
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Cmd+K 或 Ctrl+K 唤出指令面板
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
        return;
      }

      // 卡片模式快捷键
      if (activeTab === 'CARDS') {
        if (e.code === 'Space') {
          e.preventDefault();
          sound.playClick();
          setCardFlipped((prev) => !prev);
        } else if (cardFlipped) {
          if (e.key === '1') handleCardReview('AGAIN');
          if (e.key === '2') handleCardReview('HARD');
          if (e.key === '3') handleCardReview('GOOD');
          if (e.key === '4') handleCardReview('EASY');
        }
      }

      // 做题模式快捷键
      if (activeTab === 'QUIZ' && currentQ.type === 'CHOICE' && !quizSubmitted) {
        if (e.key === '1' && currentQ.options?.[0]) setSelectedChoice(currentQ.options[0].key);
        if (e.key === '2' && currentQ.options?.[1]) setSelectedChoice(currentQ.options[1].key);
        if (e.key === '3' && currentQ.options?.[2]) setSelectedChoice(currentQ.options[2].key);
        if (e.key === '4' && currentQ.options?.[3]) setSelectedChoice(currentQ.options[3].key);
        if (e.key === 'Enter' && selectedChoice) handleQuizSubmit();
      } else if (activeTab === 'QUIZ' && quizSubmitted && e.key === 'Enter') {
        handleNextQuestion();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeTab, cardFlipped, quizSubmitted, selectedChoice, currentQ]);

  // 指令面板动作配置
  const commandActions: CommandAction[] = [
    {
      id: 'nav-quiz',
      category: '导航',
      title: '前往自适应做题练习',
      subtitle: '多题型智能测评与客观秒判 (0ms)',
      icon: <Zap className="w-4 h-4" />,
      shortcut: 'Tab 1',
      onSelect: () => setActiveTab('QUIZ'),
    },
    {
      id: 'nav-cards',
      category: '导航',
      title: '前往 FSRS 卡片记忆工坊',
      subtitle: '支持 3D 翻转与 4 级间隔重复调度',
      icon: <Layers className="w-4 h-4" />,
      shortcut: 'Tab 2',
      onSelect: () => setActiveTab('CARDS'),
    },
    {
      id: 'nav-textbook',
      category: '导航',
      title: '前往结构化教材精读 (标日 / 大家的日语)',
      subtitle: '课文注音精读、核心词汇库与一键课后测验',
      icon: <BookOpen className="w-4 h-4" />,
      shortcut: 'Tab 3',
      onSelect: () => setActiveTab('TEXTBOOK'),
    },
    {
      id: 'nav-pitch',
      category: '导航',
      title: '前往 AI 日语声调与口语纠音',
      subtitle: '高低起伏走势线与实时声波跟读打分',
      icon: <Mic className="w-4 h-4" />,
      shortcut: 'Tab 4',
      onSelect: () => setActiveTab('PITCH'),
    },
    {
      id: 'nav-mistakes',
      category: '导航',
      title: '前往错题攻坚本',
      subtitle: `当前有 ${mistakes.filter((m) => !m.isResolved).length} 道待攻克疑难痛点`,
      icon: <AlertTriangle className="w-4 h-4" />,
      shortcut: 'Tab 5',
      onSelect: () => setActiveTab('MISTAKES'),
    },
    {
      id: 'nav-radar',
      category: '导航',
      title: '前往学情能力画像与打卡热力图',
      subtitle: '语法、词汇、听力多维雷达与弱项靶向加练',
      icon: <TrendingUp className="w-4 h-4" />,
      shortcut: 'Tab 6',
      onSelect: () => setActiveTab('RADAR'),
    },
    {
      id: 'drill-biaori-1',
      category: '教材直达',
      title: '《标准日本语 初级上》第 1 课 李さんは中国人です',
      subtitle: '肯定判断句与自我介绍专攻',
      icon: <BookOpen className="w-4 h-4" />,
      onSelect: () => handleStartLessonQuiz('biaori-l1', '标日第 1 课'),
    },
    {
      id: 'drill-biaori-2',
      category: '教材直达',
      title: '《标准日本语 初级上》第 2 课 これは何ですか',
      subtitle: '这/那/那事物指示代词专攻',
      icon: <BookOpen className="w-4 h-4" />,
      onSelect: () => handleStartLessonQuiz('biaori-l2', '标日第 2 课'),
    },
    {
      id: 'drill-particles',
      category: '专项攻坚',
      title: '格助词高频混淆专练 (で vs に vs を)',
      subtitle: '攻破外语学习最大母语负迁移陷阱',
      icon: <Flame className="w-4 h-4" />,
      onSelect: () => {
        setActiveTab('QUIZ');
        setQuestionIndex(0);
        toast.info('已为您切换至【格助词辨析】专项练习！');
      },
    },
    {
      id: 'sys-theme',
      category: '系统设置',
      title: theme === 'light' ? '切换为深焙炭石夜间模式' : '切换为温润纸面日间模式',
      subtitle: '纯自然护眼温润配色',
      icon: theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />,
      shortcut: 'Theme',
      onSelect: toggleTheme,
    },
  ];

  const tabs: {
    id: 'QUIZ' | 'CARDS' | 'TEXTBOOK' | 'PITCH' | 'MISTAKES' | 'RADAR';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: string;
  }[] = [
    { id: 'QUIZ', label: '自适应做题', icon: Zap, count: `${questionIndex + 1}/${INITIAL_QUESTIONS.length}` },
    { id: 'CARDS', label: 'FSRS 闪卡', icon: Layers, count: `${filteredCards.length}` },
    { id: 'TEXTBOOK', label: '教材精读', icon: BookOpen, count: '标日/大家的日语' },
    { id: 'PITCH', label: '声调纠音', icon: Mic, count: 'AI' },
    { id: 'MISTAKES', label: '错题攻坚', icon: AlertTriangle, count: `${mistakes.filter((m) => !m.isResolved).length}` },
    { id: 'RADAR', label: '学情画像', icon: TrendingUp },
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

      {/* 全局指令面板 */}
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        actions={commandActions}
      />

      {/* AI 导师深度剖析与追问抽屉 */}
      <AiTutorDrawer
        isOpen={isTutorOpen}
        onClose={() => setIsTutorOpen(false)}
        context={tutorContext}
      />

      {/* 顶部导航栏 */}
      <header className="border-b border-stone-200/80 dark:border-stone-800/80 bg-white/85 dark:bg-[#1a1917]/85 backdrop-blur-md sticky top-0 z-40 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.05, rotate: 2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => sound.playClick()}
              className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 text-stone-950 font-bold flex items-center justify-center shadow-sm cursor-pointer"
            >
              <GraduationCap className="w-5 h-5 text-stone-950" />
            </motion.div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-stone-900 dark:text-stone-100 tracking-tight font-serif">
                  Study Studio
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                  日语专项 · N5~N3
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">自适应外语自学与靶向攻坚系统</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* 快捷指令按钮 (Cmd+K) */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setIsCommandOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900/60 hover:border-amber-500/40 text-stone-600 dark:text-stone-300 text-xs font-medium transition-all"
            >
              <Command className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">快捷指令</span>
              <kbd className="text-[10px] font-mono px-1 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-500">
                ⌘K
              </kbd>
            </motion.button>

            {/* 连续打卡天数指示徽章 */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs font-semibold">
              <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
              <span>连续打卡 12 天</span>
            </div>

            <div className="h-5 w-px bg-stone-200 dark:bg-stone-800 hidden sm:block" />

            {/* 明暗模式切换 */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={toggleTheme}
              aria-label="切换明暗主题"
              className="p-2.5 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#211f1d] hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 shadow-2xs transition-all cursor-pointer"
            >
              {theme === 'light' ? (
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Moon className="w-4 h-4 text-amber-600" />
                  <span className="hidden md:inline">深色</span>
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
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6 relative z-10">
        {/* 滑动指示标签栏 */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-200/60 dark:bg-[#1f1d1b] rounded-2xl border border-stone-200/80 dark:border-stone-800 w-fit backdrop-blur-xs overflow-x-auto max-w-full">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  sound.playClick();
                  setActiveTab(tab.id);
                }}
                className={`relative px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors duration-200 flex items-center gap-2 cursor-pointer shrink-0 ${
                  isActive
                    ? 'text-amber-950 dark:text-amber-300 font-semibold'
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
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.count && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                          : 'bg-stone-200 dark:bg-stone-800 text-stone-500'
                      }`}
                    >
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
            {/* 顶部进度指示 */}
            <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 px-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                第 {questionIndex + 1} 题 / 共 {INITIAL_QUESTIONS.length} 题 · {currentQ.category}
              </span>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-[11px] text-stone-400 font-mono">
                  快捷键: 1-4 选选项 / Enter 提交
                </span>
                <span className="font-semibold text-amber-700 dark:text-amber-400 font-mono">
                  当前得分: {sessionScore}
                </span>
              </div>
            </div>

            {/* 题目主卡片 */}
            <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-3xl p-6 sm:p-8 border border-amber-900/10 dark:border-amber-500/15 shadow-sm space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300">
                    {currentQ.type === 'CHOICE' ? '单项选择题' : currentQ.type === 'FILL_BLANK' ? '填空变形题' : '连词成句题'}
                  </span>
                  <span className="text-xs text-stone-400 font-mono">
                    考查点: {currentQ.testedSkill}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-stone-500 dark:text-stone-400">
                  {currentQ.prompt}
                </h3>
                <div className="text-lg sm:text-xl font-medium text-stone-900 dark:text-stone-100 pt-2 tracking-wide font-serif">
                  {currentQ.content}
                </div>
              </div>

              {/* 题型 1: CHOICE (单选) */}
              {currentQ.type === 'CHOICE' && currentQ.options && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {currentQ.options.map((opt, optIdx) => {
                    const isSelected = selectedChoice === opt.key;
                    const showCorrect = quizSubmitted && opt.key === currentQ.correctAnswer;
                    const showWrong = quizSubmitted && isSelected && !isCurrentAnswerCorrect;

                    return (
                      <motion.button
                        key={opt.key}
                        whileHover={!quizSubmitted ? { scale: 1.01 } : {}}
                        whileTap={!quizSubmitted ? { scale: 0.99 } : {}}
                        disabled={quizSubmitted}
                        onClick={() => {
                          sound.playClick();
                          setSelectedChoice(opt.key);
                        }}
                        className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                          showCorrect
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-950 dark:text-emerald-200'
                            : showWrong
                            ? 'bg-rose-500/15 border-rose-500 text-rose-950 dark:text-rose-200'
                            : isSelected
                            ? 'bg-amber-500/15 border-amber-500 text-amber-950 dark:text-amber-100 ring-2 ring-amber-500/30'
                            : 'bg-stone-100/70 dark:bg-stone-900/50 border-stone-200/80 dark:border-stone-800 text-stone-800 dark:text-stone-200 hover:border-amber-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-stone-200/80 dark:bg-stone-800">
                            {opt.key} ({optIdx + 1})
                          </span>
                          {showCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                          {showWrong && <XCircle className="w-4 h-4 text-rose-600" />}
                        </div>
                        <div className="text-base font-semibold pt-1">{opt.text}</div>
                        {opt.note && (
                          <div className="text-xs text-stone-400 mt-1">{opt.note}</div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* 题型 2: FILL_BLANK (真实输入验证) */}
              {currentQ.type === 'FILL_BLANK' && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      disabled={quizSubmitted}
                      value={fillBlankInput}
                      onChange={(e) => setFillBlankInput(e.target.value)}
                      placeholder="在此键入日文变形形式..."
                      className="flex-1 py-3 px-4 rounded-xl bg-stone-100/90 dark:bg-stone-900/80 text-stone-900 dark:text-stone-100 border border-stone-300 dark:border-stone-700 outline-none focus:border-amber-500 text-base"
                    />
                  </div>
                </div>
              )}

              {/* 题型 3: REORDER (连词成句) */}
              {currentQ.type === 'REORDER' && currentQ.chunks && (
                <div className="space-y-4 pt-2">
                  <div className="min-h-14 p-3 rounded-2xl border-2 border-dashed border-amber-500/30 bg-amber-50/40 dark:bg-stone-900/40 flex flex-wrap gap-2 items-center">
                    {reorderSelectedChunks.length === 0 ? (
                      <span className="text-xs text-stone-400">
                        点击下方词块按正确语序填入此处...
                      </span>
                    ) : (
                      reorderSelectedChunks.map((chunk, idx) => (
                        <button
                          key={idx}
                          disabled={quizSubmitted}
                          onClick={() => {
                            sound.playClick();
                            setReorderSelectedChunks((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 text-stone-950 text-xs font-semibold shadow-sm flex items-center gap-1"
                        >
                          <span>{chunk}</span>
                          <span className="text-[10px] opacity-75">✕</span>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {currentQ.chunks.map((chunk, cIdx) => {
                      const isUsed = reorderSelectedChunks.includes(chunk);
                      return (
                        <button
                          key={cIdx}
                          disabled={isUsed || quizSubmitted}
                          onClick={() => {
                            sound.playClick();
                            setReorderSelectedChunks((prev) => [...prev, chunk]);
                          }}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                            isUsed
                              ? 'opacity-30 border-stone-200 dark:border-stone-800 cursor-not-allowed'
                              : 'bg-stone-100 dark:bg-stone-900 border-stone-300 dark:border-stone-700 hover:border-amber-500 text-stone-800 dark:text-stone-200'
                          }`}
                        >
                          {chunk}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 提交 / 下一题控制条 */}
              <div className="flex items-center justify-between pt-4 border-t border-stone-200 dark:border-stone-800">
                {!quizSubmitted ? (
                  <ShimmerButton
                    onClick={handleQuizSubmit}
                    disabled={
                      (currentQ.type === 'CHOICE' && !selectedChoice) ||
                      (currentQ.type === 'FILL_BLANK' && !fillBlankInput.trim()) ||
                      (currentQ.type === 'REORDER' && reorderSelectedChunks.length === 0)
                    }
                    className="px-6 py-2.5 text-xs font-bold"
                  >
                    立即提交判定 (0ms 本地秒判)
                  </ShimmerButton>
                ) : (
                  <button
                    onClick={handleNextQuestion}
                    className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs shadow-sm transition-all flex items-center gap-2"
                  >
                    <span>下一题练习</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* 答题反馈与解析抽屉入口 */}
              {quizSubmitted && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-2xl border space-y-3 ${
                    isCurrentAnswerCorrect
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-rose-500/10 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isCurrentAnswerCorrect ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-rose-600" />
                      )}
                      <span className="font-bold text-sm">
                        {isCurrentAnswerCorrect ? '解答正确！' : `解答有误，标准答案：${currentQ.correctAnswer}`}
                      </span>
                    </div>

                    {/* AI 导师深度追问入口按钮 */}
                    <button
                      onClick={() =>
                        handleOpenTutor({
                          questionText: currentQ.content,
                          userAnswer:
                            currentQ.type === 'CHOICE'
                              ? selectedChoice ?? undefined
                              : currentQ.type === 'FILL_BLANK'
                              ? fillBlankInput
                              : reorderSelectedChunks.join(' '),
                          correctAnswer: currentQ.correctAnswer,
                          skillTag: currentQ.category,
                          explanation: currentQ.explanation,
                        })
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-500 text-stone-950 hover:bg-amber-600 shadow-sm transition-all shrink-0"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      <span>AI 导师深度剖析与追问</span>
                    </button>
                  </div>

                  <p className="text-xs sm:text-sm text-stone-700 dark:text-stone-300 leading-relaxed font-serif">
                    {currentQ.explanation}
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 2. FSRS 闪卡记忆工坊                                                      */}
        {/* ========================================================================= */}
        {activeTab === 'CARDS' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-5 max-w-2xl"
          >
            <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <span>
                当前卡片: {currentCardIndex + 1} / {filteredCards.length}
              </span>
              <div className="flex items-center gap-1 bg-stone-200/60 dark:bg-stone-900 p-1 rounded-xl">
                {(['ALL', 'VOCAB', 'GRAMMAR', 'CONFUSION'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      sound.playClick();
                      setCardFilter(cat);
                      setCurrentCardIndex(0);
                      setCardFlipped(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      cardFilter === cat
                        ? 'bg-[#faf9f6] dark:bg-amber-600 text-stone-900 dark:text-white shadow-sm font-semibold'
                        : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {cat === 'ALL' ? '全部' : cat === 'VOCAB' ? '生词' : cat === 'GRAMMAR' ? '文法' : '混淆'}
                  </button>
                ))}
              </div>
            </div>

            {/* 3D 翻转卡片 */}
            {activeCard && (
              <div
                onClick={() => {
                  sound.playClick();
                  setCardFlipped((prev) => !prev);
                }}
                className="perspective-1000 min-h-[340px] cursor-pointer"
              >
                <motion.div
                  animate={{ rotateY: cardFlipped ? 180 : 0 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  className="relative w-full h-full min-h-[340px] rounded-3xl p-8 bg-[#faf9f6] dark:bg-[#1a1816] border border-amber-900/10 dark:border-amber-500/15 shadow-sm transform-style-3d flex flex-col justify-between"
                >
                  {/* 正面 */}
                  {!cardFlipped ? (
                    <div className="flex flex-col justify-between h-full space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300">
                          {activeCard.tag} · {activeCard.pos}
                        </span>
                        <span className="text-xs text-stone-400 font-mono">
                          FSRS 稳定性: {activeCard.stability}d · 复习 {activeCard.reps} 次
                        </span>
                      </div>
                      <div className="text-center py-8">
                        <h2 className="text-4xl sm:text-5xl font-bold font-serif text-stone-900 dark:text-stone-100 tracking-wide">
                          {activeCard.frontWord}
                        </h2>
                        {activeCard.reading && (
                          <p className="text-sm text-amber-700 dark:text-amber-400 font-mono mt-2">
                            {activeCard.reading}
                          </p>
                        )}
                      </div>
                      <div className="text-center text-xs text-stone-400">
                        点击卡片或按 <kbd className="font-mono bg-stone-200 dark:bg-stone-800 px-1.5 py-0.5 rounded">Space</kbd> 翻转查看释义
                      </div>
                    </div>
                  ) : (
                    /* 背面 */
                    <div className="flex flex-col justify-between h-full space-y-4 [transform:rotateY(180deg)]">
                      <div className="space-y-3">
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                          中文释义与核心考点
                        </span>
                        <h3 className="text-xl sm:text-2xl font-bold font-serif text-stone-900 dark:text-stone-100">
                          {activeCard.backMeaning}
                        </h3>
                        <div className="p-3.5 rounded-xl bg-amber-500/10 dark:bg-stone-900/60 border border-amber-900/5 text-xs space-y-1">
                          <p className="font-medium text-stone-900 dark:text-stone-100">
                            {activeCard.exampleJp}
                          </p>
                          <p className="text-stone-500 dark:text-stone-400 font-serif">
                            {activeCard.exampleZh}
                          </p>
                        </div>
                        {activeCard.note && (
                          <p className="text-xs text-amber-800 dark:text-amber-300">
                            💡 {activeCard.note}
                          </p>
                        )}
                      </div>

                      {/* FSRS 4 档打分按钮 */}
                      <div className="grid grid-cols-4 gap-2 pt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardReview('AGAIN');
                          }}
                          className="p-2.5 rounded-xl bg-stone-200/80 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs font-bold hover:bg-rose-500 hover:text-white transition-all"
                        >
                          重来 (1)
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardReview('HARD');
                          }}
                          className="p-2.5 rounded-xl bg-stone-200/80 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs font-bold hover:bg-amber-500 hover:text-stone-950 transition-all"
                        >
                          困难 (2)
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardReview('GOOD');
                          }}
                          className="p-2.5 rounded-xl bg-amber-500 text-stone-950 text-xs font-bold hover:bg-amber-600 shadow-sm transition-all"
                        >
                          良好 (3)
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardReview('EASY');
                          }}
                          className="p-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm transition-all"
                        >
                          简单 (4)
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 3. 教材结构化知识树与精读导读器 (标日 / 大家的日语)                      */}
        {/* ========================================================================= */}
        {activeTab === 'TEXTBOOK' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <TextbookCurriculum
              onStartLessonQuiz={handleStartLessonQuiz}
              onAddCardFromTextbook={handleAddCardFromTextbook}
            />
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 4. AI 日语声调走向与口语纠音评测器                                        */}
        {/* ========================================================================= */}
        {activeTab === 'PITCH' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <PitchAccentCoach />
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 5. 错题攻坚本模块                                                         */}
        {/* ========================================================================= */}
        {activeTab === 'MISTAKES' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4 max-w-3xl"
          >
            <div className="flex items-center justify-between text-xs text-stone-500 px-1">
              <span>错题攻克规则：连续订正正确 2 次即自动标记攻克</span>
              <div className="flex items-center gap-1 bg-stone-200/60 dark:bg-stone-900 p-1 rounded-xl">
                {(['ALL', 'UNRESOLVED', 'RESOLVED'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setMistakeFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      mistakeFilter === f
                        ? 'bg-[#faf9f6] dark:bg-amber-600 text-stone-900 dark:text-white shadow-sm font-semibold'
                        : 'text-stone-500'
                    }`}
                  >
                    {f === 'ALL' ? '全部' : f === 'UNRESOLVED' ? '未攻克' : '已攻克'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {mistakes
                .filter((m) =>
                  mistakeFilter === 'ALL'
                    ? true
                    : mistakeFilter === 'UNRESOLVED'
                    ? !m.isResolved
                    : m.isResolved
                )
                .map((m) => (
                  <div
                    key={m.id}
                    className="p-5 rounded-2xl bg-[#faf9f6] dark:bg-[#1a1816] border border-amber-900/10 dark:border-amber-500/15 shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
                          {m.categoryTag}
                        </span>
                        {m.isResolved ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                            ✓ 已成功攻克
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 font-mono">
                            连对进度: {m.consecutiveCorrect}/2
                          </span>
                        )}
                      </div>

                      {/* AI 导师针对错题诊断 */}
                      <button
                        onClick={() =>
                          handleOpenTutor({
                            questionText: m.sentence,
                            userAnswer: m.userWrongAnswer,
                            correctAnswer: m.correctAnswer,
                            skillTag: m.categoryTag,
                            explanation: m.reviewNote,
                          })
                        }
                        className="text-xs text-amber-700 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>AI 导师诊断</span>
                      </button>
                    </div>

                    <div className="text-sm font-medium text-stone-900 dark:text-stone-100 font-serif">
                      {m.sentence}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-rose-500/10 text-rose-800 dark:text-rose-300">
                        你的误答：<span className="font-bold">{m.userWrongAnswer}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                        标准答案：<span className="font-bold">{m.correctAnswer}</span>
                      </div>
                    </div>

                    <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed font-serif">
                      💡 归因点拨：{m.reviewNote}
                    </p>

                    {!m.isResolved && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleResolveMistakeRetry(m.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold shadow-sm transition-all"
                        >
                          立即订正攻克 (连对 2 次攻克)
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* 6. 学情能力画像与连续学习打卡热力图                                       */}
        {/* ========================================================================= */}
        {activeTab === 'RADAR' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 max-w-4xl"
          >
            {/* 连续学习与 28 天热力图组件 */}
            <StudyStreakHeatmap />

            {/* 掌握度细项雷达 */}
            <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-5 border border-amber-900/10 dark:border-amber-500/15 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  多维技能画像 (Learner Skill Profile)
                </h3>
                <div className="flex items-center gap-1 text-xs">
                  {['ALL', 'GRAMMAR', 'VOCAB', 'LISTENING', 'NUANCE'].map((dim) => (
                    <button
                      key={dim}
                      onClick={() => setMetricDimension(dim)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        metricDimension === dim
                          ? 'bg-amber-500 text-stone-950 font-bold'
                          : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                      }`}
                    >
                      {dim === 'ALL' ? '全部' : dim === 'GRAMMAR' ? '文法' : dim === 'VOCAB' ? '词汇' : dim === 'LISTENING' ? '听力' : '语感'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {metrics
                  .filter((m) => metricDimension === 'ALL' || m.dimension === metricDimension)
                  .map((metric) => {
                    const isWeak = metric.proficiency < 0.6;
                    const isStrong = metric.proficiency >= 0.85;

                    return (
                      <div
                        key={metric.id}
                        className="p-4 rounded-xl bg-stone-100/70 dark:bg-stone-900/50 border border-stone-200/80 dark:border-stone-800 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-stone-800 dark:text-stone-200">
                            {metric.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-mono font-bold ${
                              isStrong
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : isWeak
                                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            {Math.round(metric.proficiency * 100)}%
                          </span>
                        </div>

                        {/* 进度条 */}
                        <div className="w-full bg-stone-200 dark:bg-stone-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isStrong
                                ? 'bg-emerald-500'
                                : isWeak
                                ? 'bg-rose-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${metric.proficiency * 100}%` }}
                          />
                        </div>

                        <div className="flex justify-between items-center text-[11px] text-stone-400 pt-1">
                          <span>总练习 {metric.totalAttempts} 次 · 连续错误 {metric.consecutiveErrors} 次</span>
                          {isWeak && (
                            <button
                              onClick={() => {
                                sound.playClick();
                                setActiveTab('QUIZ');
                                toast.info(`已为您调取针对【${metric.name}】的加练题目！`);
                              }}
                              className="text-amber-700 dark:text-amber-400 font-bold hover:underline"
                            >
                              靶向加练 →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
