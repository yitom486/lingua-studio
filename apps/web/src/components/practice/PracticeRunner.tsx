import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, Send } from 'lucide-react';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { Progress } from '../ui/progress.js';
import { QuestionRenderer } from './QuestionRenderer.js';
import {
  useSubmitObjectiveMutation,
  useSubmitSubjectiveMutation,
  useSavePracticeDraftMutation,
  useGradeBatchMutation,
  useFinalizePracticeRunMutation,
} from '../../queries/useLearnerQueries.js';
import type { PracticeItemAttempt, GeneratedQuestion } from '@study-studio/protocol';

/** P5：通用练习运行器。按题型渲染；客观题即时判定，主观题草稿暂存+批量评测+批量提交；断点恢复。 */

export interface PracticeRunnerItem {
  itemId: string;
  blockId: string;
  question: GeneratedQuestion;
  gradingMode: 'AUTO_IMMEDIATE' | 'AI_IMMEDIATE' | 'AI_BATCH';
}

interface PracticeRunnerProps {
  runId: string;
  items: PracticeRunnerItem[];
  attempts: PracticeItemAttempt[];
  language: 'en' | 'ja' | 'ko';
  onCompleted?: () => void;
}

type ItemStatus = 'PENDING' | 'DRAFT' | 'SUBMITTED' | 'GRADED';
interface ItemState {
  status: ItemStatus;
  userAnswer: string;
  grading?: Record<string, unknown> | undefined;
  isCorrect?: boolean | undefined;
}

const isObjective = (q: GeneratedQuestion) =>
  q.type === 'MULTIPLE_CHOICE' || q.type === 'FILL_IN_BLANK' || q.type === 'SENTENCE_REORDER';

export function PracticeRunner({ runId, items, attempts, language, onCompleted }: PracticeRunnerProps) {
  const submitObjective = useSubmitObjectiveMutation();
  const submitSubjective = useSubmitSubjectiveMutation();
  const saveDraft = useSavePracticeDraftMutation();
  const gradeBatch = useGradeBatchMutation();
  const finalizeRun = useFinalizePracticeRunMutation();

  const restored = useMemo(() => {
    const map = new Map<string, ItemState>();
    for (const a of attempts) {
      map.set(a.itemId, {
        status: a.status as ItemStatus,
        userAnswer: a.userAnswer ?? '',
        grading: a.gradingResult,
        isCorrect: (a.gradingResult as { isCorrect?: boolean } | undefined)?.isCorrect,
      });
    }
    return map;
  }, [attempts]);

  const [states, setStates] = useState<Record<string, ItemState>>({});
  useEffect(() => {
    const next: Record<string, ItemState> = {};
    for (const it of items) next[it.itemId] = restored.get(it.itemId) ?? { status: 'PENDING', userAnswer: '' };
    setStates(next);
  }, [items, restored]);

  const setItem = (itemId: string, patch: Partial<ItemState>) =>
    setStates((p) => ({ ...p, [itemId]: { ...p[itemId]!, ...patch } }));

  const doneCount = items.filter((it) => {
    const s = states[it.itemId];
    return s?.status === 'GRADED' || s?.status === 'SUBMITTED';
  }).length;
  const progress = items.length > 0 ? (doneCount / items.length) * 100 : 0;
  const allDone = items.length > 0 && doneCount === items.length;

  const handleObjective = async (it: PracticeRunnerItem, answer: string) => {
    const q = it.question;
    let isCorrect = false;
    if (q.type === 'MULTIPLE_CHOICE') isCorrect = answer.trim() === q.correctAnswer.trim();
    else if (q.type === 'FILL_IN_BLANK')
      isCorrect = answer.trim() === q.correctAnswer.trim() || (q.acceptableVariants?.some((v) => v.trim() === answer.trim()) ?? false);
    else if (q.type === 'SENTENCE_REORDER') isCorrect = answer.trim() === q.correctAnswer.trim();
    setItem(it.itemId, { status: 'GRADED', userAnswer: answer, isCorrect, grading: { isCorrect, score: isCorrect ? 1 : 0 } });
    try {
      await submitObjective.mutateAsync({ runId, itemId: it.itemId, userAnswer: answer, isCorrect, testedSkillId: q.testedSkillId });
      toast[isCorrect ? 'success' : 'error'](isCorrect ? '回答正确' : '答案不对，已记入错题信号');
    } catch (e) {
      toast.error((e as Error).message);
      setItem(it.itemId, { status: 'PENDING' });
    }
  };

  const handleDraft = async (it: PracticeRunnerItem, answer: string) => {
    setItem(it.itemId, { status: 'DRAFT', userAnswer: answer });
    try {
      await saveDraft.mutateAsync({ runId, itemId: it.itemId, userAnswer: answer });
    } catch {
      /* 草稿失败静默 */
    }
  };

  const handleBatch = async () => {
    const ready = items.filter((it) => !isObjective(it.question)).filter((it) => {
      const s = states[it.itemId];
      return s && s.status === 'DRAFT' && s.userAnswer.trim().length > 0;
    });
    if (ready.length === 0) {
      toast.info('没有可批量提交的主观题草稿');
      return;
    }
    let batch;
    try {
      batch = await gradeBatch.mutateAsync(
        ready.map((it) => ({
          itemId: it.itemId,
          prompt: it.question.prompt,
          standardAnswer: it.question.correctAnswer,
          userSubmission: states[it.itemId]!.userAnswer,
          testedSkillId: it.question.testedSkillId,
          language,
        }))
      );
    } catch (e) {
      toast.error('批量评测失败：' + (e as Error).message);
      return;
    }
    try {
      for (const r of batch.results)
        setItem(r.itemId, { status: 'GRADED', grading: r.grading, isCorrect: (r.grading as { isCorrect?: boolean }).isCorrect });
      await Promise.all(
        batch.results.map((r) =>
          submitSubjective.mutateAsync({
            runId,
            itemId: r.itemId,
            userAnswer: states[r.itemId]!.userAnswer,
            gradingResult: r.grading,
          })
        )
      );
      toast.success(`已批量提交 ${batch.results.length} 题，正确 ${batch.summary.correct} 题`);
    } catch (e) {
      toast.error('批量提交失败：' + (e as Error).message);
    }
  };

  const handleFinalize = async () => {
    try {
      await finalizeRun.mutateAsync(runId);
      toast.success('练习已完成，学习进度已更新');
      onCompleted?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{doneCount}/{items.length} 已完成</Badge>
        <Progress value={progress} className="w-48" />
      </div>
      <div className="flex flex-col gap-6">
        {items.map((it) => {
          const s = states[it.itemId] ?? { status: 'PENDING' as const, userAnswer: '' };
          return (
            <div key={it.itemId} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">{it.question.type}</span>
                {s.status === 'GRADED' ? (
                  s.isCorrect ? (
                    <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />正确</Badge>
                  ) : (
                    <Badge className="bg-rose-100 text-rose-700"><XCircle className="mr-1 h-3 w-3" />需复习</Badge>
                  )
                ) : s.status === 'SUBMITTED' ? (
                  <Badge variant="secondary">等待批改</Badge>
                ) : s.status === 'DRAFT' ? (
                  <Badge variant="outline">草稿</Badge>
                ) : null}
              </div>
              <div className="mb-1 font-medium">{it.question.prompt}</div>
              <div className="mb-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{it.question.content}</div>
              <QuestionRenderer
                question={it.question}
                userAnswer={s.userAnswer}
                onAnswerChange={(v) => setItem(it.itemId, { userAnswer: v })}
                onSubmitObjective={(a) => handleObjective(it, a)}
                onSaveDraft={(a) => handleDraft(it, a)}
                disabled={s.status === 'GRADED' || s.status === 'SUBMITTED'}
                busy={submitObjective.isPending || saveDraft.isPending}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={handleBatch} disabled={gradeBatch.isPending}>
          {gradeBatch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          批量提交主观题
        </Button>
        <Button onClick={handleFinalize} disabled={!allDone || finalizeRun.isPending}>
          {finalizeRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          完成练习
        </Button>
      </div>
    </div>
  );
}
