import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Toaster } from 'sonner';
import { DotPattern } from './components/magicui/index.js';
import { CommandPalette } from './components/CommandPalette.js';
import { AiTutorDrawer } from './components/AiTutorDrawer.js';
import { AppHeader } from './components/AppHeader.js';
import { AppSidebar } from './components/AppSidebar.js';
import { AdaptiveQuizWorkbench } from './components/AdaptiveQuizWorkbench.js';
import { FsrsCardWorkbench } from './components/FsrsCardWorkbench.js';
import { TextbookCurriculum } from './components/TextbookCurriculum.js';
import { ListeningShadowingWorkbench } from './components/ListeningShadowingWorkbench.js';
import { PitchAccentCoach } from './components/PitchAccentCoach.js';
import { MistakeSprintWorkbench } from './components/MistakeSprintWorkbench.js';
import { LearnerRadarDashboard } from './components/LearnerRadarDashboard.js';
import { ReadingComprehensionWorkbench } from './components/ReadingComprehensionWorkbench.js';
import { WritingStudioWorkbench } from './components/WritingStudioWorkbench.js';
import { KanaStudioWorkbench } from './components/KanaStudioWorkbench.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import { useGateway } from './hooks/useGateway.js';
import { useLearningShell } from './hooks/useLearningShell.js';
import { useCommandActions, useStartLessonQuiz } from './hooks/useCommandActions.js';
import { usePreferencesStore } from './stores/usePreferencesStore.js';
import { useStudySessionStore } from './stores/useStudySessionStore.js';
import { useUserProfileStore } from './stores/useUserProfileStore.js';
import {
  useCardsQuery,
  useMistakesQuery,
  useLearnerProfileQuery,
  useAddCardsMutation,
  useAddMistakeMutation,
  vocabToStudyCard,
} from './queries/useLearnerQueries.js';
import { sound } from './utils/audio.js';

export function App() {
  const gateway = useGateway();
  const theme = usePreferencesStore((s) => s.theme);
  const shell = useLearningShell();
  const activeTab = useStudySessionStore((s) => s.activeTab);
  const setActiveTab = useStudySessionStore((s) => s.setActiveTab);
  const isCommandOpen = useStudySessionStore((s) => s.isCommandOpen);
  const setIsCommandOpen = useStudySessionStore((s) => s.setIsCommandOpen);
  const isTutorOpen = useStudySessionStore((s) => s.isTutorOpen);
  const tutorContext = useStudySessionStore((s) => s.tutorContext);
  const openTutor = useStudySessionStore((s) => s.openTutor);
  const closeTutor = useStudySessionStore((s) => s.closeTutor);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Tab 路由守卫：当目标语种切换后当前活跃 Tab 若不合法，自动降级跳回 fallbackTab
  useEffect(() => {
    if (!shell.allowedTabs.includes(activeTab)) {
      setActiveTab(shell.fallbackTab);
    }
  }, [activeTab, shell.allowedTabs, shell.fallbackTab, setActiveTab]);

  // 切轨道时清空 Agent 灌入的临时题包，避免 EN 题包压住 KO Query 结果
  useEffect(() => {
    useStudySessionStore.getState().clearPresentedQuiz();
    useStudySessionStore.getState().setQuestionIndex(0);
  }, [shell.track]);

  const fetchProfile = useUserProfileStore((s) => s.fetchProfile);
  const recordActivity = useUserProfileStore((s) => s.recordActivity);

  // 等 Zustand persist 水合后再拉远端，避免默认 en 抢先覆盖本地已存的韩语/日语轨道
  useEffect(() => {
    const run = () => {
      void fetchProfile();
    };
    if (useUserProfileStore.persist.hasHydrated()) {
      run();
      return;
    }
    return useUserProfileStore.persist.onFinishHydration(run);
  }, [fetchProfile]);

  const handleSubmitQuiz = useCallback(
    (payload: any) => {
      gateway.submitQuizToGateway(payload);
      recordActivity({ quizzes: 1 });
    },
    [gateway, recordActivity]
  );

  const handleReviewCard = useCallback(
    (payload: any) => {
      gateway.reviewCardToGateway(payload);
      recordActivity({ cards: 1 });
    },
    [gateway, recordActivity]
  );

  const { data: cards = [] } = useCardsQuery();
  const { data: mistakes = [] } = useMistakesQuery();
  const { data: metrics = [] } = useLearnerProfileQuery();
  const addCards = useAddCardsMutation();
  const addMistake = useAddMistakeMutation();
  const startLessonQuiz = useStartLessonQuiz();

  const unresolvedMistakesCount = mistakes.filter((m) => !m.isResolved).length;
  const commandActions = useCommandActions(unresolvedMistakesCount);

  return (
    <div
      className={`min-h-screen ${
        theme === 'dark' ? 'dark bg-[#141312] text-stone-100' : 'bg-[#fbfaf8] text-stone-800'
      } transition-colors duration-200 flex font-sans relative overflow-x-hidden`}
    >
      <Toaster position="top-center" richColors />
      <DotPattern
        width={26}
        height={26}
        cx={1.5}
        cy={1.5}
        cr={1}
        className="opacity-45 dark:opacity-15"
      />

      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        actions={commandActions}
      />
      <AiTutorDrawer
        isOpen={isTutorOpen}
        onClose={closeTutor}
        context={tutorContext}
        gateway={gateway}
      />

      <AppSidebar
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
      />

      <div className="flex-1 min-w-0 flex flex-col relative z-10">
        <AppHeader gateway={gateway} onOpenMobileNav={() => setMobileNavOpen(true)} />

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
          <ErrorBoundary
            key={`${shell.track}-${activeTab}`}
            variant="embedded"
            title="当前工作区遇到临时渲染异常"
            message="此模块由于外部数据或音频上下文发生了临时异常。您的个人学情资产已安全持久化，可点击下方按钮重新加载。"
          >
            {activeTab === 'QUIZ' && (
              <AdaptiveQuizWorkbench
                key={shell.track}
                onOpenTutor={(ctx) => {
                  sound.playClick();
                  openTutor(ctx);
                }}
                onGradeSubjective={gateway.gradeSubjectiveQuiz}
                onSubmitQuizToGateway={handleSubmitQuiz}
                isGatewayConnected={gateway.isConnected}
                onGenerateAdaptiveQuizApi={gateway.generateAdaptiveQuiz}
              />
            )}

            {activeTab === 'CARDS' && (
              <FsrsCardWorkbench key={shell.track} onReviewCardToGateway={handleReviewCard} />
            )}

            {activeTab === 'READING' && (
              <ReadingComprehensionWorkbench
                key={shell.track}
                onOpenTutor={(ctx) => {
                  sound.playClick();
                  openTutor(ctx);
                }}
              />
            )}

            {activeTab === 'WRITING' && (
              <WritingStudioWorkbench
                key={shell.track}
                onGradeSubjective={gateway.gradeSubjectiveQuiz}
              />
            )}

            {activeTab === 'TEXTBOOK' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <TextbookCurriculum
                  onStartLessonQuiz={startLessonQuiz}
                  onAddCardFromTextbook={(vocab) => addCards.mutate([vocabToStudyCard(vocab)])}
                  onAddCardsBatch={(list) =>
                    addCards.mutate(list.map((v, i) => vocabToStudyCard(v, i)))
                  }
                  onAskAiTutor={(selectedText, contextPrompt) => {
                    sound.playClick();
                    openTutor({
                      questionText: `${contextPrompt} “${selectedText}”`,
                      correctAnswer: selectedText,
                      skillTag: '教材精读 · 句法剖析',
                      explanation: `当前选中教材句段：“${selectedText}”。重点关注助词接续与语境敬体/简体用法。`,
                    });
                  }}
                />
              </motion.div>
            )}

            {activeTab === 'SHADOWING' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <ListeningShadowingWorkbench
                  onOpenTutor={(ctx) => {
                    sound.playClick();
                    openTutor(ctx);
                  }}
                  onAddMistake={(item) => addMistake.mutate(item)}
                />
              </motion.div>
            )}

            {activeTab === 'PITCH' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <PitchAccentCoach />
              </motion.div>
            )}

            {activeTab === 'KANA' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <KanaStudioWorkbench
                  onOpenTutor={(ctx) => {
                    sound.playClick();
                    openTutor(ctx);
                  }}
                />
              </motion.div>
            )}

            {activeTab === 'MISTAKES' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <MistakeSprintWorkbench
                  onOpenTutor={(ctx) => {
                    sound.playClick();
                    openTutor(ctx);
                  }}
                />
              </motion.div>
            )}

            {activeTab === 'RADAR' && (
              <LearnerRadarDashboard
                metrics={metrics}
                activeCardsCount={cards.length}
                unresolvedMistakesCount={unresolvedMistakesCount}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
