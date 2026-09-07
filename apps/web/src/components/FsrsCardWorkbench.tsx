import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import type { CardReviewRating } from '@study-studio/protocol';
import { fireSuccessConfetti } from './magicui/index.js';
import { sound, type SupportedLanguage } from '../utils/audio.js';
import { UnifiedTtsPlayer } from './UnifiedTtsPlayer.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { useCardsQuery, useUpdateCardMutation } from '../queries/useLearnerQueries.js';
import { useLearningShell } from '../hooks/useLearningShell.js';
import { trackToSpeechLang } from '../config/tts-voice-personas.js';
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from './ui/tabs.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { PracticeQueueToCardsPanel } from './PracticeQueueToCardsPanel.js';
import { DictionaryLookupPanel } from './DictionaryLookupPanel.js';
import { ApkgImportDialog } from './ApkgImportDialog.js';
import { PlanIntentBanner } from './PlanIntentBanner.js';
import type { StudyCardItem } from '../models/learning.js';

export function FsrsCardWorkbench() {
  const { data: cards = [] } = useCardsQuery();
  const updateCard = useUpdateCardMutation();
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [apkgOpen, setApkgOpen] = useState(false);
  const shell = useLearningShell();
  const cardSpeechLang: SupportedLanguage = trackToSpeechLang(shell.track);
  const dictionaryCopy =
    shell.track === 'en'
      ? {
          title: '英语生词本',
          helper: '查询已安装的离线英语词典；加入后由 FSRS 计算每日复习安排。',
        }
      : shell.track === 'ja'
        ? {
            title: '日语生词本',
            helper: '优先查询本地词典；未收录时可跳转 OJAD 自行确认，加入后由 FSRS 安排复习。',
          }
        : {
            title: '韩语生词本',
            helper: '查询本地词典；加入后由 FSRS 计算每日复习安排。',
          };

  const cardFilter = useStudySessionStore((s) => s.cardFilter);
  const setCardFilter = useStudySessionStore((s) => s.setCardFilter);

  const filteredCards = cards.filter((c) => cardFilter === 'ALL' || c.type === cardFilter);
  const activeCard: StudyCardItem | undefined = filteredCards[currentCardIndex] || filteredCards[0];

  const handleCardReview = (rating: CardReviewRating) => {
    sound.playClick();
    if (!activeCard) return;

    updateCard.mutate(
      {
        id: activeCard.id,
        rating,
      },
      {
        onSuccess: (data) => {
          setCardFlipped(false);

          const nextDays = data.nextReviewDays ?? Math.round(data.nextFsrs.stability);
          if (rating === 'GOOD' || rating === 'EASY') {
            sound.playSuccess();
            fireSuccessConfetti();
            toast.success(`评级成功：下次复习将在 ${nextDays} 天后`);
          } else {
            sound.playMistake();
            toast('已加入今日重练队列，稍后将再次强化。');
          }

          if (currentCardIndex < filteredCards.length - 1) {
            setCurrentCardIndex((prev) => prev + 1);
          } else {
            setCurrentCardIndex(0);
          }
        },
        onError: (e) => {
          sound.playMistake();
          toast.error(e instanceof Error ? e.message : '保存复习状态失败，请稍后重试。');
        },
      }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5 max-w-2xl"
    >
      <PlanIntentBanner />
      <PracticeQueueToCardsPanel />

      <DictionaryLookupPanel
        language={shell.track}
        title={dictionaryCopy.title}
        helper={dictionaryCopy.helper}
      />

      <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 gap-3">
        <span>
          当前卡片: {filteredCards.length ? currentCardIndex + 1 : 0} / {filteredCards.length}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              sound.playClick();
              setApkgOpen(true);
            }}
          >
            从 Anki 搬家
          </Button>
        <Tabs
          value={cardFilter}
          onValueChange={(val) => {
            if (!val) return;
            sound.playClick();
            setCardFilter(val as typeof cardFilter);
            setCurrentCardIndex(0);
            setCardFlipped(false);
          }}
        >
          <TabsList className="bg-stone-200/60 dark:bg-stone-900">
            <TabsIndicator />
            {(
              [
                ['ALL', '全部'],
                ['VOCAB', '生词'],
                ['GRAMMAR', '文法'],
                ['CONFUSION', '混淆'],
              ] as const
            ).map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="px-2.5 py-1 text-xs">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        </div>
      </div>

      <ApkgImportDialog open={apkgOpen} onOpenChange={setApkgOpen} />

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
            {!cardFlipped ? (
              <div className="flex flex-col justify-between h-full space-y-6">
                <div className="flex items-center justify-between">
                  <Badge variant="amber">
                    {activeCard.tag} · {activeCard.pos}
                  </Badge>
                  <span className="text-xs text-stone-400 font-mono">
                    FSRS 稳定性: {activeCard.stability}d · 复习 {activeCard.reps} 次
                  </span>
                </div>
                <div className="text-center py-8 flex flex-col items-center">
                  <h2 className="text-4xl sm:text-5xl font-bold font-serif text-stone-900 dark:text-stone-100 tracking-wide">
                    {activeCard.frontWord}
                  </h2>
                  {activeCard.reading && (
                    <p className="text-sm text-amber-700 dark:text-amber-400 font-mono mt-2">
                      {activeCard.reading}
                    </p>
                  )}
                  <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                    <UnifiedTtsPlayer
                      variant="button"
                      text={activeCard.frontWord}
                      lang={cardSpeechLang}
                      label="听发音"
                    />
                  </div>
                </div>
                <div className="text-center text-xs text-stone-400">
                  点击卡片或按{' '}
                  <kbd className="font-mono bg-stone-200 dark:bg-stone-800 px-1.5 py-0.5 rounded">
                    Space
                  </kbd>{' '}
                  翻转查看释义
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-4 [transform:rotateY(180deg)]">
                <div className="space-y-3">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                    中文释义与核心考点
                  </span>
                  <h3 className="text-xl sm:text-2xl font-bold font-serif text-stone-900 dark:text-stone-100">
                    {activeCard.backMeaning}
                  </h3>
                  <div className="p-3.5 rounded-xl bg-amber-500/10 dark:bg-stone-900/60 border border-amber-900/5 text-xs space-y-1">
                    <div className="font-medium text-stone-900 dark:text-stone-100 flex items-center justify-between">
                      <span>{activeCard.exampleJp}</span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <UnifiedTtsPlayer
                          variant="inline"
                          text={activeCard.exampleJp}
                          lang={cardSpeechLang}
                        />
                      </span>
                    </div>
                    <p className="text-stone-500 dark:text-stone-400 font-serif">
                      {activeCard.exampleZh}
                    </p>
                  </div>
                  {activeCard.note && (
                    <p className="text-xs text-amber-800 dark:text-amber-300">💡 {activeCard.note}</p>
                  )}
                </div>

                <div
                  className="grid grid-cols-4 gap-2 pt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="secondary"
                    className="h-auto py-2.5 hover:bg-rose-500 hover:text-white"
                    onClick={() => handleCardReview('AGAIN')}
                  >
                    重来 (1)
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-auto py-2.5 hover:bg-amber-500 hover:text-stone-950"
                    onClick={() => handleCardReview('HARD')}
                  >
                    困难 (2)
                  </Button>
                  <Button className="h-auto py-2.5" onClick={() => handleCardReview('GOOD')}>
                    良好 (3)
                  </Button>
                  <Button
                    className="h-auto py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleCardReview('EASY')}
                  >
                    简单 (4)
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
