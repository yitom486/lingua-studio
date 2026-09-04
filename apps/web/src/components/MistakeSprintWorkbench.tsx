import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Flame,
  RotateCcw,
  Bot,
  Sparkles,
  Award,
  Filter,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { sound } from '../utils/audio.js';
import { toast } from 'sonner';
import type { MistakeNotebookItem } from '../data/learning-data.js';
import type { AiTutorContext } from './AiTutorDrawer.js';

interface MistakeSprintWorkbenchProps {
  mistakes: MistakeNotebookItem[];
  onUpdateMistake: (mistakeId: string, isCorrect: boolean) => void;
  onOpenTutor: (context: AiTutorContext) => void;
}

export const MistakeSprintWorkbench: React.FC<MistakeSprintWorkbenchProps> = ({
  mistakes,
  onUpdateMistake,
  onOpenTutor,
}) => {
  // 过滤状态
  const [filterState, setFilterState] = useState<'ALL' | 'UNRESOLVED' | 'RESOLVED'>('UNRESOLVED');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');

  // 冲刺模式状态 (Sprint Mode)
  const [isSprintActive, setIsSprintActive] = useState<boolean>(false);
  const [sprintIndex, setSprintIndex] = useState<number>(0);
  const [sprintAnswer, setSprintAnswer] = useState<string>('');
  const [sprintFeedback, setSprintFeedback] = useState<{
    submitted: boolean;
    isCorrect: boolean;
  } | null>(null);

  // 提取所有唯一标签
  const uniqueTags = Array.from(new Set(mistakes.map((m) => m.categoryTag)));

  const filteredMistakes = mistakes.filter((m) => {
    const stateMatch =
      filterState === 'ALL' ? true : filterState === 'UNRESOLVED' ? !m.isResolved : m.isResolved;
    const tagMatch = selectedTag === 'ALL' ? true : m.categoryTag === selectedTag;
    return stateMatch && tagMatch;
  });

  const unresolvedMistakes = mistakes.filter((m) => !m.isResolved);
  const resolvedMistakes = mistakes.filter((m) => m.isResolved);

  // 当前冲刺中的题目
  const activeSprintItem = unresolvedMistakes[sprintIndex];

  // 启动错题冲刺
  const handleStartSprint = () => {
    if (unresolvedMistakes.length === 0) {
      toast.success('太棒了！当前没有任何未攻克的错题！');
      return;
    }
    sound.playClick();
    setIsSprintActive(true);
    setSprintIndex(0);
    setSprintAnswer('');
    setSprintFeedback(null);
  };

  // 退出冲刺
  const handleExitSprint = () => {
    sound.playClick();
    setIsSprintActive(false);
    setSprintFeedback(null);
  };

  // 提交冲刺作答
  const handleSubmitSprintAnswer = () => {
    if (!sprintAnswer.trim() || !activeSprintItem) return;

    const trimmed = sprintAnswer.trim();
    const isCorrect =
      trimmed.toLowerCase() === activeSprintItem.correctAnswer.toLowerCase();

    setSprintFeedback({ submitted: true, isCorrect });
    onUpdateMistake(activeSprintItem.id, isCorrect);

    if (isCorrect) {
      sound.playSuccess();
      toast.success(
        activeSprintItem.consecutiveCorrect + 1 >= 2
          ? '🎉 连续 2 次正确！该题已彻底攻克出库！'
          : '回答正确！连对进度 +1'
      );
    } else {
      sound.playError();
      toast.error(`回答有误：正确应为「${activeSprintItem.correctAnswer}」`);
    }
  };

  const handleNextSprintItem = () => {
    sound.playClick();
    setSprintAnswer('');
    setSprintFeedback(null);
    if (sprintIndex < unresolvedMistakes.length - 1) {
      setSprintIndex((prev) => prev + 1);
    } else {
      setIsSprintActive(false);
      toast.success('🎯 错题冲刺轮练已全部完成！');
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* 顶部总览与冲刺卡片 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#faf9f6] dark:bg-[#1a1816] p-5 rounded-2xl border border-amber-900/10 dark:border-amber-500/15 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-300 flex items-center justify-center font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-stone-100">
                错题本智能归因与专项攻克
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-medium border border-amber-500/20">
                两连对出库标准
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              待攻克: {unresolvedMistakes.length} 题 · 已攻克: {resolvedMistakes.length} 题
            </p>
          </div>
        </div>

        {/* 快速发起冲刺大按钮 */}
        {!isSprintActive && unresolvedMistakes.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleStartSprint}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 text-stone-950 font-bold text-xs shadow-sm hover:brightness-105 transition-all cursor-pointer"
          >
            <Flame className="w-4 h-4" />
            <span>⚡ 发起错题定向冲刺 ({unresolvedMistakes.length})</span>
          </motion.button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 冲刺专注训练工作台 (Sprint View)                                          */}
      {/* ========================================================================= */}
      <AnimatePresence mode="wait">
        {isSprintActive && activeSprintItem && (
          <motion.div
            key={activeSprintItem.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="p-6 sm:p-8 rounded-2xl bg-[#faf9f6] dark:bg-[#1a1816] border-2 border-amber-500/40 shadow-md space-y-6"
          >
            {/* 冲刺顶栏导航 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-stone-950">
                  🔥 错题冲刺中
                </span>
                <span className="text-xs text-stone-500 font-mono">
                  第 {sprintIndex + 1} / {unresolvedMistakes.length} 题
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                  考点: {activeSprintItem.categoryTag}
                </span>
              </div>

              <button
                onClick={handleExitSprint}
                className="text-xs text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
              >
                退出冲刺模式 ✕
              </button>
            </div>

            {/* 题目内容展示 */}
            <div className="space-y-3 py-3">
              <p className="text-xs text-stone-500 font-medium">{activeSprintItem.prompt}</p>
              <h3 className="text-xl sm:text-2xl font-serif font-bold text-stone-900 dark:text-stone-100">
                {activeSprintItem.sentence}
              </h3>
            </div>

            {/* 作答输入框 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-600 dark:text-stone-400">
                请键入正确的助词或选项答案：
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="text"
                  value={sprintAnswer}
                  onChange={(e) => setSprintAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !sprintFeedback?.submitted) {
                      handleSubmitSprintAnswer();
                    }
                  }}
                  disabled={sprintFeedback?.submitted}
                  placeholder="在此输入订正后的答案..."
                  className="flex-1 w-full px-4 py-3 rounded-xl bg-white dark:bg-[#211f1d] border border-amber-900/20 dark:border-amber-500/20 text-stone-900 dark:text-stone-100 font-medium outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                />

                {!sprintFeedback?.submitted ? (
                  <button
                    onClick={handleSubmitSprintAnswer}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs hover:bg-amber-600 transition-all shadow-xs cursor-pointer shrink-0"
                  >
                    验证答案 ➔
                  </button>
                ) : (
                  <button
                    onClick={handleNextSprintItem}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-stone-900 dark:bg-amber-600 text-white font-bold text-xs hover:brightness-110 transition-all shadow-xs cursor-pointer shrink-0"
                  >
                    {sprintIndex < unresolvedMistakes.length - 1 ? '下一题 ➔' : '完成冲刺 ➔'}
                  </button>
                )}
              </div>
            </div>

            {/* 反馈卡片与 AI 诊断 */}
            {sprintFeedback?.submitted && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-xl border text-xs space-y-3 ${
                  sprintFeedback.isCorrect
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {sprintFeedback.isCorrect ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>订正正确！当前攻克进度稳步提升</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-rose-600" />
                        <span>仍有偏差：标准答案为「{activeSprintItem.correctAnswer}」</span>
                      </>
                    )}
                  </div>

                  <button
                    onClick={() =>
                      onOpenTutor({
                        questionText: activeSprintItem.sentence,
                        userAnswer: sprintAnswer,
                        correctAnswer: activeSprintItem.correctAnswer,
                        skillTag: activeSprintItem.categoryTag,
                        explanation: activeSprintItem.reviewNote,
                      })
                    }
                    className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                  >
                    <Bot className="w-4 h-4" />
                    <span>向 AI 导师追问</span>
                  </button>
                </div>

                <p className="text-stone-700 dark:text-stone-300 font-sans leading-relaxed">
                  💡 {activeSprintItem.reviewNote}
                </p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* 错题列表检索与分类归因视图                                                */}
      {/* ========================================================================= */}
      {!isSprintActive && (
        <div className="flex flex-col gap-4">
          {/* 筛选控制器 */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* 状态过滤 */}
            <div className="flex items-center gap-1 bg-stone-200/60 dark:bg-stone-900 p-1 rounded-xl">
              {(['ALL', 'UNRESOLVED', 'RESOLVED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => {
                    sound.playClick();
                    setFilterState(st);
                  }}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    filterState === st
                      ? 'bg-white dark:bg-amber-600 text-stone-900 dark:text-white shadow-xs font-bold'
                      : 'text-stone-500'
                  }`}
                >
                  {st === 'ALL'
                    ? `全部 (${mistakes.length})`
                    : st === 'UNRESOLVED'
                    ? `待攻克 (${unresolvedMistakes.length})`
                    : `已攻克 (${resolvedMistakes.length})`}
                </button>
              ))}
            </div>

            {/* 考点标签过滤 */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-full">
              <button
                onClick={() => setSelectedTag('ALL')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  selectedTag === 'ALL'
                    ? 'bg-amber-500/20 text-amber-900 dark:text-amber-300 font-bold'
                    : 'text-stone-400'
                }`}
              >
                所有考点
              </button>
              {uniqueTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 ${
                    selectedTag === tag
                      ? 'bg-amber-500/20 text-amber-900 dark:text-amber-300 font-bold'
                      : 'text-stone-400'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* 错题卡片流 */}
          <div className="space-y-3">
            {filteredMistakes.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-[#faf9f6] dark:bg-[#1a1816] border border-amber-900/10 dark:border-amber-500/15 space-y-2">
                <Award className="w-8 h-8 text-amber-500 mx-auto" />
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                  当前分类下没有匹配的错题！
                </p>
                <p className="text-xs text-stone-400">保持全对节奏，持续稳固记忆曲线</p>
              </div>
            ) : (
              filteredMistakes.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 rounded-2xl bg-[#faf9f6] dark:bg-[#1a1816] border border-amber-900/10 dark:border-amber-500/15 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300">
                        {m.categoryTag}
                      </span>
                      {m.isResolved ? (
                        <span className="text-xs px-2.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          已攻克
                        </span>
                      ) : (
                        <span className="text-xs px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-300 font-mono font-bold">
                          连续订正进度: {m.consecutiveCorrect}/2
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() =>
                        onOpenTutor({
                          questionText: m.sentence,
                          userAnswer: m.userWrongAnswer,
                          correctAnswer: m.correctAnswer,
                          skillTag: m.categoryTag,
                          explanation: m.reviewNote,
                        })
                      }
                      className="text-xs text-amber-700 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      <span>AI 错因深度诊断</span>
                    </button>
                  </div>

                  <div className="text-sm font-medium text-stone-900 dark:text-stone-100 font-serif">
                    {m.sentence}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-800 dark:text-rose-300 space-y-0.5">
                      <span className="font-bold">您的历史错误答复：</span>
                      <p className="font-mono">{m.userWrongAnswer || '(未填)'}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 space-y-0.5">
                      <span className="font-bold">权威标准考点答案：</span>
                      <p className="font-mono">{m.correctAnswer}</p>
                    </div>
                  </div>

                  <p className="text-xs text-stone-600 dark:text-stone-400 font-sans leading-relaxed">
                    💡 <span className="font-medium">错因解析：</span>
                    {m.reviewNote}
                  </p>
                </motion.div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
