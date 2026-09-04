import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  FileText,
  Volume2,
  Sparkles,
  BookmarkPlus,
  Layers,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  CheckCircle2,
  HelpCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { sound, speechStudio } from '../utils/audio.js';
import { UnifiedTtsPlayer } from './UnifiedTtsPlayer.js';
import type { TextbookBook, TextbookLesson, TextbookVocabulary, FuriganaWord } from '../data/textbook-data.js';
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from './ui/tabs.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';


interface InteractivePdfReaderProps {
  book: TextbookBook;
  lesson: TextbookLesson;
  onAddCard: (card: { front: string; back: string; category: string; prompt: string }) => void;
  onStartLessonQuiz: (lessonId: string, lessonTitle: string) => void;
  onAskAiTutor: (selectedText: string, contextPrompt: string) => void;
}

export function InteractivePdfReader({
  book,
  lesson,
  onAddCard,
  onStartLessonQuiz,
  onAskAiTutor,
}: InteractivePdfReaderProps) {
  const [viewMode, setViewMode] = useState<'STRUCTURED' | 'PDF_PAGE'>('PDF_PAGE');
  const [showChineseTranslation, setShowChineseTranslation] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const totalPages = 3;

  // 划词浮动选区状态
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionPopupPosition, setSelectionPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [activeWordDetail, setActiveWordDetail] = useState<{
    word: string;
    reading?: string;
    meaning?: string;
    pos?: string;
    pitch?: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // 处理文本划选
  const handleMouseUp = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0) {
      setSelectedText(text);
      setSelectionPopupPosition({
        x: Math.min(Math.max(e.clientX - 100, 20), window.innerWidth - 300),
        y: e.clientY - 60,
      });

      // 自动尝试在生词表中比对
      const matchedVocab = lesson.vocabularies.find(
        (v) => text.includes(v.kanji) || text.includes(v.kana)
      );
      if (matchedVocab) {
        setActiveWordDetail({
          word: matchedVocab.kanji,
          reading: matchedVocab.kana,
          meaning: matchedVocab.chinese,
          pos: matchedVocab.pos,
          pitch: matchedVocab.pitchAccent,
        });
      } else {
        setActiveWordDetail({
          word: text,
          reading: '句段 / 词汇',
          meaning: '可直接唤起 AI 导师深度剖析语法结构与接续',
        });
      }
    } else {
      // 延迟清除，以免点击浮窗内的按钮被取消
      setTimeout(() => {
        if (!window.getSelection()?.toString().trim()) {
          setSelectionPopupPosition(null);
        }
      }, 150);
    }
  };

  const handleSpeak = (text: string) => {
    sound.playClick();
    speechStudio.speak(text, { lang: book.language || 'JA' });
  };

  const handleAddSelectedToCards = () => {
    sound.playCorrect();
    onAddCard({
      front: activeWordDetail?.reading ? `${activeWordDetail.word} (${activeWordDetail.reading})` : selectedText,
      back: activeWordDetail?.meaning || `来自《${book.shortTitle}》${lesson.title}`,
      category: 'VOCAB',
      prompt: `教材划词摘录: 《${book.shortTitle}》${lesson.title}`,
    });
    toast.success(`已加入 FSRS 闪卡：${selectedText}`);
    setSelectionPopupPosition(null);
  };

  const handleAskTutorForSelection = () => {
    sound.playClick();
    const isEn = book.language === 'EN';
    onAskAiTutor(
      selectedText,
      isEn
        ? `在《${book.title}》${lesson.title} 的英文课文语境中，请深度剖析这段英语的句式结构、时态/从句成分以及中式英语(Chinglish)常见易错点：`
        : `在《${book.title}》${lesson.title} 的课文语境中，请深度剖析这段日文的语法成分、敬体/简体用法以及母语者语感：`
    );
    setSelectionPopupPosition(null);
    toast.info(`已将选句提交给 AI 导师进行深度解析`);
  };


  return (
    <div className="space-y-4">
      {/* 顶部阅读器控制条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#faf9f6] dark:bg-[#1a1816] border border-amber-900/10 dark:border-amber-500/15 shadow-sm">
        {/* 模式切换 */}
        <Tabs
          value={viewMode}
          onValueChange={(val) => {
            if (!val) return;
            sound.playClick();
            setViewMode(val as 'STRUCTURED' | 'PDF_PAGE');
          }}
        >
          <TabsList className="bg-stone-200/70 dark:bg-stone-800/80">
            <TabsIndicator />
            <TabsTrigger value="PDF_PAGE" className="px-3 py-1.5 text-xs gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              原版教材排版精读
            </TabsTrigger>
            <TabsTrigger value="STRUCTURED" className="px-3 py-1.5 text-xs gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              结构分解导读
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 快捷工具 */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              sound.playClick();
              setShowChineseTranslation(!showChineseTranslation);
            }}
            className="gap-1.5"
          >
            {showChineseTranslation ? (
              <>
                <Eye className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>中文对照: 开启</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-stone-400" />
                <span>中文对照: 隐藏</span>
              </>
            )}
          </Button>

          {viewMode === 'PDF_PAGE' && (
            <div className="flex items-center gap-1 border border-stone-200 dark:border-stone-800 rounded-xl px-1 py-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoomLevel((z) => Math.max(z - 10, 80))}
                className="h-7 w-7 text-stone-500"
                title="缩小"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <span className="text-[11px] font-mono font-semibold px-1 text-stone-600 dark:text-stone-300">
                {zoomLevel}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoomLevel((z) => Math.min(z + 10, 130))}
                className="h-7 w-7 text-stone-500"
                title="放大"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          <Button
            variant="amber"
            size="sm"
            onClick={() => {
              sound.playClick();
              onStartLessonQuiz(lesson.id, lesson.title);
            }}
            className="gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            练习本课测验
          </Button>
        </div>
      </div>

      {/* 核心阅读视口容器 */}
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="relative min-h-[600px] p-6 sm:p-10 rounded-3xl bg-white dark:bg-[#181614] border border-amber-900/10 dark:border-amber-500/15 shadow-sm overflow-hidden select-text"
        style={{ fontSize: `${(zoomLevel / 100) * 16}px` }}
      >
        {viewMode === 'PDF_PAGE' ? (
          /* 仿真原版双栏教材排版 */
          <div className="max-w-4xl mx-auto space-y-8">
            {/* 顶栏教材标识 */}
            <div className="flex items-center justify-between border-b-2 border-stone-800 dark:border-stone-300 pb-3">
              <div className="flex items-center gap-3">
                <Badge className="rounded-md bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-transparent hover:bg-stone-900">
                  {book.shortTitle}
                </Badge>
                <span className="font-bold text-sm tracking-wider text-stone-800 dark:text-stone-200">
                  {lesson.title}
                </span>
              </div>
              <span className="text-xs font-mono text-stone-400">
                PAGE {currentPage} / {totalPages}
              </span>
            </div>

            {/* 课文主对话区 */}
            <div className="space-y-4">
              <div className="inline-block px-3 py-1 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-bold mb-2">
                {book.language === 'EN' ? '【Dialogue · 课文会话】' : '【基本会话 · 基本会話】'}
              </div>
              <div className="space-y-4 leading-relaxed font-serif">
                {lesson.dialogues.map((dlg) => (
                  <div
                    key={dlg.id}
                    className="p-3.5 rounded-xl hover:bg-amber-500/5 transition-colors border-l-2 border-transparent hover:border-amber-500/40"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0 font-sans text-xs px-2 py-0.5 rounded-md bg-amber-500/10">
                        {dlg.speaker}
                      </span>
                      <div className="flex-1 space-y-1">
                        <div className="text-stone-900 dark:text-stone-100 text-base flex flex-wrap items-center gap-x-2">
                          <span>{dlg.japanese}</span>
                          <UnifiedTtsPlayer
                            variant="inline"
                            text={dlg.japanese}
                            lang={book.language || 'JA'}
                          />
                        </div>
                        {showChineseTranslation && (
                          <div className="text-xs text-stone-500 dark:text-stone-400 font-sans">
                            {dlg.chinese}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 双栏底注与语法句型 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-stone-200 dark:border-stone-800">
              {/* 左栏: 核心语法句型 */}
              <div className="space-y-4">
                <div className="font-bold text-xs text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                  {book.language === 'EN' ? '【Core Grammar · 核心语法】' : '【重要文法 · 文法ノート】'}
                </div>
                <div className="space-y-3">
                  {lesson.grammarPoints.map((gp) => (
                    <div
                      key={gp.id}
                      className="p-3 rounded-xl bg-stone-50 dark:bg-[#201d19] border border-stone-200 dark:border-stone-800/80 space-y-1.5"
                    >
                      <div className="text-xs font-bold text-amber-700 dark:text-amber-400">
                        {gp.title}
                      </div>
                      <div className="text-[11px] font-mono text-stone-600 dark:text-stone-300">
                        接续: {gp.structure}
                      </div>
                      <p className="text-xs text-stone-500 dark:text-stone-400 leading-normal">
                        {gp.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 右栏: 本课生词表 */}
              <div className="space-y-4">
                <div className="font-bold text-xs text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  {book.language === 'EN' ? '【Vocabulary · 重点词汇】' : '【新出単語 · 生词表】'}
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {lesson.vocabularies.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-stone-50 dark:bg-[#201d19] text-xs hover:bg-amber-500/10 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {v.kanji}
                        </span>
                        <span className="text-[11px] text-stone-400">({v.kana})</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                          {v.pos}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-stone-600 dark:text-stone-400">{v.chinese}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleAddSelectedToCards()}
                          className="h-7 w-7 text-stone-400 hover:text-amber-600"
                          title="加入闪卡"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* 结构分解排版模式 */
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-900/10 dark:border-amber-500/20">
              <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-1">
                {lesson.subTitle}
              </h4>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                本模式对长课文进行段落与语义分块，支持单句反复回放与语法点对齐。
              </p>
            </div>

            <div className="space-y-6">
              {lesson.dialogues.map((dlg, idx) => (
                <div
                  key={dlg.id}
                  className="p-5 rounded-2xl bg-stone-50 dark:bg-[#1e1c19] border border-stone-200 dark:border-stone-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-600 text-white">
                      第 {idx + 1} 句 · {dlg.speaker}
                    </span>
                    <UnifiedTtsPlayer
                      variant="button"
                      text={dlg.japanese}
                      lang={book.language || 'JA'}
                      label="朗读"
                    />
                  </div>
                  <div className="text-lg font-serif text-stone-900 dark:text-stone-100">
                    {dlg.japanese}
                  </div>
                  {showChineseTranslation && (
                    <div className="text-sm text-stone-500 dark:text-stone-400 border-t border-stone-200 dark:border-stone-800/80 pt-2">
                      {dlg.chinese}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 划词划句浮动操作卡片 */}
        <AnimatePresence>
          {selectionPopupPosition && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 5 }}
              style={{
                position: 'fixed',
                left: selectionPopupPosition.x,
                top: selectionPopupPosition.y,
              }}
              className="z-50 p-3 rounded-2xl bg-[#1c1a17] text-white shadow-2xl border border-amber-500/30 flex flex-col gap-2 min-w-[240px] max-w-[320px]"
            >
              {/* 词义预览 */}
              {activeWordDetail && (
                <div className="space-y-0.5 border-b border-stone-700 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-400 text-xs flex items-center gap-1">
                      {activeWordDetail.word}
                      <UnifiedTtsPlayer
                        variant="inline"
                        text={activeWordDetail.word}
                        lang={book.language || 'JA'}
                      />
                    </span>
                    {activeWordDetail.reading && (
                      <span className="text-[10px] text-stone-400">
                        {activeWordDetail.reading}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-300 line-clamp-2">
                    {activeWordDetail.meaning}
                  </p>
                </div>
              )}

              {/* 操作按钮流 */}
              <div className="flex items-center gap-1.5 pt-1">
                <Button
                  onClick={handleAddSelectedToCards}
                  size="sm"
                  className="flex-1 h-8 gap-1 bg-amber-600 hover:bg-amber-700 text-[11px] text-white"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  转为闪卡
                </Button>
                <Button
                  onClick={handleAskTutorForSelection}
                  size="sm"
                  variant="secondary"
                  className="flex-1 h-8 gap-1 bg-stone-800 hover:bg-stone-700 text-[11px] text-amber-300"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI 导师深度点拨
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 底部页码控制 (PDF 模式) */}
      {viewMode === 'PDF_PAGE' && (
        <div className="flex items-center justify-center gap-4 py-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-mono font-semibold text-stone-600 dark:text-stone-400">
            第 {currentPage} 页 / 共 {totalPages} 页
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
