import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Award, Layers, AlertTriangle } from 'lucide-react';
import { BentoGrid, BentoCard, NumberTicker } from './magicui/index.js';
import { StudyStreakHeatmap } from './StudyStreakHeatmap.js';
import { sound } from '../utils/audio.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import { useLearningShell } from '../hooks/useLearningShell.js';
import type { SkillMetric } from '@study-studio/learner-core';
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from './ui/tabs.js';
import { Button } from './ui/button.js';
import { Progress } from './ui/progress.js';
import { Badge } from './ui/badge.js';

interface LearnerRadarDashboardProps {
  metrics: SkillMetric[];
  activeCardsCount: number;
  unresolvedMistakesCount: number;
}

export function LearnerRadarDashboard({
  metrics,
  activeCardsCount,
  unresolvedMistakesCount,
}: LearnerRadarDashboardProps) {
  const [metricDimension, setMetricDimension] = useState<string>('ALL');
  const setActiveTab = useStudySessionStore((s) => s.setActiveTab);
  const profile = useUserProfileStore((s) => s.profile);
  const shell = useLearningShell();

  // 前端防御层：严禁非日语轨道混入 jp.* 日语技能，反之亦然
  const displayMetrics = useMemo<SkillMetric[]>(() => {
    return metrics.filter((m: SkillMetric) => {
      if (shell.track !== 'ja' && m.id.startsWith('jp.')) return false;
      if (shell.track !== 'en' && m.id.startsWith('en.')) return false;
      if (shell.track !== 'ko' && m.id.startsWith('ko.')) return false;
      return true;
    });
  }, [metrics, shell.track]);

  const overallPercent = Math.round((profile.overallProficiency || 0) * 100);
  const retentionPercent = Math.round((profile.retentionRate || 0) * 100);
  const levelLabel = overallPercent === 0 ? '待评测' : (profile.overallLevel || '稳步上升');

  const visibleMetrics = displayMetrics.filter(
    (m: SkillMetric) => metricDimension === 'ALL' || m.dimension === metricDimension
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-4xl"
    >
      {/* Magic UI BentoGrid 核心概览指标 */}
      <BentoGrid className="auto-rows-[9.5rem] md:grid-cols-3">
        <BentoCard
          name="综合语言掌握度"
          Icon={Award}
          description={`${shell.trackName}能力评估 · ${shell.copy.levelSchemeLabel}`}
        >
          <div className="flex items-baseline gap-1 pt-1">
            <span className="text-3xl font-bold font-mono text-amber-600 dark:text-amber-400">
              <NumberTicker value={overallPercent} />%
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              （{levelLabel}）
            </span>
          </div>
        </BentoCard>

        <BentoCard
          name="FSRS 记忆卡片库"
          Icon={Layers}
          description="4 级抗遗忘间隔重复智能调度"
        >
          <div className="flex items-baseline gap-1 pt-1">
            <span className="text-3xl font-bold font-mono text-amber-600 dark:text-amber-400">
              <NumberTicker value={activeCardsCount} />
            </span>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {profile.totalCardsReviewed > 0
                ? `张活跃卡片 · 稳固率 ${retentionPercent}%`
                : '张卡片 · 待开始复习'}
            </span>
          </div>
        </BentoCard>

        <BentoCard
          name="待攻克疑难痛点"
          Icon={AlertTriangle}
          description={shell.copy.targetWeaknessLabel}
        >
          <div className="flex items-baseline gap-1 pt-1">
            <span className="text-3xl font-bold font-mono text-rose-600 dark:text-rose-400">
              <NumberTicker value={unresolvedMistakesCount} />
            </span>
            <span className="text-xs text-stone-500 dark:text-stone-400">项弱点待清零</span>
          </div>
        </BentoCard>
      </BentoGrid>

      {/* 连续学习与 28 天热力图组件 */}
      <StudyStreakHeatmap />

      {/* 掌握度细项雷达 */}
      <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-5 border border-amber-900/10 dark:border-amber-500/15 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            {shell.trackName}技能画像 ({shell.copy.levelSchemeLabel})
          </h3>
          <Tabs
            value={metricDimension}
            onValueChange={(val) => {
              if (!val) return;
              setMetricDimension(val);
            }}
          >
            <TabsList className="bg-transparent p-0 border-0 gap-1">
              <TabsIndicator className="bg-amber-500 shadow-sm" />
              {['ALL', 'GRAMMAR', 'VOCAB', 'LISTENING', 'NUANCE'].map((dim) => (
                <TabsTrigger
                  key={dim}
                  value={dim}
                  className="px-2.5 py-1 text-xs data-[selected]:text-stone-950 data-[selected]:font-bold"
                >
                  {dim === 'ALL'
                    ? '全部'
                    : dim === 'GRAMMAR'
                    ? '文法'
                    : dim === 'VOCAB'
                    ? '词汇'
                    : dim === 'LISTENING'
                    ? '听力'
                    : '语感'}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {visibleMetrics.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-xl bg-stone-100/50 dark:bg-stone-900/30 border border-dashed border-stone-200 dark:border-stone-800">
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-2.5">
              {shell.copy.emptySkillsHint}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                sound.playClick();
                setActiveTab('QUIZ');
              }}
              className="text-xs font-semibold"
            >
              前往自适应做题 →
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleMetrics.map((metric: SkillMetric) => {
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
                      <Badge
                        variant={isStrong ? 'emerald' : isWeak ? 'destructive' : 'amber'}
                        className="rounded font-mono"
                      >
                        {Math.round(metric.proficiency * 100)}%
                      </Badge>
                    </div>

                    <Progress
                      value={metric.proficiency * 100}
                      indicatorClassName={
                        isStrong ? 'bg-emerald-500' : isWeak ? 'bg-rose-500' : 'bg-amber-500'
                      }
                    />

                    <div className="flex justify-between items-center text-[11px] text-stone-400 pt-1">
                      <span>总练习 {metric.totalAttempts} 次 · 连续错误 {metric.consecutiveErrors} 次</span>
                      {isWeak && (
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => {
                            sound.playClick();
                            setActiveTab('QUIZ');
                            toast.info(`已为您调取针对【${metric.name}】的加练题目！`);
                          }}
                          className="h-auto p-0 text-[11px] font-bold"
                        >
                          靶向加练 →
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
