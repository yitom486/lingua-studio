import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Bot,
} from 'lucide-react';
import {
  ShimmerButton,
  NumberTicker,
  fireSuccessConfetti,
} from './magicui/index.js';
import { sound } from '../utils/audio.js';
import { SubjectiveWritingWorkbench } from './SubjectiveWritingWorkbench.js';
import type { QuizQuestionItem } from '../data/learning-data.js';
import type { AiTutorContext } from './AiTutorDrawer.js';

interface AdaptiveQuizWorkbenchProps {
  questions: QuizQuestionItem[];
  setQuestions: React.Dispatch<React.SetStateAction<QuizQuestionItem[]>>;
  questionIndex: number;
  setQuestionIndex: React.Dispatch<React.SetStateAction<number>>;
  onOpenTutor: (ctx: AiTutorContext) => void;
  onGradeSubjective: (data: {
    questionId: string;
    prompt: string;
    standardAnswer: string;
    userSubmission: string;
    testedSkillId: string;
  }) => Promise<any>;
  onSubmitQuizToGateway: (payload: {
    questionId: string;
    userAnswer: string;
    isCorrect: boolean;
    score: number;
    timeSpentMs: number;
    testedSkillId: string;
    questionContent: string;
    correctAnswer: string;
    explanation: string;
  }) => void;
  isGatewayConnected: boolean;
  onGenerateAdaptiveQuizApi?: () => Promise<any>;
}

export function AdaptiveQuizWorkbench({
  questions,
  setQuestions,
  questionIndex,
  setQuestionIndex,
  onOpenTutor,
  onGradeSubjective,
  onSubmitQuizToGateway,
  isGatewayConnected,
  onGenerateAdaptiveQuizApi,
}: AdaptiveQuizWorkbenchProps) {
  const [quizSubMode, setQuizSubMode] = useState<'OBJECTIVE' | 'SUBJECTIVE'>('OBJECTIVE');
  const [isGeneratingAdaptive, setIsGeneratingAdaptive] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [fillBlankInput, setFillBlankInput] = useState('');
  const [reorderSelectedChunks, setReorderSelectedChunks] = useState<string[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isCurrentAnswerCorrect, setIsCurrentAnswerCorrect] = useState(false);
  const [sessionScore, setSessionScore] = useState(0);

  const currentQ: QuizQuestionItem = questions[questionIndex] ?? questions[0]!;

  // AI 针对画像弱项一键出题 (动态组卷)
  const handleGenerateAdaptiveQuiz = async () => {
    sound.playClick();
    setIsGeneratingAdaptive(true);
    try {
      if (isGatewayConnected && onGenerateAdaptiveQuizApi) {
        const reply = await onGenerateAdaptiveQuizApi();
        if (reply && reply.questions && reply.questions.length > 0) {
          const newQRaw = reply.questions[0];
          const newQ: QuizQuestionItem = {
            id: newQRaw.id,
            type: newQRaw.type === 'FILL_IN_BLANK' ? 'FILL_BLANK' : 'CHOICE',
            category: `AI 靶向弱项 · ${reply.targetSkillName ?? '核心语法'}`,
            prompt: newQRaw.prompt,
            content: newQRaw.content,
            options: newQRaw.options?.map((text: string, i: number) => ({
              key: String.fromCharCode(65 + i),
              text,
            })),
            correctAnswer: newQRaw.correctAnswer,
            explanation: newQRaw.explanation,
            testedSkill: newQRaw.testedSkillId,
          };
          setQuestions((prev) => [newQ, ...prev]);
          setQuestionIndex(0);
          setSelectedChoice(null);
          setFillBlankInput('');
          setReorderSelectedChunks([]);
          setQuizSubmitted(false);
          sound.playSuccess();
          fireSuccessConfetti();
          toast.success('🎯 AI 已根据您的学情画像生成专属靶向弱项测评！');
          return;
        }
      }

      // 离线环境备选动态题
      setTimeout(() => {
        const fallbackQ: QuizQuestionItem = {
          id: `q_ai_${Date.now()}`,
          type: 'CHOICE',
          category: 'AI 靶向弱项 · 助词「で」与「に」',
          prompt: '根据动作属性选择正确的场所助词：',
          content: '昨夜、友達と一緒に図書館（　）勉強しました。',
          options: [
            { key: 'A', text: 'で', note: '动作发生的场所' },
            { key: 'B', text: 'に', note: '静态存在场所或目的地' },
            { key: 'C', text: 'を', note: '宾格助词' },
            { key: 'D', text: 'へ', note: '移动方向' },
          ],
          correctAnswer: 'A',
          explanation: '「勉強する」为具体动态动作，动作发生场所固定使用「で」。',
          testedSkill: 'jp.particle.ni_vs_de',
        };
        setQuestions((prev) => [fallbackQ, ...prev]);
        setQuestionIndex(0);
        setSelectedChoice(null);
        setQuizSubmitted(false);
        sound.playSuccess();
        fireSuccessConfetti();
        toast.success('🎯 AI 已根据您的学情画像生成专属靶向弱项测评！');
      }, 500);
    } catch {
      toast.error('AI 动态出题请求超时');
    } finally {
      setIsGeneratingAdaptive(false);
    }
  };

  // 提交做题答题
  const handleQuizSubmit = () => {
    sound.playClick();
    let correct = false;

    if (currentQ.type === 'CHOICE') {
      correct = selectedChoice === currentQ.correctAnswer;
    } else if (currentQ.type === 'FILL_BLANK') {
      correct = fillBlankInput.trim().toLowerCase() === currentQ.correctAnswer.toLowerCase();
    } else if (currentQ.type === 'REORDER') {
      correct = reorderSelectedChunks.join(' ') === currentQ.correctAnswer;
    }

    setIsCurrentAnswerCorrect(correct);
    setQuizSubmitted(true);

    // 同步将做题结果与错题上报网关，由 SQLite 统一持久化
    onSubmitQuizToGateway({
      questionId: currentQ.id,
      userAnswer:
        currentQ.type === 'CHOICE'
          ? selectedChoice ?? ''
          : currentQ.type === 'FILL_BLANK'
          ? fillBlankInput
          : reorderSelectedChunks.join(' '),
      isCorrect: correct,
      score: correct ? 1 : 0,
      timeSpentMs: 2800,
      testedSkillId: currentQ.testedSkill,
      questionContent: currentQ.content,
      correctAnswer: currentQ.correctAnswer,
      explanation: currentQ.explanation,
    });

    if (correct) {
      sound.playSuccess();
      fireSuccessConfetti();
      setSessionScore((prev) => prev + 1);
      toast.success('回答正确！知识点掌握度提升 ＋5%');
    } else {
      sound.playMistake();
      toast.error('回答有误，系统已为您自动归入错题本并标注考点。');
    }
  };

  // 下一题处理
  const handleNextQuestion = () => {
    sound.playClick();
    setSelectedChoice(null);
    setFillBlankInput('');
    setReorderSelectedChunks([]);
    setQuizSubmitted(false);

    if (questionIndex < questions.length - 1) {
      setQuestionIndex((prev) => prev + 1);
    } else {
      toast.success(`恭喜完成本轮专项练习！总得分 ${sessionScore + (isCurrentAnswerCorrect ? 1 : 0)} / ${questions.length}`);
      setQuestionIndex(0);
      setSessionScore(0);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-5 max-w-3xl"
    >
      {/* 做题顶部子模式切换与 AI 靶向弱项组卷按钮 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#faf9f6] dark:bg-[#1a1816] p-3 rounded-2xl border border-amber-900/10 dark:border-amber-500/15 shadow-xs">
        {/* 子模式切换 */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-200/60 dark:bg-stone-900 rounded-xl">
          <button
            onClick={() => {
              sound.playClick();
              setQuizSubMode('OBJECTIVE');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              quizSubMode === 'OBJECTIVE'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            ⚡ 客观快速秒测 ({questions.length}题)
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setQuizSubMode('SUBJECTIVE');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              quizSubMode === 'SUBJECTIVE'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            ✍️ AI 深度主观造句/翻译批改
          </button>
        </div>

        {/* 针对画像弱项一键出题 */}
        <ShimmerButton
          onClick={handleGenerateAdaptiveQuiz}
          disabled={isGeneratingAdaptive}
          className="px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isGeneratingAdaptive ? 'AI 正在分析弱项组卷...' : '🎯 AI 针对弱项出题'}</span>
        </ShimmerButton>
      </div>

      {quizSubMode === 'SUBJECTIVE' ? (
        <SubjectiveWritingWorkbench onGradeSubjective={onGradeSubjective} />
      ) : (
        <>
          {/* 顶部进度指示 */}
          <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 px-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              第 {questionIndex + 1} 题 / 共 {questions.length} 题 · {currentQ.category}
            </span>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-[11px] text-stone-400 font-mono">
                快捷键: 1-4 选选项 / Enter 提交
              </span>
              <span className="font-semibold text-amber-700 dark:text-amber-400 font-mono">
                当前得分: <NumberTicker value={sessionScore} className="inline-block" />
              </span>
            </div>
          </div>

          {/* 题目主卡片 */}
          <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-3xl p-6 sm:p-8 border border-amber-900/10 dark:border-amber-500/15 shadow-sm space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300">
                  {currentQ.type === 'CHOICE' ? '单项选择题' : currentQ.type === 'FILL_BLANK' ? '填空变形题' : '连词成句题'}
                </span>
                <span className="text-xs text-stone-400 font-mono">
                  考查点: {currentQ.testedSkill}
                </span>
              </div>
              <h3 className="text-sm font-medium text-stone-500 dark:text-stone-400">
                {currentQ.prompt}
              </h3>
              <div className="text-lg sm:text-xl font-medium text-stone-900 dark:text-stone-100 pt-2 tracking-wide font-serif">
                {currentQ.content}
              </div>
            </div>

            {/* 题型 1: CHOICE (单选) */}
            {currentQ.type === 'CHOICE' && currentQ.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {currentQ.options.map((opt, optIdx) => {
                  const isSelected = selectedChoice === opt.key;
                  const showCorrect = quizSubmitted && opt.key === currentQ.correctAnswer;
                  const showWrong = quizSubmitted && isSelected && !isCurrentAnswerCorrect;

                  return (
                    <motion.button
                      key={opt.key}
                      whileHover={!quizSubmitted ? { scale: 1.01 } : {}}
                      whileTap={!quizSubmitted ? { scale: 0.99 } : {}}
                      disabled={quizSubmitted}
                      onClick={() => {
                        sound.playClick();
                        setSelectedChoice(opt.key);
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                        showCorrect
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-950 dark:text-emerald-200'
                          : showWrong
                          ? 'bg-rose-500/15 border-rose-500 text-rose-950 dark:text-rose-200'
                          : isSelected
                          ? 'bg-amber-500/15 border-amber-500 text-amber-950 dark:text-amber-100 ring-2 ring-amber-500/30'
                          : 'bg-stone-100/70 dark:bg-stone-900/50 border-stone-200/80 dark:border-stone-800 text-stone-800 dark:text-stone-200 hover:border-amber-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-stone-200/80 dark:bg-stone-800">
                          {opt.key} ({optIdx + 1})
                        </span>
                        {showCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        {showWrong && <XCircle className="w-4 h-4 text-rose-600" />}
                      </div>
                      <div className="text-base font-semibold pt-1">{opt.text}</div>
                      {opt.note && (
                        <div className="text-xs text-stone-400 mt-1">{opt.note}</div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* 题型 2: FILL_BLANK (真实输入验证) */}
            {currentQ.type === 'FILL_BLANK' && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={quizSubmitted}
                    value={fillBlankInput}
                    onChange={(e) => setFillBlankInput(e.target.value)}
                    placeholder="在此键入日文变形形式..."
                    className="flex-1 py-3 px-4 rounded-xl bg-stone-100/90 dark:bg-stone-900/80 text-stone-900 dark:text-stone-100 border border-stone-300 dark:border-stone-700 outline-none focus:border-amber-500 text-base"
                  />
                </div>
              </div>
            )}

            {/* 题型 3: REORDER (连词成句) */}
            {currentQ.type === 'REORDER' && currentQ.chunks && (
              <div className="space-y-4 pt-2">
                <div className="min-h-14 p-3 rounded-2xl border-2 border-dashed border-amber-500/30 bg-amber-50/40 dark:bg-stone-900/40 flex flex-wrap gap-2 items-center">
                  {reorderSelectedChunks.length === 0 ? (
                    <span className="text-xs text-stone-400">
                      点击下方词块按正确语序填入此处...
                    </span>
                  ) : (
                    reorderSelectedChunks.map((chunk, idx) => (
                      <button
                        key={idx}
                        disabled={quizSubmitted}
                        onClick={() => {
                          sound.playClick();
                          setReorderSelectedChunks((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-500 text-stone-950 text-xs font-semibold shadow-sm flex items-center gap-1 cursor-pointer"
                      >
                        <span>{chunk}</span>
                        <span className="text-[10px] opacity-75">✕</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {currentQ.chunks.map((chunk, cIdx) => {
                    const isUsed = reorderSelectedChunks.includes(chunk);
                    return (
                      <button
                        key={cIdx}
                        disabled={isUsed || quizSubmitted}
                        onClick={() => {
                          sound.playClick();
                          setReorderSelectedChunks((prev) => [...prev, chunk]);
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                          isUsed
                            ? 'opacity-30 border-stone-200 dark:border-stone-800 cursor-not-allowed'
                            : 'bg-stone-100 dark:bg-stone-900 border-stone-300 dark:border-stone-700 hover:border-amber-500 text-stone-800 dark:text-stone-200 cursor-pointer'
                        }`}
                      >
                        {chunk}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 提交 / 下一题控制条 */}
            <div className="flex items-center justify-between pt-4 border-t border-stone-200 dark:border-stone-800">
              {!quizSubmitted ? (
                <ShimmerButton
                  onClick={handleQuizSubmit}
                  disabled={
                    (currentQ.type === 'CHOICE' && !selectedChoice) ||
                    (currentQ.type === 'FILL_BLANK' && !fillBlankInput.trim()) ||
                    (currentQ.type === 'REORDER' && reorderSelectedChunks.length === 0)
                  }
                  className="px-6 py-2.5 text-xs font-bold"
                >
                  立即提交判定 (0ms 本地秒判)
                </ShimmerButton>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>下一题练习</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* 答题反馈与解析抽屉入口 */}
            {quizSubmitted && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-2xl border space-y-3 ${
                  isCurrentAnswerCorrect
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-rose-500/10 border-rose-500/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isCurrentAnswerCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-600" />
                    )}
                    <span className="font-bold text-sm">
                      {isCurrentAnswerCorrect ? '解答正确！' : `解答有误，标准答案：${currentQ.correctAnswer}`}
                    </span>
                  </div>

                  {/* AI 导师深度追问入口按钮 */}
                  <button
                    onClick={() =>
                      onOpenTutor({
                        questionText: currentQ.content,
                        userAnswer:
                          currentQ.type === 'CHOICE'
                            ? selectedChoice ?? undefined
                            : currentQ.type === 'FILL_BLANK'
                            ? fillBlankInput
                            : reorderSelectedChunks.join(' '),
                        correctAnswer: currentQ.correctAnswer,
                        skillTag: currentQ.category,
                        explanation: currentQ.explanation,
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-500 text-stone-950 hover:bg-amber-600 shadow-sm transition-all shrink-0 cursor-pointer"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>AI 导师深度剖析与追问</span>
                  </button>
                </div>

                <p className="text-xs sm:text-sm text-stone-700 dark:text-stone-300 leading-relaxed font-serif">
                  {currentQ.explanation}
                </p>
              </motion.div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
