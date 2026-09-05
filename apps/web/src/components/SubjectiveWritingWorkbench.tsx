import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PenTool,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Send,
  Lightbulb,
  Bot,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { sound } from '../utils/audio.js';
import { ShimmerButton, fireSuccessConfetti } from './magicui/index.js';
import type { QuizGradingResult } from '@study-studio/protocol';
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from './ui/tabs.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import {
  INITIAL_SUBJECTIVE_EXERCISES,
  type SubjectiveExercise,
} from '../data/subjective-demo-data.js';
import {
  useGenerateWritingPromptsMutation,
  type WritingPromptItem,
} from '../queries/useLearnerQueries.js';
import { useGradeSubjectiveMutation } from '../queries/useAgentMutations.js';

interface SubjectiveWritingWorkbenchProps {
  /** 外部注入的题干（写作工作室生成后传入） */
  exercises?: SubjectiveExercise[] | undefined;
  onExercisesChange?: ((exercises: SubjectiveExercise[]) => void) | undefined;
  genre?: string | undefined;
  difficulty?: number | undefined;
}

function toExercise(p: WritingPromptItem): SubjectiveExercise {
  return {
    id: p.id,
    category: p.category,
    chinesePrompt: p.chinesePrompt,
    contextHint: p.contextHint,
    testedSkillId: p.testedSkillId,
    standardAnswer: p.standardAnswer,
    grammarFocus: p.grammarFocus,
  };
}

export function SubjectiveWritingWorkbench({
  exercises: controlledExercises,
  onExercisesChange,
  genre = 'translation',
  difficulty = 3,
}: SubjectiveWritingWorkbenchProps) {
  const gradeSubjective = useGradeSubjectiveMutation();
  const [localExercises, setLocalExercises] = useState<SubjectiveExercise[]>(
    INITIAL_SUBJECTIVE_EXERCISES
  );
  const exercises = controlledExercises ?? localExercises;
  const setExercises = (next: SubjectiveExercise[]) => {
    if (onExercisesChange) onExercisesChange(next);
    else setLocalExercises(next);
  };

  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [inputSubmission, setInputSubmission] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const [gradingResult, setGradingResult] = useState<QuizGradingResult | null>(null);
  const generateMutation = useGenerateWritingPromptsMutation();

  const currentExercise = exercises[exerciseIndex] ?? exercises[0] ?? INITIAL_SUBJECTIVE_EXERCISES[0]!;

  const handleSwitchExercise = (idx: number) => {
    sound.playClick();
    setExerciseIndex(idx);
    setInputSubmission('');
    setGradingResult(null);
  };

  const handleGenerate = async () => {
    sound.playClick();
    try {
      const prompts = await generateMutation.mutateAsync({
        genre,
        difficulty,
        count: 3,
        collect: true,
      });
      const mapped = prompts.map(toExercise);
      setExercises(mapped);
      setExerciseIndex(0);
      setInputSubmission('');
      setGradingResult(null);
      toast.success(`已生成 ${mapped.length} 道写作题干并写入练习队列`);
    } catch {
      toast.message('网关暂不可用，继续使用本地演示题干');
      setExercises(INITIAL_SUBJECTIVE_EXERCISES);
    }
  };

  const handleGradeSubmit = async () => {
    if (!inputSubmission.trim() || isGrading) return;

    sound.playClick();
    setIsGrading(true);
    setGradingResult(null);

    try {
      const result = (await gradeSubjective.mutateAsync({
        questionId: currentExercise.id,
        prompt: currentExercise.chinesePrompt,
        standardAnswer: currentExercise.standardAnswer,
        userSubmission: inputSubmission.trim(),
        testedSkillId: currentExercise.testedSkillId,
      })) as QuizGradingResult;

      setGradingResult(result);

      if (result.isCorrect && result.score >= 80) {
        sound.playSuccess();
        fireSuccessConfetti();
        toast.success(`批改完成：综合评分 ${result.score} 分！表达严谨地道！`);
      } else {
        sound.playMistake();
        toast.error(
          `批改完成：发现 ${result.errorDiagnosis?.category ?? '语法'} 偏差，已自动录入错题本！`
        );
      }
    } catch {
      setTimeout(() => {
        const isExact = inputSubmission.trim() === currentExercise.standardAnswer;
        const fakeResult: QuizGradingResult = {
          questionId: currentExercise.id,
          isCorrect: isExact,
          score: isExact ? 100 : 70,
          correctAnswer: currentExercise.standardAnswer,
          userSubmission: inputSubmission.trim(),
          explanation: isExact
            ? '完美无瑕的地道日文表达！'
            : '助词使用存在偏差，请注意区分「で」与「に」的功能。',
          errorDiagnosis: isExact
            ? undefined
            : {
                category: 'PARTICLE',
                description: '格助词缺失或功能混淆',
                motherTongueInterference:
                  '中文直译容易漏掉日语动作发生场所必须的格助词「で」。',
              },
          refinementSuggestion: currentExercise.standardAnswer,
          followUpTip: '日语句子中的名词必须借由助词与谓语动词紧密连接。',
          mistakeRecorded: !isExact,
        };
        setGradingResult(fakeResult);
        if (isExact) {
          sound.playSuccess();
          fireSuccessConfetti();
        } else {
          sound.playMistake();
        }
      }, 600);
    } finally {
      setIsGrading(false);
    }
  };

  return (
    <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-3xl p-6 sm:p-8 border border-amber-900/10 dark:border-amber-500/15 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="amber">AI 深度主观题批改</Badge>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              learning.content 出题 · learning.assess 批改
            </span>
          </div>
          <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 mt-1 font-serif">
            {currentExercise.category}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            生成新题干
          </Button>
          <Tabs
            value={String(Math.min(exerciseIndex, exercises.length - 1))}
            onValueChange={(val) => {
              if (val == null) return;
              handleSwitchExercise(Number(val));
            }}
          >
            <TabsList className="bg-stone-200/60 dark:bg-stone-900">
              <TabsIndicator />
              {exercises.map((ex, idx) => (
                <TabsTrigger key={ex.id} value={String(idx)} className="px-3 py-1.5 text-xs">
                  题目 {idx + 1}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="space-y-3">
        <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-stone-900/60 border border-amber-900/10 dark:border-amber-500/15 space-y-2">
          <span className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
            中文题干 (请翻译为地道日文)：
          </span>
          <p className="text-xl font-bold font-serif text-stone-900 dark:text-stone-100">
            {currentExercise.chinesePrompt}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            💡 考点提示：{currentExercise.contextHint}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-stone-600 dark:text-stone-400 flex items-center gap-1.5">
            <PenTool className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            在此键入你的日文长句作答：
          </label>
          <textarea
            rows={3}
            value={inputSubmission}
            onChange={(e) => setInputSubmission(e.target.value)}
            placeholder="例如：昨日、友達とカフェで日本語の本を読みました。"
            className="w-full p-4 rounded-2xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 border border-stone-300 dark:border-stone-700 outline-none focus:border-amber-500 text-base leading-relaxed resize-none transition-all shadow-xs"
          />
        </div>

        <div className="flex justify-end pt-1">
          <ShimmerButton
            onClick={handleGradeSubmit}
            disabled={!inputSubmission.trim() || isGrading}
            className="px-6 py-2.5 text-xs font-bold flex items-center gap-2 shadow-md"
          >
            {isGrading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                批改中…
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                提交批改
              </>
            )}
          </ShimmerButton>
        </div>
      </div>

      <AnimatePresence>
        {gradingResult && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div
              className={`p-4 rounded-2xl border ${
                gradingResult.isCorrect
                  ? 'bg-emerald-50/80 border-emerald-500/30 dark:bg-emerald-950/20'
                  : 'bg-rose-50/80 border-rose-500/30 dark:bg-rose-950/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {gradingResult.isCorrect ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                )}
                <span className="text-sm font-bold">
                  综合评分 {gradingResult.score}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {gradingResult.isCorrect ? '通过' : '需巩固'}
                </Badge>
              </div>
              <p className="text-sm text-stone-700 dark:text-stone-300">
                {gradingResult.explanation}
              </p>
              {gradingResult.refinementSuggestion && (
                <p className="text-xs mt-2 text-stone-500 flex items-start gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  范例：{gradingResult.refinementSuggestion}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setInputSubmission('');
                setGradingResult(null);
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              再练一题
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
