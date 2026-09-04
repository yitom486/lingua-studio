import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Newspaper,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Bot,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { sound } from '../utils/audio.js';
import { fireSuccessConfetti } from './magicui/index.js';
import { ResizableSplitPane } from './ui/resizable-split-pane.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from './ui/tabs.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js';
import { Progress } from './ui/progress.js';
import { usePreferencesStore } from '../stores/usePreferencesStore.js';
import {
  DEMO_READING_SETS,
  NEWS_TOPIC_OPTIONS,
  type PassageOrigin,
  type ReadingPassageSet,
} from '../data/reading-demo-data.js';
import type { AiTutorContext } from './AiTutorDrawer.js';

interface ReadingComprehensionWorkbenchProps {
  onOpenTutor?: (ctx: AiTutorContext) => void;
}

export function ReadingComprehensionWorkbench({
  onOpenTutor,
}: ReadingComprehensionWorkbenchProps) {
  const splitRatio = usePreferencesStore((s) => s.readingSplitRatio);
  const setReadingSplitRatio = usePreferencesStore((s) => s.setReadingSplitRatio);

  const [origin, setOrigin] = useState<PassageOrigin>('ai');
  const [aiDifficulty, setAiDifficulty] = useState('2');
  const [newsTopic, setNewsTopic] = useState('technology');
  const [activeSetId, setActiveSetId] = useState(DEMO_READING_SETS[0]!.id);
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const filteredSets = useMemo(
    () => DEMO_READING_SETS.filter((s) => s.origin === origin),
    [origin]
  );

  const activeSet: ReadingPassageSet =
    filteredSets.find((s) => s.id === activeSetId) ?? filteredSets[0] ?? DEMO_READING_SETS[0]!;

  const question = activeSet.questions[stepIndex] ?? activeSet.questions[0]!;
  const progressPct = ((stepIndex + (submitted ? 1 : 0)) / activeSet.questions.length) * 100;

  const switchOrigin = (next: PassageOrigin) => {
    sound.playClick();
    setOrigin(next);
    const first = DEMO_READING_SETS.find((s) => s.origin === next);
    if (first) setActiveSetId(first.id);
    setStepIndex(0);
    setSelected(null);
    setSubmitted(false);
    setScore(0);
  };

  const handleSubmit = () => {
    if (!selected || submitted) return;
    sound.playClick();
    const ok = selected === question.correctAnswer;
    setSubmitted(true);
    if (ok) {
      setScore((s) => s + 1);
      sound.playSuccess();
      fireSuccessConfetti();
      toast.success('回答正确');
    } else {
      sound.playMistake();
      toast.error(`正确答案：${question.correctAnswer}`);
    }
  };

  const goNext = () => {
    sound.playClick();
    if (stepIndex < activeSet.questions.length - 1) {
      setStepIndex((i) => i + 1);
      setSelected(null);
      setSubmitted(false);
    } else {
      toast.success(
        `本篇完成！本轮答对 ${score} / ${activeSet.questions.length} 题`
      );
      setStepIndex(0);
      setSelected(null);
      setSubmitted(false);
      setScore(0);
    }
  };

  const regenerateHint = () => {
    sound.playClick();
    if (origin === 'ai') {
      toast.info(`演示：将按难度 ${aiDifficulty} 重新生成文章套题（待接 learning.content）`);
    } else {
      toast.info(`演示：将拉取「${newsTopic}」栏目今日新闻并配题（待接 learning.library.fetch_news）`);
    }
  };

  const passagePanel = (
    <div className="h-full rounded-2xl border border-amber-900/10 dark:border-amber-500/15 bg-[#faf9f6] dark:bg-[#1a1816] shadow-xs flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-900/10 dark:border-amber-500/15 flex flex-wrap items-center gap-2 justify-between bg-amber-500/5">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={origin === 'ai' ? 'amber' : 'emerald'}>
              {origin === 'ai' ? 'AI 文章' : '真实新闻（演示）'}
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px]">
              Lv.{activeSet.difficulty}
            </Badge>
            <span className="text-[11px] text-stone-500 truncate">{activeSet.sourceLabel}</span>
          </div>
          <h3 className="text-sm sm:text-base font-bold font-serif text-stone-900 dark:text-stone-100 truncate">
            {activeSet.title}
          </h3>
        </div>
        {activeSet.sourceUrl && (
          <a
            href={activeSet.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-center gap-1 shrink-0 hover:underline"
          >
            来源 <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-5 sm:p-6">
        <p className="text-[15px] sm:text-base leading-8 whitespace-pre-wrap font-serif text-stone-800 dark:text-stone-200 select-text">
          {activeSet.body}
        </p>
      </div>
    </div>
  );

  const questionPanel = (
    <div className="h-full rounded-2xl border border-amber-900/10 dark:border-amber-500/15 bg-[#faf9f6] dark:bg-[#1a1816] shadow-xs flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-900/10 dark:border-amber-500/15 space-y-2">
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span className="font-mono">
            第 {stepIndex + 1} / {activeSet.questions.length} 题
          </span>
          <span>本篇正确 {score}</span>
        </div>
        <Progress value={progressPct} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-relaxed">
          {question.prompt}
        </p>
        <div className="space-y-2">
          {question.options.map((opt) => {
            const isSel = selected === opt.key;
            const showOk = submitted && opt.key === question.correctAnswer;
            const showBad = submitted && isSel && opt.key !== question.correctAnswer;
            return (
              <Button
                key={opt.key}
                type="button"
                variant="outline"
                disabled={submitted}
                onClick={() => {
                  sound.playClick();
                  setSelected(opt.key);
                }}
                className={`h-auto w-full justify-start px-3 py-3 text-left font-normal ${
                  showOk
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : showBad
                      ? 'border-rose-500 bg-rose-500/10'
                      : isSel
                        ? 'border-amber-500 bg-amber-500/10'
                        : ''
                }`}
              >
                <Badge variant="secondary" className="mr-2 font-mono shrink-0">
                  {opt.key}
                </Badge>
                <span className="text-sm">{opt.text}</span>
                {showOk && <CheckCircle2 className="w-4 h-4 ml-auto text-emerald-600 shrink-0" />}
                {showBad && <XCircle className="w-4 h-4 ml-auto text-rose-600 shrink-0" />}
              </Button>
            );
          })}
        </div>

        {submitted && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl text-xs leading-relaxed bg-amber-500/10 border border-amber-500/20 text-stone-700 dark:text-stone-300"
          >
            💡 {question.explanation}
          </motion.div>
        )}
      </div>

      <div className="p-3 border-t border-amber-900/10 dark:border-amber-500/15 flex flex-wrap items-center gap-2 justify-between">
        <Button
          variant="ghost"
          size="sm"
          disabled={stepIndex === 0 && !submitted}
          onClick={() => {
            sound.playClick();
            setStepIndex((i) => Math.max(0, i - 1));
            setSelected(null);
            setSubmitted(false);
          }}
        >
          <ChevronLeft className="w-4 h-4" /> 上一题
        </Button>

        <div className="flex items-center gap-2">
          {onOpenTutor && submitted && (
            <Button
              variant="amber"
              size="sm"
              onClick={() =>
                onOpenTutor({
                  questionText: `${activeSet.title} · ${question.prompt}`,
                  userAnswer: selected ?? undefined,
                  correctAnswer: question.correctAnswer,
                  skillTag: '阅读理解',
                  explanation: question.explanation,
                })
              }
            >
              <Bot className="w-3.5 h-3.5" /> 追问
            </Button>
          )}
          {!submitted ? (
            <Button size="sm" disabled={!selected} onClick={handleSubmit}>
              提交本题
            </Button>
          ) : (
            <Button size="sm" onClick={goNext}>
              {stepIndex < activeSet.questions.length - 1 ? '下一题' : '完成本篇'}
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4 w-full max-w-6xl"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl border border-amber-900/10 dark:border-amber-500/15 bg-[#faf9f6] dark:bg-[#1a1816] shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-300 flex items-center justify-center">
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-stone-100">
                阅读理解工作室
              </h2>
              <Badge variant="amber" className="text-[10px]">
                双栏可调宽
              </Badge>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              AI 生成文章或真实新闻（演示）· 左文右题 · 拖拽中间分隔条调宽
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={origin} onValueChange={(v) => v && switchOrigin(v as PassageOrigin)}>
            <TabsList className="bg-stone-200/60 dark:bg-stone-900">
              <TabsIndicator />
              <TabsTrigger value="ai" className="text-xs gap-1">
                <Sparkles className="w-3.5 h-3.5" /> AI 写文章
              </TabsTrigger>
              <TabsTrigger value="news" className="text-xs gap-1">
                <Newspaper className="w-3.5 h-3.5" /> 今日新闻
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {origin === 'ai' ? (
            <Select value={aiDifficulty} onValueChange={(v) => v && setAiDifficulty(v)}>
              <SelectTrigger className="w-[7.5rem]">
                <SelectValue placeholder="难度" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    难度 {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={newsTopic} onValueChange={(v) => v && setNewsTopic(v)}>
              <SelectTrigger className="w-[9rem]">
                <SelectValue placeholder="栏目" />
              </SelectTrigger>
              <SelectContent>
                {NEWS_TOPIC_OPTIONS.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="sm" onClick={regenerateHint}>
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {origin === 'ai' ? '按难度生成' : '拉取栏目'}
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-stone-400 md:hidden px-1">
        手机端为上下布局；桌面端可拖拽中间分隔条调整宽度（偏好已本地保存）。
      </p>

      <ResizableSplitPane
        ratio={splitRatio}
        onRatioChange={setReadingSplitRatio}
        left={passagePanel}
        right={questionPanel}
      />
    </motion.div>
  );
}
