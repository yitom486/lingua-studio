import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Volume2,
  Square,
  Highlighter,
  CreditCard,
  Languages,
  Loader2,
  Bookmark,
} from 'lucide-react';
import { toast } from 'sonner';
import { sound, speechStudio } from '../utils/audio.js';
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
import { useLearningShell } from '../hooks/useLearningShell.js';
import {
  DEMO_READING_SETS,
  NEWS_TOPIC_OPTIONS,
  type PassageOrigin,
} from '../data/reading-demo-data.js';
import {
  useReadingSetsQuery,
  useGenerateReadingSetMutation,
  useSubmitReadingPracticeMutation,
  useAddAnnotationMutation,
  useAddCardsMutation,
  useNewsTopicsQuery,
} from '../queries/useLearnerQueries.js';
import type { ReadingPassageSet } from '@study-studio/protocol';
import type { AiTutorContext } from './AiTutorDrawer.js';

interface ReadingComprehensionWorkbenchProps {
  onOpenTutor?: (ctx: AiTutorContext) => void;
}

export function ReadingComprehensionWorkbench({
  onOpenTutor,
}: ReadingComprehensionWorkbenchProps) {
  const shell = useLearningShell();
  const splitRatio = usePreferencesStore((s) => s.readingSplitRatio);
  const setReadingSplitRatio = usePreferencesStore((s) => s.setReadingSplitRatio);
  const furiganaEnabled = usePreferencesStore((s) => s.furiganaEnabled);
  const toggleFurigana = usePreferencesStore((s) => s.toggleFurigana);

  const [origin, setOrigin] = useState<PassageOrigin>('ai');
  const [langFilter, setLangFilter] = useState<'ALL' | 'JA' | 'EN' | 'KO'>(shell.defaultReadingLang);
  const [aiDifficulty, setAiDifficulty] = useState('2');
  const [newsTopic, setNewsTopic] = useState('world');

  // 当学习轨道切换时响应式同步阅读语言过滤器
  useEffect(() => {
    setLangFilter(shell.defaultReadingLang);
  }, [shell.defaultReadingLang]);

  // TanStack Query 服务端状态对接
  const { data: newsTopics = NEWS_TOPIC_OPTIONS } = useNewsTopicsQuery();
  const { data: dbReadingSets = [], isLoading: isSetsLoading } = useReadingSetsQuery(
    origin,
    langFilter === 'ALL' ? undefined : langFilter
  );
  const generateMutation = useGenerateReadingSetMutation();
  const submitPracticeMutation = useSubmitReadingPracticeMutation();
  const addAnnotationMutation = useAddAnnotationMutation();
  const addCardsMutation = useAddCardsMutation();

  // 有库数据时不再 merge 前端 DEMO；仅空库/失败时兜底
  const combinedSets: ReadingPassageSet[] = useMemo(() => {
    if (dbReadingSets.length > 0) return dbReadingSets;
    return DEMO_READING_SETS.filter((demo) => {
      if (origin && demo.origin !== origin) return false;
      if (langFilter !== 'ALL' && demo.language !== langFilter) return false;
      return true;
    });
  }, [dbReadingSets, origin, langFilter]);

  const [activeSetId, setActiveSetId] = useState<string>('');
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  // 音频朗读状态
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // 选区浮动工具栏状态
  const passageRef = useRef<HTMLDivElement>(null);
  const [selectionRange, setSelectionRange] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  // 默认选中第一个可用篇目
  useEffect(() => {
    if (combinedSets.length > 0) {
      if (!activeSetId || !combinedSets.some((s) => s.id === activeSetId)) {
        setActiveSetId(combinedSets[0]!.id);
        setStepIndex(0);
        setSelected(null);
        setSubmitted(false);
        setScore(0);
      }
    }
  }, [combinedSets, activeSetId]);

  const activeSet: ReadingPassageSet =
    combinedSets.find((s) => s.id === activeSetId) ??
    combinedSets[0] ??
    DEMO_READING_SETS[0]!;

  const question = activeSet?.questions[stepIndex] ?? activeSet?.questions[0];
  const totalQuestions = activeSet?.questions?.length || 1;
  const progressPct = ((stepIndex + (submitted ? 1 : 0)) / totalQuestions) * 100;

  // 切换分类或语言
  const switchOrigin = (next: PassageOrigin) => {
    sound.playClick();
    speechStudio.stop();
    setIsPlayingAudio(false);
    setOrigin(next);
    setStepIndex(0);
    setSelected(null);
    setSubmitted(false);
    setScore(0);
  };

  // 朗读文章
  const handleTogglePlayAudio = () => {
    sound.playClick();
    if (isPlayingAudio) {
      speechStudio.stop();
      setIsPlayingAudio(false);
    } else {
      setIsPlayingAudio(true);
      speechStudio.speak(activeSet.body, {
        lang: activeSet.language,
        onEnd: () => setIsPlayingAudio(false),
        onError: () => setIsPlayingAudio(false),
      });
    }
  };

  // 监听划词选择
  const handleMouseUpPassage = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelectionRange(null);
      return;
    }
    const text = sel.toString().trim();
    if (text.length > 1) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const parentRect = passageRef.current?.getBoundingClientRect();
      if (parentRect) {
        setSelectionRange({
          text,
          x: Math.max(10, rect.left - parentRect.left + rect.width / 2 - 100),
          y: Math.max(10, rect.top - parentRect.top - 44),
        });
      }
    }
  };

  // 划词标记重点
  const handleMarkKeyPoint = () => {
    if (!selectionRange?.text) return;
    sound.playClick();
    addAnnotationMutation.mutate({
      documentId: activeSet.id,
      quote: selectionRange.text,
      kind: 'KEY_POINT',
      startOffset: 0,
      endOffset: selectionRange.text.length,
    });
    toast.success(`已沉淀批注重点：“${selectionRange.text.slice(0, 15)}...”`);
    setSelectionRange(null);
    window.getSelection()?.removeAllRanges();
  };

  // 划词转记忆卡
  const handleConvertToFlashcard = () => {
    if (!selectionRange?.text) return;
    sound.playClick();
    addCardsMutation.mutate([
      {
        id: `card_${Date.now()}`,
        type: 'VOCAB',
        frontWord: selectionRange.text,
        reading: '',
        tag: '阅读精读',
        pos: '重点词句',
        backMeaning: `来自阅读篇目《${activeSet.title}》的重点摘录与研读。`,
        exampleJp: activeSet.body.slice(0, 80),
        exampleHighlight: selectionRange.text,
        exampleZh: '',
        stability: 1.0,
        reps: 0,
      },
    ]);
    toast.success('已一键转化为 FSRS 记忆卡！可在闪卡工作台复习。');
    setSelectionRange(null);
    window.getSelection()?.removeAllRanges();
  };

  // 提交单题作答
  const handleSubmitAnswer = () => {
    if (!selected || submitted || !question) return;
    sound.playClick();
    const ok = selected === question.correctAnswer;
    setSubmitted(true);
    if (ok) {
      setScore((s) => s + 1);
      sound.playCorrect();
      toast.success('回答正确！+1');
    } else {
      sound.playMistake();
      toast.error(`回答有误，正确答案为: ${question.correctAnswer}`);
    }
  };

  // 进入下一题或完成整篇
  const handleNextQuestion = () => {
    sound.playClick();
    if (stepIndex < totalQuestions - 1) {
      setStepIndex((i) => i + 1);
      setSelected(null);
      setSubmitted(false);
    } else {
      // 完成整篇，回写学情与打卡
      const finalScore = score + (selected === question?.correctAnswer ? 0 : 0);
      submitPracticeMutation.mutate({
        setId: activeSet.id,
        score: finalScore,
        totalQuestions,
        language: activeSet.language,
      });

      if (finalScore >= Math.ceil(totalQuestions * 0.8)) {
        fireSuccessConfetti();
        sound.playSuccess();
        toast.success(`太棒了！本篇阅读理解通关：${finalScore}/${totalQuestions} 题正确！`);
      } else {
        toast.info(`本篇完成：答对 ${finalScore}/${totalQuestions} 题。继续加油！`);
      }

      setStepIndex(0);
      setSelected(null);
      setSubmitted(false);
      setScore(0);
    }
  };

  // 动态生成篇目
  const handleGenerateNewPassage = async () => {
    sound.playClick();
    try {
      const genLanguage: 'JA' | 'EN' | 'KO' =
        langFilter === 'JA' ? 'JA' : langFilter === 'KO' ? 'KO' : 'EN';
      toast.loading(
        origin === 'ai'
          ? genLanguage === 'EN'
            ? `AI 正在按 CET/考研向难度 Lv.${aiDifficulty} 生成英语精读篇...`
            : genLanguage === 'KO'
              ? `AI 正在生成韩语轨道脚手架篇目（interim）Lv.${aiDifficulty}...`
              : `AI 正在按难度 Lv.${aiDifficulty} 生成日语自适应长文...`
          : genLanguage === 'EN'
            ? `正在从英语媒体 RSS 拉取「${newsTopic}」（BBC / The Guardian / NPR）...`
            : genLanguage === 'KO'
              ? `正在拉取韩语轨道 interim 新闻 RSS「${newsTopic}」...`
              : `正在从 NHK ONE RSS 拉取「${newsTopic}」日语新闻...`,
        { id: 'generate-reading' }
      );
      const generated = await generateMutation.mutateAsync({
        origin,
        difficulty: Number(aiDifficulty),
        language: genLanguage,
        topic:
          origin === 'news'
            ? newsTopic
            : genLanguage === 'EN'
              ? 'education and media literacy'
              : genLanguage === 'KO'
                ? '시사·생활'
                : '日常生活与文化',
      });
      toast.success(
        origin === 'ai' ? '自适应阅读长文与配套测试题生成成功！' : '真实新闻篇目抓取与排版完成！',
        { id: 'generate-reading' }
      );
      if (generated?.id) {
        setActiveSetId(generated.id);
        setStepIndex(0);
        setSelected(null);
        setSubmitted(false);
        setScore(0);
      }
    } catch (e) {
      toast.error('生成篇目失败，请检查网关连接状态', { id: 'generate-reading' });
    }
  };

  // 左侧文章区
  const passagePanel = (
    <div
      ref={passageRef}
      onMouseUp={handleMouseUpPassage}
      className="h-full rounded-2xl border border-amber-900/10 dark:border-amber-500/15 bg-[#faf9f6] dark:bg-[#1a1816] shadow-xs flex flex-col overflow-hidden relative"
    >
      {/* 划词悬浮快捷栏 */}
      <AnimatePresence>
        {selectionRange && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 4 }}
            style={{ left: selectionRange.x, top: selectionRange.y }}
            className="absolute z-30 flex items-center gap-1 p-1 bg-stone-900 text-white rounded-xl shadow-xl text-xs"
          >
            <button
              onClick={() => speechStudio.speak(selectionRange.text, { lang: activeSet.language })}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-stone-800 rounded-lg transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              朗读
            </button>
            <div className="w-[1px] h-3.5 bg-stone-700" />
            <button
              onClick={handleMarkKeyPoint}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-stone-800 rounded-lg transition-colors"
            >
              <Highlighter className="w-3.5 h-3.5 text-amber-400" />
              标重点
            </button>
            <div className="w-[1px] h-3.5 bg-stone-700" />
            <button
              onClick={handleConvertToFlashcard}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-stone-800 rounded-lg transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
              转闪卡
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 顶部篇目信息栏与操作 */}
      <div className="px-4 py-3 border-b border-amber-900/10 dark:border-amber-500/15 flex flex-wrap items-center gap-2 justify-between bg-amber-500/5">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={activeSet.origin === 'ai' ? 'amber' : 'emerald'}>
              {activeSet.origin === 'ai' ? 'AI 自适应篇目' : '真实精选新闻'}
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px]">
              Lv.{activeSet.difficulty}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {activeSet.language === 'JA' ? '日文' : activeSet.language === 'KO' ? '韩文' : '英文'}
            </Badge>
            <span className="text-[11px] text-stone-500 truncate">{activeSet.sourceLabel}</span>
          </div>
          <h3 className="text-sm sm:text-base font-bold font-serif text-stone-900 dark:text-stone-100 truncate">
            {activeSet.title}
          </h3>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* TTS 朗读控制 */}
          <Button
            variant={isPlayingAudio ? 'amber' : 'outline'}
            size="sm"
            onClick={handleTogglePlayAudio}
            className="text-xs gap-1"
          >
            {isPlayingAudio ? (
              <>
                <Square className="w-3.5 h-3.5 animate-pulse text-amber-900 dark:text-amber-100" />
                停止
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                全文朗读
              </>
            )}
          </Button>

          {/* 假名注音开关 (仅日文篇目可见) */}
          {activeSet.language === 'JA' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFurigana}
              className={`text-xs gap-1 ${furiganaEnabled ? 'text-amber-700 font-bold' : 'text-stone-400'}`}
              title="切换假名注音辅助"
            >
              <Languages className="w-3.5 h-3.5" />
              注音
            </Button>
          )}

          {activeSet.sourceUrl && (
            <a
              href={activeSet.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-center gap-1 hover:underline"
            >
              来源 <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* 篇目列表切换胶囊 */}
      {combinedSets.length > 1 && (
        <div className="px-4 py-2 border-b border-stone-200/50 dark:border-stone-800/50 flex items-center gap-2 overflow-x-auto bg-stone-100/40 dark:bg-stone-900/30">
          <Bookmark className="w-3 h-3 text-stone-400 shrink-0" />
          <span className="text-[11px] text-stone-400 shrink-0">当前精选：</span>
          <div className="flex items-center gap-1.5 flex-nowrap">
            {combinedSets.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  sound.playClick();
                  speechStudio.stop();
                  setIsPlayingAudio(false);
                  setActiveSetId(s.id);
                  setStepIndex(0);
                  setSelected(null);
                  setSubmitted(false);
                  setScore(0);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-all ${
                  s.id === activeSet.id
                    ? 'bg-amber-600 text-white font-medium shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/70 dark:hover:bg-stone-800'
                }`}
              >
                {s.title.slice(0, 14)}...
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 正文呈现区 */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 select-text">
        <p className="text-[15px] sm:text-base leading-8 whitespace-pre-wrap font-serif text-stone-800 dark:text-stone-200 selection:bg-amber-500/25 selection:text-amber-900 dark:selection:text-amber-100">
          {activeSet.body}
        </p>
      </div>

      <div className="px-4 py-2 text-[11px] text-stone-400 dark:text-stone-500 border-t border-amber-900/5 dark:border-amber-500/5 flex items-center justify-between">
        <span>💡 划词可即时朗读、沉淀重点或一键出闪卡</span>
        <span>共 {activeSet.body.length} 字/词</span>
      </div>
    </div>
  );

  // 右侧题目自测区
  const questionPanel = (
    <div className="h-full rounded-2xl border border-amber-900/10 dark:border-amber-500/15 bg-[#faf9f6] dark:bg-[#1a1816] shadow-xs flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-900/10 dark:border-amber-500/15 space-y-2">
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span className="font-mono">
            第 {stepIndex + 1} / {totalQuestions} 题
          </span>
          <span className="text-amber-700 dark:text-amber-400 font-medium">
            本篇已答对 {score} 题
          </span>
        </div>
        <Progress value={progressPct} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {question ? (
          <>
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
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100'
                        : showBad
                          ? 'border-rose-500 bg-rose-500/10 text-rose-950 dark:text-rose-100'
                          : isSel
                            ? 'border-amber-500 bg-amber-500/10 font-medium'
                            : ''
                    }`}
                  >
                    <Badge variant="secondary" className="mr-2 font-mono shrink-0">
                      {opt.key}
                    </Badge>
                    <span className="text-sm">{opt.text}</span>
                    {showOk && (
                      <CheckCircle2 className="w-4 h-4 ml-auto text-emerald-600 shrink-0" />
                    )}
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
          </>
        ) : (
          <div className="py-8 text-center text-sm text-stone-400">
            暂无配套阅读理解题目
          </div>
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
          {onOpenTutor && submitted && question && (
            <Button
              variant="amber"
              size="sm"
              onClick={() =>
                onOpenTutor({
                  questionText: `【阅读理解】篇目《${activeSet.title}》：${question.prompt}`,
                  userAnswer: selected ?? undefined,
                  correctAnswer: question.correctAnswer,
                  skillTag: '长文阅读理解',
                  explanation: `篇目正文：“${activeSet.body.slice(0, 100)}...”\n\n题目解析：“${question.explanation}”`,
                })
              }
            >
              <Bot className="w-3.5 h-3.5" /> 追问导师
            </Button>
          )}

          {!submitted ? (
            <Button size="sm" disabled={!selected} onClick={handleSubmitAnswer}>
              提交本题
            </Button>
          ) : (
            <Button size="sm" onClick={handleNextQuestion}>
              {stepIndex < totalQuestions - 1 ? '下一题' : '完成本篇'}
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
      {/* 顶部控制栏与生成器 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl border border-amber-900/10 dark:border-amber-500/15 bg-[#faf9f6] dark:bg-[#1a1816] shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-300 flex items-center justify-center">
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-stone-100">
                阅读理解工作室 (Reading Studio)
              </h2>
              <Badge variant="amber" className="text-[10px]">
                双栏拖拽可调宽
              </Badge>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              AI 分级篇目与真实合规新闻双源驱动 · 左文右题 · 划词转闪卡 · 自动同步学情
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 语种过滤切换 */}
          <div className="flex items-center bg-stone-200/60 dark:bg-stone-800 rounded-xl p-0.5 text-xs">
            <button
              onClick={() => {
                sound.playClick();
                setLangFilter('ALL');
              }}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                langFilter === 'ALL'
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => {
                sound.playClick();
                setLangFilter('JA');
              }}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                langFilter === 'JA'
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500'
              }`}
            >
              日文
            </button>
            <button
              onClick={() => {
                sound.playClick();
                setLangFilter('EN');
              }}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                langFilter === 'EN'
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500'
              }`}
            >
              英文
            </button>
            <button
              onClick={() => {
                sound.playClick();
                setLangFilter('KO');
              }}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                langFilter === 'KO'
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500'
              }`}
            >
              韩文
            </button>
          </div>

          {/* 篇目来源切换 */}
          <Tabs value={origin} onValueChange={(v) => v && switchOrigin(v as PassageOrigin)}>
            <TabsList className="bg-stone-200/60 dark:bg-stone-800">
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
                    难度 Lv.{d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={newsTopic} onValueChange={(v) => v && setNewsTopic(v)}>
              <SelectTrigger className="w-[8.5rem]">
                <SelectValue placeholder="栏目" />
              </SelectTrigger>
              <SelectContent>
                {newsTopics.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={generateMutation.isPending}
            onClick={handleGenerateNewPassage}
            className="text-xs gap-1"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
                {origin === 'ai' ? '自适应生成' : '抓取新闻'}
              </>
            )}
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-stone-400 hidden md:block px-1">
        拖拽中间分隔条，或按 <kbd className="px-1 rounded bg-stone-200/80 dark:bg-stone-800 font-mono">[</kbd>
        {' / '}
        <kbd className="px-1 rounded bg-stone-200/80 dark:bg-stone-800 font-mono">]</kbd>
        微调双栏宽度（Shift 加大步进；偏好已本地持久化）。
      </p>
      <p className="text-[11px] text-stone-400 md:hidden px-1">
        手机端为上下布局；桌面端可拖拽中间分隔条调整宽度（分栏偏好已自动本地持久化）。
      </p>

      {/* 双栏自适应阅读器 */}
      <ResizableSplitPane
        ratio={splitRatio}
        onRatioChange={setReadingSplitRatio}
        enableBracketShortcuts
        left={passagePanel}
        right={questionPanel}
      />
    </motion.div>
  );
}
