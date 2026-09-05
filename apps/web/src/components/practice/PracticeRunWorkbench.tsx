import React, { useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { PracticeRunner, type PracticeRunnerItem } from './PracticeRunner.js';
import { usePracticeRunSummaryQuery } from '../../queries/useLearnerQueries.js';
import {
  useAssemblePracticeRunMutation,
  usePracticeRunItemsQuery,
  usePracticeRunQuery,
} from '../../queries/useLearnerQueries.js';

/** P5：练习运行工作台。装配题目 -> 加载 -> 渲染 PracticeRunner；断点恢复。 */

interface PracticeRunWorkbenchProps {
  runId: string;
  userId: string;
  language: 'en' | 'ja' | 'ko';
  onCompleted?: () => void;
  onExit?: () => void;
}

export function PracticeRunWorkbench({ runId, userId, language, onCompleted, onExit }: PracticeRunWorkbenchProps) {
  const assemble = useAssemblePracticeRunMutation(userId);
  const itemsQuery = usePracticeRunItemsQuery(runId, userId);
  const runQuery = usePracticeRunQuery(runId, userId);

  // 进入时若尚无题目，自动装配一次
  useEffect(() => {
    if (runId && !itemsQuery.data && !itemsQuery.isLoading && !assemble.isPending) {
      assemble.mutate(runId, {
        onSuccess: () => toast.success('已装配练习题目'),
        onError: (e) => toast.error('装配题目失败：' + e.message),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const items: PracticeRunnerItem[] = (itemsQuery.data ?? []).map((d) => ({
    itemId: d.itemId,
    blockId: d.blockId,
    question: d.question,
    gradingMode: d.gradingMode,
  }));

  const attempts = runQuery.data?.attempts ?? [];
  const runStatus = runQuery.data?.run?.status;
  const summaryQuery = usePracticeRunSummaryQuery(runStatus === 'COMPLETED' ? runId : null, userId);

  if (assemble.isPending || itemsQuery.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">正在装配练习题目…</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
        <Sparkles className="h-6 w-6" />
        <span className="text-sm">该语种暂无可用题目，请先在题库或词典中积累内容。</span>
        {onExit && <Button variant="outline" size="sm" onClick={onExit}>返回</Button>}
      </div>
    );
  }

  // 完成后复盘视图
  if (runStatus === 'COMPLETED' && summaryQuery.data) {
    const s = summaryQuery.data;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">练习复盘</h2>
          {onExit && <Button variant="ghost" size="sm" onClick={onExit}>返回计划</Button>}
        </div>
        <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant={s.source === 'ai' ? 'default' : 'secondary'}>{s.source === 'ai' ? 'AI 汇总' : '本地规则汇总'}</Badge>
            <span className="text-xs text-slate-500">{s.generatedAt}</span>
          </div>
          <p className="text-sm">{s.summary}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span>已提交 {s.submittedCount}/{s.totalItems}</span>
            <span>已批改 {s.gradedCount}</span>
            <span>正确 {s.correctCount}</span>
            <span>平均分 {s.averageScore}</span>
          </div>
          {s.commonIssues.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold">共性问题</h4>
              <ul className="ml-4 list-disc text-xs text-slate-600 dark:text-slate-300">
                {s.commonIssues.map((iss) => <li key={iss}>{iss}</li>)}
              </ul>
            </div>
          )}
          <div className="mt-3">
            <h4 className="text-xs font-semibold">下次建议</h4>
            <ul className="ml-4 list-disc text-xs text-slate-600 dark:text-slate-300">
              {s.nextPlanSuggestions.map((sg, i) => <li key={i}>{sg}</li>)}
            </ul>
          </div>
          {s.failureReason && (
            <p className="mt-3 text-xs text-amber-600">模型不可用已回退本地规则：{s.failureReason}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">练习运行</h2>
        {onExit && <Button variant="ghost" size="sm" onClick={onExit}>返回计划</Button>}
      </div>
      <PracticeRunner
        runId={runId}
        items={items}
        attempts={attempts}
        language={language}
        onCompleted={onCompleted}
      />
    </div>
  );
}
