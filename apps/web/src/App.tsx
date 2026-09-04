import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import {
  BookOpen,
  Zap,
  Layers,
  Headphones,
  Mic,
  AlertTriangle,
  TrendingUp,
  Flame,
  Moon,
  Sun,
} from 'lucide-react';
import { generateId } from '@study-studio/shared';
import type { SkillMetric } from '@study-studio/learner-core';
import { DotPattern } from './components/magicui/index.js';
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
import { AiTutorDrawer, type AiTutorContext } from './components/AiTutorDrawer.js';
import { AppHeader } from './components/AppHeader.js';
import { NavigationTabs } from './components/NavigationTabs.js';
import { AdaptiveQuizWorkbench } from './components/AdaptiveQuizWorkbench.js';
import { FsrsCardWorkbench } from './components/FsrsCardWorkbench.js';
import { TextbookCurriculum } from './components/TextbookCurriculum.js';
import { ListeningShadowingWorkbench } from './components/ListeningShadowingWorkbench.js';
import { PitchAccentCoach } from './components/PitchAccentCoach.js';
import { MistakeSprintWorkbench } from './components/MistakeSprintWorkbench.js';
import { LearnerRadarDashboard } from './components/LearnerRadarDashboard.js';
import { useGateway } from './hooks/useGateway.js';
import { usePreferencesStore } from './stores/usePreferencesStore.js';
import { useStudySessionStore } from './stores/useStudySessionStore.js';

export function App() {
  // 网关实时双向通讯与数据库持久化钩子
  const gateway = useGateway();

  // Zustand 持久化与全局会话状态
  const theme = usePreferencesStore((s) => s.theme);
  const toggleTheme = usePreferencesStore((s) => s.toggleTheme);
  const activeTab = useStudySessionStore((s) => s.activeTab);
  const setActiveTab = useStudySessionStore((s) => s.setActiveTab);
  const isCommandOpen = useStudySessionStore((s) => s.isCommandOpen);
  const setIsCommandOpen = useStudySessionStore((s) => s.setIsCommandOpen);

  // AI 导师抽屉状态
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [tutorContext, setTutorContext] = useState<AiTutorContext | null>(null);

  // 1. 核心领域数据源 (自适应题目/FSRS卡片/错题本/多维能力画像)
  const [questions, setQuestions] = useState<QuizQuestionItem[]>(INITIAL_QUESTIONS);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [cards, setCards] = useState<StudyCardItem[]>(INITIAL_CARDS);
  const [mistakes, setMistakes] = useState<MistakeNotebookItem[]>(INITIAL_MISTAKES);
  const [metrics] = useState<SkillMetric[]>(SKILL_METRICS_JP);

  // 2. 跨模块联动事件处理
  const handleOpenTutor = (ctx: AiTutorContext) => {
    sound.playClick();
    setTutorContext(ctx);
    setIsTutorOpen(true);
  };

  // 教材课程联动：启动课后专属自测
  const handleStartLessonQuiz = (lessonId: string, lessonTitle: string) => {
    setActiveTab('QUIZ');
    if (lessonId === 'biaori-l1') {
      setQuestionIndex(4); // 第 1 课针对题
    } else if (lessonId === 'biaori-l2') {
      setQuestionIndex(5); // 第 2 课针对题
    } else {
      setQuestionIndex(0);
    }
    toast.success(`已为您载入《${lessonTitle}》专属测评题！`);
  };

  // 教材课程联动：加入单张生词卡
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

  // 批量导入生词卡 (教材一键提取)
  const handleAddCardsBatch = (newCards: { front: string; back: string; category: string; prompt: string }[]) => {
    const cardsToAdd: StudyCardItem[] = newCards.map((vocab, idx) => ({
      id: `card_tb_${Date.now()}_${idx}`,
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
    }));
    setCards((prev) => [...cardsToAdd, ...prev]);
  };

  // 教材划词唤起 AI 导师深度点拨
  const handleAskTutorFromTextbook = (selectedText: string, contextPrompt: string) => {
    handleOpenTutor({
      questionText: `${contextPrompt} “${selectedText}”`,
      correctAnswer: selectedText,
      skillTag: '教材精读 · 句法剖析',
      explanation: `当前选中教材句段：“${selectedText}”。重点关注助词接续与语境敬体/简体用法。`,
    });
  };

  // 错题攻克结果更新 (两连对攻克)
  const handleUpdateMistakeStatus = (mistakeId: string, isCorrect: boolean) => {
    setMistakes((prev) =>
      prev.map((m) => {
        if (m.id !== mistakeId) return m;
        const newCount = isCorrect ? m.consecutiveCorrect + 1 : 0;
        const isResolved = newCount >= 2;
        return {
          ...m,
          consecutiveCorrect: newCount,
          isResolved,
        };
      })
    );
  };

  // 听力听写错题自动归入错题本
  const handleAddMistakeFromListening = (item: {
    categoryTag: string;
    prompt: string;
    sentence: string;
    userWrongAnswer: string;
    correctAnswer: string;
    testedSkillId: string;
    reviewNote: string;
  }) => {
    const newEntry: MistakeNotebookItem = {
      id: generateId('msk_listen'),
      categoryTag: item.categoryTag,
      prompt: item.prompt,
      sentence: item.sentence,
      userWrongAnswer: item.userWrongAnswer,
      correctAnswer: item.correctAnswer,
      testedSkillId: item.testedSkillId,
      reviewNote: item.reviewNote,
      consecutiveCorrect: 0,
      isResolved: false,
    };
    setMistakes((prev) => [newEntry, ...prev]);
  };

  // 3. 全局 Cmd+K 快捷指令菜单定义
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
      id: 'nav-shadowing',
      category: '导航',
      title: '前往听力精听与影子跟读工作台',
      subtitle: '短句切片原声循环、假名遮罩与关键助词听写',
      icon: <Headphones className="w-4 h-4" />,
      shortcut: 'Tab 4',
      onSelect: () => setActiveTab('SHADOWING'),
    },
    {
      id: 'nav-pitch',
      category: '导航',
      title: '前往 AI 日语声调与口语纠音',
      subtitle: '高低起伏走势线与实时声波跟读打分',
      icon: <Mic className="w-4 h-4" />,
      shortcut: 'Tab 5',
      onSelect: () => setActiveTab('PITCH'),
    },
    {
      id: 'nav-mistakes',
      category: '导航',
      title: '前往错题智能攻坚台',
      subtitle: `当前有 ${mistakes.filter((m) => !m.isResolved).length} 道待攻克疑难痛点`,
      icon: <AlertTriangle className="w-4 h-4" />,
      shortcut: 'Tab 6',
      onSelect: () => setActiveTab('MISTAKES'),
    },
    {
      id: 'nav-radar',
      category: '导航',
      title: '前往学情能力画像与打卡热力图',
      subtitle: '语法、词汇、听力多维雷达与弱项靶向加练',
      icon: <TrendingUp className="w-4 h-4" />,
      shortcut: 'Tab 7',
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

  const unresolvedMistakesCount = mistakes.filter((m) => !m.isResolved).length;

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

      {/* 全局指令面板 (Cmd+K) */}
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
      <AppHeader gateway={gateway} />

      {/* 主工作区 */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6 relative z-10">
        {/* 滑动指示标签栏 */}
        <NavigationTabs
          quizProgress={`${questionIndex + 1}/${questions.length}`}
          cardCount={cards.length}
          unresolvedMistakeCount={unresolvedMistakesCount}
        />

        {/* 1. 自适应做题评测工作台 */}
        {activeTab === 'QUIZ' && (
          <AdaptiveQuizWorkbench
            questions={questions}
            setQuestions={setQuestions}
            questionIndex={questionIndex}
            setQuestionIndex={setQuestionIndex}
            onOpenTutor={handleOpenTutor}
            onGradeSubjective={gateway.gradeSubjectiveQuiz}
            onSubmitQuizToGateway={gateway.submitQuizToGateway}
            isGatewayConnected={gateway.isConnected}
            onGenerateAdaptiveQuizApi={gateway.generateAdaptiveQuiz}
          />
        )}

        {/* 2. FSRS 闪卡记忆工坊 */}
        {activeTab === 'CARDS' && (
          <FsrsCardWorkbench
            cards={cards}
            setCards={setCards}
            onReviewCardToGateway={gateway.reviewCardToGateway}
          />
        )}

        {/* 3. 教材结构化知识树与精读导读器 */}
        {activeTab === 'TEXTBOOK' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <TextbookCurriculum
              onStartLessonQuiz={handleStartLessonQuiz}
              onAddCardFromTextbook={handleAddCardFromTextbook}
              onAddCardsBatch={handleAddCardsBatch}
              onAskAiTutor={handleAskTutorFromTextbook}
            />
          </motion.div>
        )}

        {/* 4. 听力精听与影子跟读工作台 */}
        {activeTab === 'SHADOWING' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <ListeningShadowingWorkbench
              onOpenTutor={handleOpenTutor}
              onAddMistake={handleAddMistakeFromListening}
            />
          </motion.div>
        )}

        {/* 5. AI 日语声调走向与口语纠音评测器 */}
        {activeTab === 'PITCH' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <PitchAccentCoach />
          </motion.div>
        )}

        {/* 6. 错题本智能归因与专项冲刺攻克工作台 */}
        {activeTab === 'MISTAKES' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <MistakeSprintWorkbench
              mistakes={mistakes}
              onUpdateMistake={handleUpdateMistakeStatus}
              onOpenTutor={handleOpenTutor}
            />
          </motion.div>
        )}

        {/* 7. 学情能力画像与打卡热力图 */}
        {activeTab === 'RADAR' && (
          <LearnerRadarDashboard
            metrics={metrics}
            activeCardsCount={cards.length}
            unresolvedMistakesCount={unresolvedMistakesCount}
          />
        )}
      </main>
    </div>
  );
}
