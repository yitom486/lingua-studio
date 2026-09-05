import React, { useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '../ui/button.js';
import { PracticeRunner, type PracticeRunnerItem } from './PracticeRunner.js';
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
