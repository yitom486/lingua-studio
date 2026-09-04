import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Headphones,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Mic,
  Sparkles,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Eye,
  EyeOff,
  BookOpen,
  Bot,
  Flame,
} from 'lucide-react';
import { sound } from '../utils/audio.js';
import { toast } from 'sonner';
import { TEXTBOOK_BOOKS, type TextbookLesson, type TextbookSentence } from '../data/textbook-data.js';
import type { AiTutorContext } from './AiTutorDrawer.js';

interface ListeningShadowingWorkbenchProps {
  onOpenTutor?: (context: AiTutorContext) => void;
  onAddMistake?: (mistake: {
    categoryTag: string;
    prompt: string;
    sentence: string;
    userWrongAnswer: string;
    correctAnswer: string;
    testedSkillId: string;
    reviewNote: string;
  }) => void;
}

// 听力精听填空训练数据池
interface DictationItem {
  id: string;
  sourceLesson: string;
  speaker: string;
  fullJapanese: string;
  chinese: string;
  blankPrompt: string;
  clozeDisplay: string; // e.g. "昨日の夜、静かなカフェ（　）本を読みました。"
  targetWord: string; // e.g. "で"
  furiganaHint: string;
  categoryTag: string;
  testedSkillId: string;
  grammarExplanation: string;
}

const DICTATION_CHALLENGES: DictationItem[] = [
  {
    id: 'dict_01',
    sourceLesson: '标日第 1 课 · 出逢い',
    speaker: '小野',
    fullJapanese: '李さんは中国人ですか。',
    chinese: '小李是中国人吗？',
    blankPrompt: '听录音，填入句尾疑问助词：',
    clozeDisplay: '李さんは中国人です（　）。',
    targetWord: 'か',
    furiganaHint: 'ka',
    categoryTag: '疑问终助词',
    testedSkillId: 'jp.particle.ka',
    grammarExplanation: '日语中终助词「か」附在句尾表示疑问，相当于汉语的“吗”，句尾句调需微升。',
  },
  {
    id: 'dict_02',
    sourceLesson: '标日第 2 课 · 事物指示',
    speaker: '李',
    fullJapanese: 'これは日本語の教科書です。',
    chinese: '这是日语教科书。',
    blankPrompt: '听录音，填入名词之间的所属格助词：',
    clozeDisplay: 'これは日本語（　）教科書です。',
    targetWord: 'の',
    furiganaHint: 'no',
    categoryTag: '连体格助词',
    testedSkillId: 'jp.particle.no',
    grammarExplanation: '格助词「の」连接两个名词，表示所属、修饰或属性，“日语的教科书”。',
  },
  {
    id: 'dict_03',
    sourceLesson: '标日综合练习 · 动态场所',
    speaker: '王',
    fullJapanese: '昨日の夜、静かなカフェで本を読みました。',
    chinese: '昨天晚上，我在安静的咖啡馆读了书。',
    blankPrompt: '听录音，填入动作发生场所格助词：',
    clozeDisplay: '昨日の夜、静かなカフェ（　）本を読みました。',
    targetWord: 'で',
    furiganaHint: 'de',
    categoryTag: '场所格助词辨析',
    testedSkillId: 'jp.particle.ni_vs_de',
    grammarExplanation: '「本を読む」是动态自主动作，动作发生的场所必须使用格助词「で」，切忌混淆为静态存在的「に」。',
  },
  {
    id: 'dict_04',
    sourceLesson: '大家的日语 · 移动目标',
    speaker: '田中',
    fullJapanese: '来週の金曜日に東京へ新幹線で行きます。',
    chinese: '下周五坐新干线去东京。',
    blankPrompt: '听录音，填入移动方向格助词：',
    clozeDisplay: '来週の金曜日に東京（　）新幹線で行きます。',
    targetWord: 'へ',
    furiganaHint: 'e (へ)',
    categoryTag: '移动方向助词',
    testedSkillId: 'jp.particle.destination',
    grammarExplanation: '方向助词「へ」(读音作 e) 表示动作移动的方向或归着点；亦可用「に」。',
  },
];

import { useTts } from '../hooks/useTts.js';
import { UnifiedTtsPlayer } from './UnifiedTtsPlayer.js';
import { usePreferencesStore } from '../stores/usePreferencesStore.js';
import type { SupportedLanguage, TtsGender } from '../utils/audio.js';

export const ListeningShadowingWorkbench: React.FC<ListeningShadowingWorkbenchProps> = ({
  onOpenTutor,
  onAddMistake,
}) => {
  // 模式切换: 'SHADOWING' (对话影子跟读) | 'DICTATION' (精听挖词听写)
  const [activeSubMode, setActiveSubMode] = useState<'SHADOWING' | 'DICTATION'>('SHADOWING');

  // 对话精听状态 (集成多语种教材课次)
  const allLessons = TEXTBOOK_BOOKS.flatMap((b) =>
    b.lessons.map((l) => ({
      lesson: l,
      bookTitle: b.shortTitle,
      language: (b.language || 'JA') as SupportedLanguage,
    }))
  );
  const [selectedLessonId, setSelectedLessonId] = useState<string>(allLessons[0]?.lesson.id ?? '');
  const activeLessonMeta = allLessons.find((item) => item.lesson.id === selectedLessonId) ?? allLessons[0]!;
  const activeLesson: TextbookLesson = activeLessonMeta.lesson;
  const currentLanguage: SupportedLanguage = activeLessonMeta.language;
  const [sentenceIndex, setSentenceIndex] = useState<number>(0);

  // 统一的 TTS 调度与状态 (Zustand)
  const { isSpeaking, gender, rate, speak, stop, setGender, setRate } = useTts();
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const isLoopingRef = useRef<boolean>(isLooping);
  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  // 全局持久化偏好 (注音显示与盲听遮罩)
  const showFurigana = usePreferencesStore((s) => s.furiganaEnabled);
  const setShowFurigana = usePreferencesStore((s) => s.setFuriganaEnabled);
  const maskText = usePreferencesStore((s) => s.maskTextEnabled);
  const setMaskText = usePreferencesStore((s) => s.setMaskTextEnabled);
  const [shadowStep, setShadowStep] = useState<'IDLE' | 'LISTENING' | 'SHADOWING'>('IDLE');

  // 挖词听写状态
  const [dictationIndex, setDictationIndex] = useState<number>(0);
  const [userInput, setUserInput] = useState<string>('');
  const [hasChecked, setHasChecked] = useState<boolean>(false);
  const [isDictationCorrect, setIsDictationCorrect] = useState<boolean | null>(null);

  const activeSentence: TextbookSentence | undefined = activeLesson.dialogues[sentenceIndex];
  const activeDictation = DICTATION_CHALLENGES[dictationIndex]!;

  // 播放当前句子并驱动影子跟读流程
  const playActiveSentence = () => {
    if (!activeSentence) return;
    setShadowStep('LISTENING');
    speak(activeSentence.japanese, {
      lang: currentLanguage,
      gender,
      rate,
      onStart: () => setShadowStep('LISTENING'),
      onEnd: () => {
        if (activeSubMode === 'SHADOWING') {
          setShadowStep('SHADOWING');
          setTimeout(() => {
            if (isLoopingRef.current) {
              playActiveSentence();
            } else {
              setShadowStep('IDLE');
            }
          }, 1800);
        } else {
          setShadowStep('IDLE');
        }
      },
      onError: () => {
        setShadowStep('IDLE');
      },
    });
  };

  const handleTogglePlay = () => {
    sound.playClick();
    if (isSpeaking) {
      stop();
      setShadowStep('IDLE');
    } else {
      if (activeSubMode === 'SHADOWING' && activeSentence) {
        playActiveSentence();
      } else if (activeSubMode === 'DICTATION') {
        speak(activeDictation.fullJapanese, { lang: 'JA' });
      }
    }
  };

  const handleNextSentence = () => {
    sound.playClick();
    stop();
    setShadowStep('IDLE');
    if (sentenceIndex < activeLesson.dialogues.length - 1) {
      setSentenceIndex((prev) => prev + 1);
    } else {
      setSentenceIndex(0);
    }
  };

  const handlePrevSentence = () => {
    sound.playClick();
    stop();
    setShadowStep('IDLE');
    if (sentenceIndex > 0) {
      setSentenceIndex((prev) => prev - 1);
    } else {
      setSentenceIndex(activeLesson.dialogues.length - 1);
    }
  };

  // 挖词听写提交比对
  const handleCheckDictation = () => {
    if (!userInput.trim()) {
      toast.warning('请输入您听到的假名或助词');
      return;
    }

    const trimmedUser = userInput.trim();
    const isCorrect =
      trimmedUser === activeDictation.targetWord ||
      trimmedUser.toLowerCase() === activeDictation.furiganaHint.toLowerCase();

    setIsDictationCorrect(isCorrect);
    setHasChecked(true);

    if (isCorrect) {
      sound.playSuccess();
      toast.success('听写完全正确！假名与格助词掌握敏锐！');
    } else {
      sound.playError();
      toast.error(`听写有误：正确应为「${activeDictation.targetWord}」`);

      if (onAddMistake) {
        onAddMistake({
          categoryTag: activeDictation.categoryTag,
          prompt: activeDictation.blankPrompt,
          sentence: activeDictation.clozeDisplay,
          userWrongAnswer: trimmedUser,
          correctAnswer: activeDictation.targetWord,
          testedSkillId: activeDictation.testedSkillId,
          reviewNote: activeDictation.grammarExplanation,
        });
      }
    }
  };

  const handleNextDictation = () => {
    sound.playClick();
    setUserInput('');
    setHasChecked(false);
    setIsDictationCorrect(null);
    setShadowStep('IDLE');
    if (dictationIndex < DICTATION_CHALLENGES.length - 1) {
      setDictationIndex((prev) => prev + 1);
    } else {
      setDictationIndex(0);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* 顶部标题与控制栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#faf9f6] dark:bg-[#1a1816] p-4 sm:p-5 rounded-2xl border border-amber-900/10 dark:border-amber-500/15 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-300 flex items-center justify-center font-bold">
            <Headphones className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-stone-100">
                听力精听与影子跟读工作台
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/20 font-medium">
                Web Audio 原声解析
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              短句切片循环 · 假名标音遮罩 · 影子同步跟读 · 关键助词听写
            </p>
          </div>
        </div>

        {/* 二级模式切换按钮 */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-200/60 dark:bg-stone-900 rounded-xl border border-amber-900/10 dark:border-amber-500/15 self-start sm:self-auto">
          <button
            onClick={() => {
              sound.playClick();
              setActiveSubMode('SHADOWING');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubMode === 'SHADOWING'
                ? 'bg-white dark:bg-amber-600 text-stone-950 dark:text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            🎙️ 对话短句影子跟读
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setActiveSubMode('DICTATION');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubMode === 'DICTATION'
                ? 'bg-white dark:bg-amber-600 text-stone-950 dark:text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            ✍️ 考点挖词精听听写 ({DICTATION_CHALLENGES.length})
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 模式一：对话短句影子跟读 (SHADOWING)                                        */}
      {/* ========================================================================= */}
      {activeSubMode === 'SHADOWING' && (
        <div className="flex flex-col gap-5">
          {/* 教材课文快速选择与播放参数设置 */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#fdfcfb] dark:bg-[#181615] p-3.5 rounded-xl border border-amber-900/10 dark:border-amber-500/15 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-stone-500 font-medium">当前教材篇目：</span>
              <select
                value={selectedLessonId}
                onChange={(e) => {
                  sound.playClick();
                  stop();
                  setShadowStep('IDLE');
                  setSelectedLessonId(e.target.value);
                  setSentenceIndex(0);
                }}
                aria-label="选择教材篇目"
                className="bg-white dark:bg-[#211f1d] border border-amber-900/20 dark:border-amber-500/20 text-stone-900 dark:text-stone-100 rounded-lg px-2.5 py-1.5 font-medium outline-none focus:ring-1 focus:ring-amber-500"
              >
                {allLessons.map((item) => (
                  <option key={item.lesson.id} value={item.lesson.id}>
                    《{item.bookTitle}》第 {item.lesson.lessonNumber} 课 · {item.lesson.title} ({item.lesson.targetLevel})
                  </option>
                ))}
              </select>
            </div>

            {/* 辅助工具栏：音色性别 + 语速 + 假名显示 + 纯盲听遮罩 */}
            <div className="flex items-center gap-2">
              {/* 发音音色快速切换 */}
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setGender(gender === 'FEMALE' ? 'MALE' : 'FEMALE');
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-300/80 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-[11px] font-semibold hover:bg-amber-500/15 transition-all cursor-pointer"
                title="一键切换自然男女声音色"
              >
                <span>{gender === 'FEMALE' ? '👩 女声' : '👨 男声'}</span>
              </button>

              {/* 语速调节 */}
              <div className="flex items-center gap-1 bg-stone-200/60 dark:bg-stone-800 p-1 rounded-lg">
                {[0.75, 1.0, 1.25].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      setRate(spd);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-all ${
                      Math.abs(rate - spd) < 0.05
                        ? 'bg-amber-500 text-stone-950 shadow-xs'
                        : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* 假名标注开关 */}
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setShowFurigana(!showFurigana);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                  showFurigana
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-300'
                    : 'border-stone-300 dark:border-stone-700 text-stone-500'
                }`}
              >
                {showFurigana ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{showFurigana ? '注音: 开' : '注音: 关'}</span>
              </button>

              {/* 盲听遮罩开关 */}
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setMaskText(!maskText);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                  maskText
                    ? 'border-purple-500/30 bg-purple-500/10 text-purple-900 dark:text-purple-300'
                    : 'border-stone-300 dark:border-stone-700 text-stone-500'
                }`}
              >
                <span>{maskText ? '🙈 盲听中' : '👀 看原文'}</span>
              </button>
            </div>
          </div>

          {/* 句子精听与跟读主展示卡片 */}
          {activeSentence ? (
            <motion.div
              key={activeSentence.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-6 sm:p-8 rounded-2xl bg-[#faf9f6] dark:bg-[#1a1816] border border-amber-900/10 dark:border-amber-500/15 shadow-sm space-y-6 relative overflow-hidden"
            >
              {/* 顶部说话者与进度 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-300 font-bold flex items-center justify-center text-xs">
                    {activeSentence.speaker}
                  </span>
                  <div>
                    <span className="font-semibold text-xs text-stone-800 dark:text-stone-200">
                      说话者：{activeSentence.speaker}
                    </span>
                    <span className="text-[11px] text-stone-400 ml-2">
                      句段 {sentenceIndex + 1} / {activeLesson.dialogues.length}
                    </span>
                  </div>
                </div>

                {/* 影子跟读节拍状态条 */}
                <div className="flex items-center gap-2">
                  {shadowStep === 'LISTENING' && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500 text-stone-950 animate-pulse flex items-center gap-1">
                      <Volume2 className="w-3.5 h-3.5" />
                      正在聆听原声 ({rate}x)
                    </span>
                  )}
                  {shadowStep === 'SHADOWING' && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500 text-white animate-bounce flex items-center gap-1">
                      <Mic className="w-3.5 h-3.5" />
                      🎙️ 影子跟读时刻！请大声复述
                    </span>
                  )}
                  {shadowStep === 'IDLE' && (
                    <span className="text-xs text-stone-400">就绪 · 点击播放开始</span>
                  )}
                </div>
              </div>

              {/* 动态波形可视化柱条 (音频播放时产生呼吸震荡) */}
              <div className="flex items-center justify-center gap-1.5 h-8 py-1">
                {[12, 24, 18, 28, 14, 20, 26, 16, 22, 10, 25, 15, 30, 18, 12].map((baseH, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      height: isSpeaking ? [baseH * 0.4, baseH * 1.2, baseH * 0.6] : 4,
                      backgroundColor: isSpeaking ? '#f59e0b' : '#d6d3d1',
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.5 + (i % 4) * 0.15,
                      ease: 'easeInOut',
                    }}
                    className="w-1.5 rounded-full dark:bg-stone-700"
                  />
                ))}
              </div>

              {/* 日语原句与假名标注区域 */}
              <div className="min-h-[90px] flex flex-col justify-center items-center text-center px-4">
                {maskText ? (
                  <div className="p-4 rounded-xl bg-stone-200/50 dark:bg-stone-900/50 text-stone-500 text-sm font-medium flex items-center gap-2">
                    <span>🙈 原文已遮罩，请先盲听 2~3 遍建立听觉反射，再揭晓文本</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 带假名的 Ruby 文本 */}
                    <div className="text-2xl sm:text-3xl font-serif text-stone-900 dark:text-stone-100 tracking-wider flex flex-wrap justify-center items-center gap-x-2 gap-y-1">
                      {activeSentence.furiganaTokens.map((token, idx) => {
                        if (showFurigana && token.reading) {
                          return (
                            <ruby key={idx} className="cursor-pointer hover:text-amber-600 transition-colors">
                              {token.surface}
                              <rt className="text-xs text-amber-700 dark:text-amber-400 font-sans select-none">
                                {token.reading}
                              </rt>
                            </ruby>
                          );
                        }
                        return (
                          <span key={idx} className="cursor-pointer hover:text-amber-600 transition-colors">
                            {token.surface}
                          </span>
                        );
                      })}
                      <UnifiedTtsPlayer
                        variant="inline"
                        text={activeSentence.japanese}
                        lang={currentLanguage}
                        className="ml-1"
                      />
                    </div>

                    {/* 中文翻译 */}
                    <p className="text-sm sm:text-base text-stone-500 dark:text-stone-400 font-serif">
                      {activeSentence.chinese}
                    </p>
                  </div>
                )}
              </div>

              {/* 语法要点提示 */}
              {activeSentence.grammarNotes && activeSentence.grammarNotes.length > 0 && !maskText && (
                <div className="p-3 rounded-xl bg-amber-500/10 dark:bg-stone-900/60 border border-amber-900/10 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold">句型语法考点：</span>
                    {activeSentence.grammarNotes.map((n, i) => (
                      <p key={i} className="text-stone-700 dark:text-stone-300">
                        • {n}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* 核心播放与切换控制器 */}
              <div className="flex items-center justify-between pt-2 border-t border-stone-200/80 dark:border-stone-800">
                {/* 循环跟读开关 */}
                <button
                  onClick={() => {
                    sound.playClick();
                    setIsLooping(!isLooping);
                  }}
                  className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                    isLooping
                      ? 'border-amber-500 bg-amber-500/20 text-amber-900 dark:text-amber-200'
                      : 'border-stone-300 dark:border-stone-700 text-stone-400'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>{isLooping ? '循环跟读: 开' : '单次播放'}</span>
                </button>

                {/* 播放 / 暂停大按钮群 */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePrevSentence}
                    className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-all cursor-pointer"
                    title="上一句"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <motion.button
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={handleTogglePlay}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold shadow-md transition-all cursor-pointer ${
                      isSpeaking
                        ? 'bg-amber-600 text-stone-950'
                        : 'bg-gradient-to-tr from-amber-500 to-amber-600 text-stone-950 hover:brightness-105'
                    }`}
                  >
                    {isSpeaking ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                  </motion.button>

                  <button
                    onClick={handleNextSentence}
                    className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-all cursor-pointer"
                    title="下一句"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* 向 AI 导师就此句追问 */}
                {onOpenTutor && (
                  <button
                    onClick={() => {
                      sound.playClick();
                      onOpenTutor({
                        questionText: `请针对听力短句进行剖析：「${activeSentence.japanese}」（${activeSentence.chinese}）`,
                        userAnswer: undefined,
                        correctAnswer: activeSentence.japanese,
                        skillTag: activeSentence.grammarNotes?.[0] ?? '听力短句口语辨析',
                        explanation: '句子包含假名读音标注与格助词接续规则',
                      });
                    }}
                    className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-semibold hover:underline"
                  >
                    <Bot className="w-4 h-4" />
                    <span>AI 深度追问</span>
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="p-8 text-center text-stone-400">本课暂无对话短句</div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 模式二：考点挖词精听听写挑战 (DICTATION)                                    */}
      {/* ========================================================================= */}
      {activeSubMode === 'DICTATION' && (
        <div className="flex flex-col gap-5">
          <motion.div
            key={activeDictation.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 sm:p-8 rounded-2xl bg-[#faf9f6] dark:bg-[#1a1816] border border-amber-900/10 dark:border-amber-500/15 shadow-sm space-y-6"
          >
            {/* 顶栏信息 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                  {activeDictation.categoryTag}
                </span>
                <span className="text-xs text-stone-500">
                  第 {dictationIndex + 1} 题 / 共 {DICTATION_CHALLENGES.length} 题
                </span>
              </div>

              {/* 播放原声语音按钮 (统一 TTS 组件) */}
              <UnifiedTtsPlayer
                variant="button"
                text={activeDictation.fullJapanese}
                lang="JA"
                label="播报录音原声"
              />
            </div>

            {/* 听力挖空展示 */}
            <div className="space-y-3 text-center py-4 bg-[#fdfcfb] dark:bg-[#181615] rounded-xl border border-amber-900/5 p-4">
              <p className="text-xs text-stone-500 font-medium">{activeDictation.blankPrompt}</p>
              <h3 className="text-2xl sm:text-3xl font-bold font-serif text-stone-900 dark:text-stone-100 tracking-wide">
                {activeDictation.clozeDisplay}
              </h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 font-serif">
                中文释义：{activeDictation.chinese}
              </p>
            </div>

            {/* 听写输入框 */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCheckDictation();
                  }}
                  disabled={hasChecked && isDictationCorrect === true}
                  placeholder="听录音后在此键入所缺假名（如：で / に / か）..."
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#211f1d] border border-amber-900/20 dark:border-amber-500/20 text-stone-900 dark:text-stone-100 text-base font-medium outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                />
                <span className="absolute right-3 top-3.5 text-xs text-stone-400 font-mono">
                  按 Enter 提交
                </span>
              </div>

              {!hasChecked ? (
                <button
                  onClick={handleCheckDictation}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 text-stone-950 font-bold text-sm hover:brightness-105 transition-all shadow-xs cursor-pointer shrink-0"
                >
                  🚀 验证听写
                </button>
              ) : (
                <button
                  onClick={handleNextDictation}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-stone-900 dark:bg-amber-600 text-white font-bold text-sm hover:brightness-110 transition-all shadow-xs cursor-pointer shrink-0"
                >
                  下一题 ➔
                </button>
              )}
            </div>

            {/* 听写核对反馈区 */}
            {hasChecked && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  isDictationCorrect
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  {isDictationCorrect ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>听写敏锐！答案完全一致（「{activeDictation.targetWord}」）</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-rose-600" />
                      <span>
                        听写有误：正确应为「{activeDictation.targetWord}」(读音: {activeDictation.furiganaHint})，已自动录入错题本
                      </span>
                    </>
                  )}
                </div>
                <p className="text-stone-700 dark:text-stone-300 leading-relaxed font-sans">
                  💡 {activeDictation.grammarExplanation}
                </p>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
};
