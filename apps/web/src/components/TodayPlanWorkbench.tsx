import React from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  CalendarCheck,
  CheckCircle2,
  ArrowRight,
  BookPlus,
  Layers,
  Sparkles,
  Newspaper,
  Zap,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react';
import type { DailyPlanStep, DailyPlanStepKind } from '@study-studio/learner-core';
import { NumberTicker } from './magicui/index.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Progress } from './ui/progress.js';
import { sound } from '../utils/audio.js';
import { useLearningShell } from '../hooks/useLearningShell.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { useCompletePlanStepMutation, useDailyPlanQuery } from '../queries/useLearnerQueries.js';

const STEP_ICONS: Record<DailyPlanStepKind, typeof Layers> = {
  NEW_WORDS: BookPlus,
  CARDS: Layers,
  GRAMMAR: Sparkles,
  READING: Newspaper,
  QUIZ: Zap,
  MISTAKES: AlertTriangle,
  PRACTICE_PLAN: ClipboardList,
};

export function TodayPlanWorkbench() {
  const shell = useLearningShell();
  const { data: plan, isLoading, isError, refetch } = useDailyPlanQuery();
  const completeStep = useCompletePlanStepMutation();
  const setActiveTab = useStudySessionStore((s) => s.setActiveTab);
  const setCardFilter = useStudySessionStore((s) => s.setCardFilter);
  const setPlanIntent = useStudySessionStore((s) => s.setPlanIntent);

  const startStep = (step: DailyPlanStep) => {
    sound.playClick();
    setPlanIntent({
      stepId: step.id,
      kind: step.kind,
      title: step.title,
      skillId: step.skillId,
      skillName: step.skillName,
    });
    if (step.kind === 'NEW_WORDS') setCardFilter('VOCAB');
    if (step.kind === 'CARDS') setCardFilter('ALL');
    setActiveTab(step.navigateTo);
    toast.success(`已进入「${step.title}」`);
  };

  const markDone = (step: DailyPlanStep) => {
    sound.playClick();
    completeStep.mutate(
      {
        stepId: step.id,
        ...(plan?.planDate ? { date: plan.planDate } : {}),
      },
      {
        onSuccess: () => toast.success(`已勾选「${step.title}」`),
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : '暂时无法标记完成'),
      }
    );
  };

  const completed = plan?.completedCount ?? 0;
  const total = plan?.totalCount ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const nextStep = plan?.steps.find((step) => !step.done);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5 max-w-3xl"
    >
      <div className="rounded-2xl border border-amber-900/10 dark:border-amber-500/15 bg-[#faf9f6] dark:bg-[#1a1816] p-5 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-300 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-stone-100">
                今日学习
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                {shell.trackName}轨道 · 按输入 → 精读 → 练习的顺序串联现有模块，不另起一套课程。
              </p>
            </div>
          </div>
          <Badge variant={percent >= 100 ? 'emerald' : 'amber'}>
            {plan?.planDate ?? '今日'}
          </Badge>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold font-mono text-amber-600 dark:text-amber-400">
              <NumberTicker value={completed} />
            </span>
            <span className="text-xs text-stone-500">/ {total} 步完成</span>
          </div>
          <span className="text-xs font-mono text-stone-500">{percent}%</span>
        </div>
        <Progress value={percent} className="h-2" />
      </div>

      {isLoading && (
        <p className="text-xs text-stone-500">正在生成今日计划…</p>
      )}
      {isError && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-800 dark:text-rose-200">
          暂时无法读取今日计划。
          <Button variant="ghost" size="sm" className="ml-2" onClick={() => void refetch()}>
            重试
          </Button>
        </div>
      )}

      {plan && (
        <ol className="space-y-3">
          {plan.steps.map((step, index) => {
            const Icon = STEP_ICONS[step.kind];
            const isNext = nextStep?.id === step.id;
            return (
              <li
                key={step.id}
                className={`rounded-2xl border p-4 shadow-xs ${
                  step.done
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : isNext
                      ? 'border-amber-500/30 bg-amber-500/8'
                      : 'border-amber-900/10 dark:border-amber-500/15 bg-white/70 dark:bg-[#1a1816]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      step.done
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-900 dark:text-amber-300'
                    }`}
                  >
                    {step.done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-stone-400">{index + 1}</span>
                      <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                        {step.title}
                      </h3>
                      {step.done && (
                        <Badge variant="emerald" className="text-[10px] px-1.5 py-0">
                          已完成
                        </Badge>
                      )}
                      {isNext && !step.done && (
                        <Badge variant="amber" className="text-[10px] px-1.5 py-0">
                          下一步
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{step.summary}</p>
                    <p className="text-[11px] font-mono text-stone-400">
                      {step.currentCount}/{step.targetCount ?? 1}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => startStep(step)} className="gap-1.5">
                        {step.done ? '再练一次' : '开始'}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                      {!step.done && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={completeStep.isPending}
                          onClick={() => markDone(step)}
                        >
                          标记完成
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </motion.div>
  );
}
