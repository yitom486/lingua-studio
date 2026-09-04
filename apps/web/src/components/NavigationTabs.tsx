import React from 'react';
import { motion } from 'framer-motion';
import {
  Zap,
  Layers,
  BookOpen,
  Headphones,
  Mic,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { sound } from '../utils/audio.js';
import { useStudySessionStore, type NavigationTab } from '../stores/useStudySessionStore.js';

interface NavigationTabsProps {
  quizProgress?: string;
  cardCount?: number;
  unresolvedMistakeCount?: number;
}

export function NavigationTabs({
  quizProgress,
  cardCount,
  unresolvedMistakeCount,
}: NavigationTabsProps) {
  const activeTab = useStudySessionStore((s) => s.activeTab);
  const setActiveTab = useStudySessionStore((s) => s.setActiveTab);

  const tabs: {
    id: NavigationTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: string | undefined;
  }[] = [
    { id: 'QUIZ', label: '自适应做题', icon: Zap, count: quizProgress },
    { id: 'CARDS', label: 'FSRS 闪卡', icon: Layers, count: cardCount !== undefined ? `${cardCount}` : undefined },
    { id: 'TEXTBOOK', label: '教材精读', icon: BookOpen, count: '标日/大家' },
    { id: 'SHADOWING', label: '听力跟读', icon: Headphones, count: '原声' },
    { id: 'PITCH', label: '声调纠音', icon: Mic, count: 'AI' },
    {
      id: 'MISTAKES',
      label: '错题攻坚',
      icon: AlertTriangle,
      count: unresolvedMistakeCount !== undefined ? `${unresolvedMistakeCount}` : undefined,
    },
    { id: 'RADAR', label: '学情画像', icon: TrendingUp },
  ];

  return (
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
  );
}
