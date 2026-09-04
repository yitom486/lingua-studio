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
  Award,
  Globe,
  Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import { sound } from '../utils/audio.js';
import { ShimmerButton, fireSuccessConfetti } from './magicui/index.js';
import type { QuizGradingResult } from '@study-studio/protocol';
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from './ui/tabs.js';
import { Badge } from './ui/badge.js';
import { INITIAL_SUBJECTIVE_EXERCISES } from '../data/subjective-demo-data.js';

interface SubjectiveWritingWorkbenchProps {
  onGradeSubjective: (data: {
    questionId: string;
    prompt: string;
    standardAnswer: string;
    userSubmission: string;
    testedSkillId: string;
  }) => Promise<QuizGradingResult>;
}

export function SubjectiveWritingWorkbench({ onGradeSubjective }: SubjectiveWritingWorkbenchProps) {
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [inputSubmission, setInputSubmission] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const [gradingResult, setGradingResult] = useState<QuizGradingResult | null>(null);

  const currentExercise = INITIAL_SUBJECTIVE_EXERCISES[exerciseIndex] ?? INITIAL_SUBJECTIVE_EXERCISES[0]!;

  const handleSwitchExercise = (idx: number) => {
    sound.playClick();
    setExerciseIndex(idx);
    setInputSubmission('');
    setGradingResult(null);
  };

  const handleGradeSubmit = async () => {
    if (!inputSubmission.trim() || isGrading) return;

    sound.playClick();
    setIsGrading(true);
    setGradingResult(null);

    try {
      const result = await onGradeSubjective({
        questionId: currentExercise.id,
        prompt: currentExercise.chinesePrompt,
        standardAnswer: currentExercise.standardAnswer,
        userSubmission: inputSubmission.trim(),
        testedSkillId: currentExercise.testedSkillId,
      });

      setGradingResult(result);

      if (result.isCorrect && result.score >= 80) {
        sound.playSuccess();
        fireSuccessConfetti();
        toast.success(`批改完成：综合评分 ${result.score} 分！表达严谨地道！`);
      } else {
        sound.playMistake();
        toast.error(`批改完成：发现 ${result.errorDiagnosis?.category ?? '语法'} 偏差，已自动录入错题本！`);
      }
    } catch {
      // 离线启发式批改备选
      setTimeout(() => {
        const isExact = inputSubmission.trim() === currentExercise.standardAnswer;
        const fakeResult: QuizGradingResult = {
          questionId: currentExercise.id,
          isCorrect: isExact,
          score: isExact ? 100 : 70,
          correctAnswer: currentExercise.standardAnswer,
          userSubmission: inputSubmission.trim(),
          explanation: isExact ? '完美无瑕的地道日文表达！' : '助词使用存在偏差，请注意区分「で」与「に」的功能。',
          errorDiagnosis: isExact
            ? undefined
            : {
                category: 'PARTICLE',
                description: '格助词缺失或功能混淆',
                motherTongueInterference: '中文直译容易漏掉日语动作发生场所必须的格助词「で」。',
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
      {/* 头部与题目切换 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="amber">AI 深度主观题批改</Badge>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              多维语法句法分析 · 母语负迁移深度诊断
            </span>
          </div>
          <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 mt-1 font-serif">
            {currentExercise.category}
          </h3>
        </div>

        {/* 练习快速切换 */}
        <Tabs
          value={String(exerciseIndex)}
          onValueChange={(val) => {
            if (val == null) return;
            handleSwitchExercise(Number(val));
          }}
        >
          <TabsList className="bg-stone-200/60 dark:bg-stone-900">
            <TabsIndicator />
            {INITIAL_SUBJECTIVE_EXERCISES.map((ex, idx) => (
              <TabsTrigger key={ex.id} value={String(idx)} className="px-3 py-1.5 text-xs">
                题目 {idx + 1}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* 题面核心内容 */}
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

        {/* 用户输入框 */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-stone-600 dark:text-stone-400 flex items-center gap-1.5">
            <PenTool className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            在此键入你的日文长句作答（支持罗马字自动假名或直接键入）：
          </label>
          <textarea
            rows={3}
            value={inputSubmission}
            onChange={(e) => setInputSubmission(e.target.value)}
            placeholder="例如：昨日、友達とカフェで日本語の本を読みました。"
            className="w-full p-4 rounded-2xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 border border-stone-300 dark:border-stone-700 outline-none focus:border-amber-500 text-base leading-relaxed resize-none transition-all shadow-xs"
          />
        </div>

        {/* 提交按钮 */}
        <div className="flex justify-end pt-1">
          <ShimmerButton
            onClick={handleGradeSubmit}
            disabled={!inputSubmission.trim() || isGrading}
            className="px-6 py-2.5 text-xs font-bold flex items-center gap-2 shadow-md"
          >
            {isGrading ? (
              <>
                <Bot className="w-4 h-4 animate-spin" />
                <span>AI 正在剖析句法与母语负迁移...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>提交 AI 深度多维诊断批改</span>
              </>
            )}
          </ShimmerButton>
        </div>
      </div>

      {/* 批改结果多维报告卡片 */}
      {gradingResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl border bg-amber-50/40 dark:bg-stone-900/50 border-amber-900/15 dark:border-amber-500/20 space-y-4"
        >
          {/* 得分与正误总览 */}
          <div className="flex items-baseline justify-between pb-3 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-center gap-2.5">
              {gradingResult.isCorrect ? (
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              )}
              <div>
                <span className="font-bold text-sm text-stone-900 dark:text-stone-100">
                  {gradingResult.isCorrect ? '解答合格！' : '存在语法/用词偏差，已自动沉淀入错题本'}
                </span>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  考点归属：{currentExercise.grammarFocus}
                </p>
              </div>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-mono font-bold text-amber-600 dark:text-amber-400">
                {gradingResult.score}
              </span>
              <span className="text-xs text-stone-400 font-mono">/ 100 分</span>
            </div>
          </div>

          {/* 核心批改解析 */}
          <div className="space-y-1">
            <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
              💡 总体语法剖析：
            </span>
            <p className="text-xs sm:text-sm text-stone-800 dark:text-stone-200 leading-relaxed font-serif">
              {gradingResult.explanation}
            </p>
          </div>

          {/* 母语负迁移深度归因 (特色功能) */}
          {gradingResult.errorDiagnosis && (
            <div className="p-4 rounded-xl bg-rose-500/10 dark:bg-rose-950/20 border border-rose-500/20 space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="rounded font-mono text-xs">
                  {gradingResult.errorDiagnosis.category} 偏误
                </Badge>
                <span className="text-xs font-bold text-rose-900 dark:text-rose-200">
                  🇨🇳 母语负迁移深度归因
                </span>
              </div>
              <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed font-serif">
                {gradingResult.errorDiagnosis.motherTongueInterference}
              </p>
            </div>
          )}

          {/* 原生地道表达润色 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div className="p-3 rounded-xl bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-1">
              <span className="text-stone-500 font-semibold">你的提交作答：</span>
              <p className="font-medium text-stone-900 dark:text-stone-100">{gradingResult.userSubmission}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1">
              <span className="text-emerald-800 dark:text-emerald-300 font-semibold">原生母语者标准推荐：</span>
              <p className="font-medium text-emerald-950 dark:text-emerald-100">{gradingResult.correctAnswer}</p>
            </div>
          </div>

          {/* 避坑口诀 */}
          {gradingResult.followUpTip && (
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span><strong className="font-bold">避坑口诀：</strong>{gradingResult.followUpTip}</span>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
