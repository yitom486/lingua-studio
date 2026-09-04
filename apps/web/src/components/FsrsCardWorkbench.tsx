import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { scheduleNextReview } from '@study-studio/learner-core';
import type { CardReviewRating } from '@study-studio/protocol';
import { fireSuccessConfetti } from './magicui/index.js';
import { sound } from '../utils/audio.js';
import { UnifiedTtsPlayer } from './UnifiedTtsPlayer.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import type { StudyCardItem } from '../data/learning-data.js';

interface FsrsCardWorkbenchProps {
  cards: StudyCardItem[];
  setCards: React.Dispatch<React.SetStateAction<StudyCardItem[]>>;
  onReviewCardToGateway: (payload: {
    cardId: string;
    rating: CardReviewRating;
    currentStability: number;
    currentReps: number;
  }) => void;
}

export function FsrsCardWorkbench({
  cards,
  setCards,
  onReviewCardToGateway,
}: FsrsCardWorkbenchProps) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  const cardFilter = useStudySessionStore((s) => s.cardFilter);
  const setCardFilter = useStudySessionStore((s) => s.setCardFilter);

  const filteredCards = cards.filter((c) => cardFilter === 'ALL' || c.type === cardFilter);
  const activeCard: StudyCardItem | undefined = filteredCards[currentCardIndex] || filteredCards[0];

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

    // 上报网关同步持久化
    onReviewCardToGateway({
      cardId: activeCard.id,
      rating,
      currentStability: activeCard.stability,
      currentReps: activeCard.reps,
    });

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

  return (
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
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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
                      lang="JA"
                      label="听发音"
                    />
                  </div>
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
                    <div className="font-medium text-stone-900 dark:text-stone-100 flex items-center justify-between">
                      <span>{activeCard.exampleJp}</span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <UnifiedTtsPlayer
                          variant="inline"
                          text={activeCard.exampleJp}
                          lang="JA"
                        />
                      </span>
                    </div>
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
                    className="p-2.5 rounded-xl bg-stone-200/80 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs font-bold hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
                  >
                    重来 (1)
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCardReview('HARD');
                    }}
                    className="p-2.5 rounded-xl bg-stone-200/80 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs font-bold hover:bg-amber-500 hover:text-stone-950 transition-all cursor-pointer"
                  >
                    困难 (2)
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCardReview('GOOD');
                    }}
                    className="p-2.5 rounded-xl bg-amber-500 text-stone-950 text-xs font-bold hover:bg-amber-600 shadow-sm transition-all cursor-pointer"
                  >
                    良好 (3)
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCardReview('EASY');
                    }}
                    className="p-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm transition-all cursor-pointer"
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
  );
}
