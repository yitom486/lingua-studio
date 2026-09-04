import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  ChevronRight,
  Layers,
  Sparkles,
  Volume2,
  BookmarkPlus,
  BookmarkCheck,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  HelpCircle,
  Award,
  Zap,
  Plus,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  TEXTBOOK_BOOKS,
  type TextbookBook,
  type TextbookLesson,
  type FuriganaWord,
  type TextbookVocabulary,
} from '../data/textbook-data.js';
import { sound } from '../utils/audio.js';
import { ShimmerButton } from './magicui/index.js';
import { InteractivePdfReader } from './InteractivePdfReader.js';
import { TextbookImporterModal } from './TextbookImporterModal.js';

interface TextbookCurriculumProps {
  onStartLessonQuiz: (lessonId: string, lessonTitle: string) => void;
  onAddCardFromTextbook: (vocab: { front: string; back: string; category: string; prompt: string }) => void;
  onAddCardsBatch?: (cards: { front: string; back: string; category: string; prompt: string }[]) => void;
  onAskAiTutor?: (selectedText: string, contextPrompt: string) => void;
}

export function TextbookCurriculum({
  onStartLessonQuiz,
  onAddCardFromTextbook,
  onAddCardsBatch,
  onAskAiTutor,
}: TextbookCurriculumProps) {
  const [booksList, setBooksList] = useState<TextbookBook[]>(TEXTBOOK_BOOKS);
  const [selectedBookId, setSelectedBookId] = useState<string>(TEXTBOOK_BOOKS[0]!.id);
  const [selectedLessonId, setSelectedLessonId] = useState<string>(TEXTBOOK_BOOKS[0]!.lessons[0]!.id);
  const [lessonSubTab, setLessonSubTab] = useState<'READER' | 'VOCAB' | 'GRAMMAR'>('READER');
  const [activeWordCard, setActiveWordCard] = useState<FuriganaWord | null>(null);
  const [addedCardsMap, setAddedCardsMap] = useState<Record<string, boolean>>({});
  const [isImporterOpen, setIsImporterOpen] = useState<boolean>(false);
  const [languageFilter, setLanguageFilter] = useState<'ALL' | 'JA' | 'EN' | 'KO'>('ALL');

  const filteredBooks = booksList.filter((b) => {
    if (languageFilter === 'ALL') return true;
    return (b.language || 'JA') === languageFilter;
  });

  const currentBook = booksList.find((b) => b.id === selectedBookId) ?? filteredBooks[0] ?? booksList[0]!;
  const currentLesson = currentBook.lessons.find((l) => l.id === selectedLessonId) ?? currentBook.lessons[0]!;



  const handleWordClick = (word: FuriganaWord) => {
    sound.playClick();
    setActiveWordCard(word);
  };

  const handleAddCard = (word: FuriganaWord | TextbookVocabulary) => {
    sound.playCorrect();
    const isVocab = 'kanji' in word;
    const frontText = isVocab ? `${word.kanji} (${word.kana})` : `${word.surface} ${word.reading ? `(${word.reading})` : ''}`;
    const backText = isVocab ? `${word.chinese} [${word.pos} · ${word.pitchAccent}]` : `${word.meaning ?? ''} [${word.pos ?? ''}]`;
    const cardKey = isVocab ? word.id : word.surface;

    onAddCardFromTextbook({
      front: frontText,
      back: backText,
      category: 'VOCAB',
      prompt: `来自《${currentBook.shortTitle}》${currentLesson.title}`,
    });

    setAddedCardsMap((prev) => ({ ...prev, [cardKey]: true }));
    toast.success(`已加入 FSRS 记忆闪卡：${frontText}`);
  };

  return (
    <div className="space-y-6">
      {/* 顶部教材选择器与信息栏 */}
      <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-4 sm:p-6 border border-amber-900/10 dark:border-amber-500/15 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300">
                {currentBook.level}
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {currentBook.publisher} · 共 {currentBook.totalLessons} 课
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-stone-900 dark:text-stone-100 mt-1">
              {currentBook.title}
            </h2>
          </div>

          {/* 语种筛选与教材快速切换 Tab 与导入入口 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 语种过滤器 */}
            <div className="flex items-center gap-1 p-1 bg-stone-200/60 dark:bg-stone-900 rounded-xl">
              {[
                { id: 'ALL', label: '全部' },
                { id: 'JA', label: '🇯🇵 日语' },
                { id: 'EN', label: '🇬🇧 英语' },
                { id: 'KO', label: '🇰🇷 韩语' },
              ].map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => {
                    sound.playClick();
                    const nextFilter = lang.id as 'ALL' | 'JA' | 'EN' | 'KO';
                    setLanguageFilter(nextFilter);
                    const match = booksList.find(
                      (b) => nextFilter === 'ALL' || (b.language || 'JA') === nextFilter
                    );
                    if (match) {
                      setSelectedBookId(match.id);
                      setSelectedLessonId(match.lessons[0]!.id);
                    }
                  }}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                    languageFilter === lang.id
                      ? 'bg-amber-500 text-stone-950 shadow-2xs font-bold'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            {/* 匹配的书籍列表 */}
            <div className="flex items-center gap-1.5 p-1 bg-stone-200/60 dark:bg-stone-900 rounded-xl">
              {filteredBooks.map((book) => (
                <button
                  key={book.id}
                  onClick={() => {
                    sound.playClick();
                    setSelectedBookId(book.id);
                    setSelectedLessonId(book.lessons[0]!.id);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    book.id === selectedBookId
                      ? 'bg-[#faf9f6] dark:bg-amber-600 text-stone-900 dark:text-white shadow-sm font-semibold'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  {book.language === 'EN' ? '🇬🇧 ' : book.language === 'KO' ? '🇰🇷 ' : '🇯🇵 '}
                  {book.shortTitle}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                sound.playClick();
                setIsImporterOpen(true);
              }}
              className="px-3 py-2 text-xs font-semibold rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 transition-colors flex items-center gap-1.5 border border-amber-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>导入新教材</span>
            </button>
          </div>
        </div>
      </div>



      {/* 主体两栏布局：左侧课次导航树，右侧课文精读/词汇/文法工作台 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧：课次列表 */}
        <div className="lg:col-span-4 space-y-2">
          <div className="flex items-center justify-between px-1 mb-2">
            <h3 className="text-sm font-bold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              课程大纲结构 (Textbook AST)
            </h3>
            <span className="text-xs text-stone-400 dark:text-stone-500">
              {currentBook.lessons.length} 个单元
            </span>
          </div>

          <div className="space-y-2">
            {currentBook.lessons.map((lesson) => {
              const isSelected = lesson.id === selectedLessonId;
              return (
                <button
                  key={lesson.id}
                  onClick={() => {
                    sound.playClick();
                    setSelectedLessonId(lesson.id);
                    setActiveWordCard(null);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl transition-all border ${
                    isSelected
                      ? 'bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/40 shadow-sm'
                      : 'bg-[#faf9f6] dark:bg-[#1a1816] border-amber-900/10 dark:border-amber-500/10 hover:border-amber-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold">
                        Lesson {lesson.lessonNumber}
                      </span>
                      <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-1">
                        {lesson.title}
                      </h4>
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                        {lesson.subTitle}
                      </p>
                    </div>
                    {isSelected && (
                      <ChevronRight className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-1" />
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-2 text-[11px] text-stone-400 dark:text-stone-500">
                    <span>词汇: {lesson.vocabularies.length}</span>
                    <span>文法: {lesson.grammarPoints.length}</span>
                    <span>会话: {lesson.dialogues.length}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 右侧：课文精读 / 词汇 / 文法 / 专属测验 */}
        <div className="lg:col-span-8 space-y-4">
          {/* 课次标题与快速靶向测验启动栏 */}
          <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-5 border border-amber-900/10 dark:border-amber-500/15 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
                    场景：{currentLesson.scene}
                  </span>
                  <span className="text-xs text-stone-400">•</span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    等级：{currentLesson.targetLevel}
                  </span>
                </div>
                <h3 className="text-xl font-bold font-serif text-stone-900 dark:text-stone-100 mt-1">
                  {currentLesson.title}
                </h3>
              </div>

              {/* 针对本课出题按钮 */}
              <ShimmerButton
                onClick={() => {
                  sound.playClick();
                  onStartLessonQuiz(currentLesson.id, currentLesson.title);
                }}
                className="px-4 py-2 text-xs font-semibold flex items-center gap-2 shadow-md shrink-0"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>启动本课专属自测 (AI 出题)</span>
              </ShimmerButton>
            </div>

            {/* 子选项卡：交互精读与原版排版 | 核心词汇 | 核心语法 */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-amber-900/10 dark:border-amber-500/10">
              <button
                onClick={() => {
                  sound.playClick();
                  setLessonSubTab('READER');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  lessonSubTab === 'READER'
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800'
                }`}
              >
                📖 交互精读与排版 ({currentLesson.dialogues.length})
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  setLessonSubTab('VOCAB');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  lessonSubTab === 'VOCAB'
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800'
                }`}
              >
                📚 重点词汇库 ({currentLesson.vocabularies.length})
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  setLessonSubTab('GRAMMAR');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  lessonSubTab === 'GRAMMAR'
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800'
                }`}
              >
                💡 核心文法剖析 ({currentLesson.grammarPoints.length})
              </button>
            </div>
          </div>
          {/* 子内容 1: 交互式阅读器 (双模式：原版双栏排版 + 划词查词 + 闪卡 + AI 导师) */}
          {lessonSubTab === 'READER' && (
            <InteractivePdfReader
              book={currentBook}
              lesson={currentLesson}
              onAddCard={onAddCardFromTextbook}
              onStartLessonQuiz={onStartLessonQuiz}
              onAskAiTutor={onAskAiTutor ?? (() => {})}
            />
          )}


          {/* 子内容 2: 重点词汇库 */}
          {lessonSubTab === 'VOCAB' && (
            <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-5 border border-amber-900/10 dark:border-amber-500/15 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentLesson.vocabularies.map((vocab) => {
                  const isAdded = addedCardsMap[vocab.id];
                  return (
                    <div
                      key={vocab.id}
                      className="p-3.5 rounded-xl bg-stone-100/70 dark:bg-stone-900/50 border border-stone-200/80 dark:border-stone-800 flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-bold text-stone-900 dark:text-stone-100">
                              {vocab.kanji}
                            </span>
                            <span className="text-xs text-amber-700 dark:text-amber-400 font-mono">
                              {vocab.kana}
                            </span>
                          </div>
                          <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 font-serif">
                            {vocab.chinese}
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-500 font-mono">
                            {vocab.pitchAccent} {vocab.pitchType}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-stone-500 dark:text-stone-400 bg-stone-200/50 dark:bg-stone-800/40 p-2 rounded-lg">
                        <p className="font-medium text-stone-700 dark:text-stone-300">{vocab.exampleSentence}</p>
                        <p className="text-stone-500">{vocab.exampleTranslation}</p>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleAddCard(vocab)}
                          disabled={isAdded}
                          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all ${
                            isAdded
                              ? 'text-stone-400 dark:text-stone-500 bg-stone-200/50 dark:bg-stone-800 cursor-not-allowed'
                              : 'text-amber-800 dark:text-amber-300 hover:bg-amber-500/20'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <BookmarkCheck className="w-3.5 h-3.5" />
                              <span>已加入复习</span>
                            </>
                          ) : (
                            <>
                              <BookmarkPlus className="w-3.5 h-3.5" />
                              <span>加为 FSRS 闪卡</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 子内容 3: 核心文法剖析 */}
          {lessonSubTab === 'GRAMMAR' && (
            <div className="space-y-4">
              {currentLesson.grammarPoints.map((gp) => (
                <div
                  key={gp.id}
                  className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-5 border border-amber-900/10 dark:border-amber-500/15 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <h4 className="text-base font-bold text-stone-900 dark:text-stone-100 font-serif">
                      {gp.title}
                    </h4>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold font-mono">
                      {gp.structure}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                    {gp.explanation}
                  </p>

                  {gp.contrast && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 text-xs text-amber-950 dark:text-amber-200">
                      💡 <span className="font-semibold">辨析要点：</span>{gp.contrast}
                    </div>
                  )}

                  <div className="space-y-1.5 pt-2">
                    <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">典型用例：</p>
                    {gp.examples.map((ex, exIdx) => (
                      <div
                        key={exIdx}
                        className="p-2.5 rounded-lg bg-stone-100/80 dark:bg-stone-900/60 text-xs space-y-0.5"
                      >
                        <p className="font-medium text-stone-900 dark:text-stone-100">{ex.ja}</p>
                        <p className="text-stone-500 dark:text-stone-400 font-serif">{ex.zh}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 导入教材模态框 */}
      <TextbookImporterModal
        isOpen={isImporterOpen}
        onClose={() => setIsImporterOpen(false)}
        onImportBook={(newBook, _cardsCount) => {
          setBooksList((prev) => [newBook, ...prev]);
          setSelectedBookId(newBook.id);
          setSelectedLessonId(newBook.lessons[0]!.id);
        }}
        onAddCardsBatch={(cards) => {
          if (onAddCardsBatch) {
            onAddCardsBatch(cards);
          } else {
            cards.forEach((c) => onAddCardFromTextbook(c));
          }
        }}
      />
    </div>
  );
}

