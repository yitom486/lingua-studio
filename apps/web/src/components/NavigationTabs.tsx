import React from 'react';
import {
  Zap,
  Layers,
  BookOpen,
  Headphones,
  Mic,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from './ui/tabs.js';
import { Badge } from './ui/badge.js';
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
    <Tabs
      value={activeTab}
      onValueChange={(val) => {
        sound.playClick();
        if (val) setActiveTab(val as NavigationTab);
      }}
      className="w-full overflow-x-auto"
    >
      <TabsList className="w-fit backdrop-blur-xs max-w-full">
        <TabsIndicator />
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <TabsTrigger key={tab.id} value={tab.id}>
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count && (
                <Badge
                  variant={isActive ? 'amber' : 'secondary'}
                  className="px-1.5 py-0 text-[10px] font-bold rounded-full pointer-events-none"
                >
                  {tab.count}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
