import React from 'react';
import { CalendarCheck, X } from 'lucide-react';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { Button } from './ui/button.js';

const KIND_HINT: Record<string, string> = {
  NEW_WORDS: '查词加入生词本后，翻一张新卡完成今日输入。',
  CARDS: '按 FSRS 评级处理到期卡片即可推进今日计划。',
  GRAMMAR: '可点「AI 针对弱项出题」，把讲解写回学情。',
  READING: '完成一篇精读；划词可直接转入生词本。',
  QUIZ: '做完今日目标题量后，这一步会自动勾选。',
  MISTAKES: '两连对即可出库，错题步骤会自动完成。',
  PRACTICE_PLAN: '按计划块作答并提交；全部提交后该步自动勾选。',
};

export function PlanIntentBanner() {
  const planIntent = useStudySessionStore((s) => s.planIntent);
  const setPlanIntent = useStudySessionStore((s) => s.setPlanIntent);
  if (!planIntent) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5"
    >
      <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">
          今日计划 · {planIntent.title}
        </p>
        <p className="mt-0.5 text-[11px] text-amber-900/80 dark:text-amber-100/80">
          {KIND_HINT[planIntent.kind] ?? '完成后可回到今日学习查看进度。'}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label="关闭计划提示"
        onClick={() => setPlanIntent(null)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
