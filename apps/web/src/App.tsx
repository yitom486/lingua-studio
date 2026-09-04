import React from 'react';
import { motion } from 'framer-motion';
import { Toaster } from 'sonner';
import { DotPattern } from './components/magicui/index.js';
import { CommandPalette } from './components/CommandPalette.js';
import { AiTutorDrawer } from './components/AiTutorDrawer.js';
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
import { useCommandActions, useStartLessonQuiz } from './hooks/useCommandActions.js';
import { usePreferencesStore } from './stores/usePreferencesStore.js';
import { useStudySessionStore } from './stores/useStudySessionStore.js';
import {
  useQuestionsQuery,
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
  const activeTab = useStudySessionStore((s) => s.activeTab);
  const isCommandOpen = useStudySessionStore((s) => s.isCommandOpen);
  const setIsCommandOpen = useStudySessionStore((s) => s.setIsCommandOpen);
  const questionIndex = useStudySessionStore((s) => s.questionIndex);
  const isTutorOpen = useStudySessionStore((s) => s.isTutorOpen);
  const tutorContext = useStudySessionStore((s) => s.tutorContext);
  const openTutor = useStudySessionStore((s) => s.openTutor);
  const closeTutor = useStudySessionStore((s) => s.closeTutor);

  const { data: questions = [] } = useQuestionsQuery();
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
      } transition-colors duration-200 flex flex-col font-sans relative overflow-x-hidden`}
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
      <AiTutorDrawer isOpen={isTutorOpen} onClose={closeTutor} context={tutorContext} />

      <AppHeader gateway={gateway} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6 relative z-10">
        <NavigationTabs
          quizProgress={`${Math.min(questionIndex + 1, questions.length)}/${questions.length || 1}`}
          cardCount={cards.length}
          unresolvedMistakeCount={unresolvedMistakesCount}
        />

        {activeTab === 'QUIZ' && (
          <AdaptiveQuizWorkbench
            onOpenTutor={(ctx) => {
              sound.playClick();
              openTutor(ctx);
            }}
            onGradeSubjective={gateway.gradeSubjectiveQuiz}
            onSubmitQuizToGateway={gateway.submitQuizToGateway}
            isGatewayConnected={gateway.isConnected}
            onGenerateAdaptiveQuizApi={gateway.generateAdaptiveQuiz}
          />
        )}

        {activeTab === 'CARDS' && (
          <FsrsCardWorkbench onReviewCardToGateway={gateway.reviewCardToGateway} />
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
      </main>
    </div>
  );
}
