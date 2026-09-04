import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  X,
  BookOpen,
  Layers,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseTextbookAST, type TextbookAST } from '@study-studio/protocol';
import { sound } from '../utils/audio.js';
import { ShimmerButton } from './magicui/index.js';
import type { TextbookBook, FuriganaWord } from '../data/textbook-data.js';


interface TextbookImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportBook: (importedBook: TextbookBook, generatedCardsCount: number) => void;
  onAddCardsBatch: (cards: { front: string; back: string; category: string; prompt: string }[]) => void;
}

const SAMPLE_TEXTBOOK_JSON: TextbookAST = {
  id: 'shinpen-nihongo-1',
  title: '新编日语 第一册 (精编重排版)',
  shortTitle: '新编日语1',
  level: 'JLPT N5',
  publisher: '上海外语教育出版社',
  description: '经典大学日语专业教材，注重句型操练与系统语法推导。',
  totalLessons: 1,
  lessons: [
    {
      id: 'shinpen-l1',
      lessonNumber: 1,
      title: '第1課 五十音図と挨拶 (五十音与日常问候)',
      summary: '五十音假名认读、声调特征与初次寒暄问候。',
      vocabularies: [
        {
          id: 'shinpen-v1',
          kanji: 'おはようございます',
          kana: 'おはようございます',
          pos: '寒暄语',
          pitchAccent: '④',
          chinese: '早上好（敬体）',
          example: {
            japanese: '先生、おはようございます。',
            chinese: '老师，早上好。',
          },
        },
        {
          id: 'shinpen-v2',
          kanji: '失礼します',
          kana: 'しつれいします',
          pos: '动词/寒暄语',
          pitchAccent: '②',
          chinese: '打扰了；告辞',
          example: {
            japanese: 'それでは、失礼します。',
            chinese: '那么，我先告辞了。',
          },
        },
        {
          id: 'shinpen-v3',
          kanji: 'どうぞ',
          kana: 'どうぞ',
          pos: '副词',
          pitchAccent: '①',
          chinese: '请；请便',
          example: {
            japanese: 'こちらへどうぞ。',
            chinese: '请往这边走。',
          },
        },
      ],
      grammarPoints: [
        {
          id: 'shinpen-g1',
          title: '～は～です (判断句的基准形态)',
          connection: '名词 + は + 名词 + です',
          explanation: '用于明确主语主题并对身份、国籍、属性做出肯定判断。',
          examples: [
            {
              japanese: '王さんは留学生です。',
              chinese: '小王是留学生。',
            },
          ],
        },
      ],
      dialogues: [
        {
          speaker: '王',
          japanese: '田中先生、おはようございます。',
          chinese: '田中老师，早上好。',
        },
        {
          speaker: '田中',
          japanese: '王さん、おはようございます。どうぞ入ってください。',
          chinese: '小王，早上好。请进吧。',
        },
      ],
      exercises: [
        {
          id: 'shinpen-ex1',
          type: 'CHOICE',
          prompt: '早晨向长辈或老师问好时，最得体的表达是？',
          options: ['おはよう', 'おはようございます', 'こんばんは', 'さようなら'],
          answer: 'おはようございます',
          explanation: '面对长辈应使用包含「ございます」的完整敬体。',
        },
      ],
    },
  ],
};

export function TextbookImporterModal({
  isOpen,
  onClose,
  onImportBook,
  onAddCardsBatch,
}: TextbookImporterModalProps) {
  const [inputText, setInputText] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedAST, setParsedAST] = useState<TextbookAST | null>(null);
  const [autoGenerateCards, setAutoGenerateCards] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleLoadSample = () => {
    sound.playClick();
    const formatted = JSON.stringify(SAMPLE_TEXTBOOK_JSON, null, 2);
    setInputText(formatted);
    setParseError(null);
    setParsedAST(SAMPLE_TEXTBOOK_JSON);
    toast.info('已载入《新编日语 第一册》结构化样例模版');
  };

  const handleDownloadTemplate = () => {
    sound.playClick();
    const blob = new Blob([JSON.stringify(SAMPLE_TEXTBOOK_JSON, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'study-studio-textbook-template.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('已下载教材 AST 模版文件');
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);
    if (!text.trim()) {
      setParseError(null);
      setParsedAST(null);
      return;
    }

    try {
      const raw = JSON.parse(text);
      const res = parseTextbookAST(raw);
      if (res.ok) {
        setParseError(null);
        setParsedAST(res.value);
      } else {
        setParseError(res.error.userMessage);
        setParsedAST(null);
      }
    } catch {
      setParseError('JSON 语法错误，请检查括号与双引号格式');
      setParsedAST(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setInputText(content);
      try {
        const raw = JSON.parse(content);
        const res = parseTextbookAST(raw);
        if (res.ok) {
          setParseError(null);
          setParsedAST(res.value);
          sound.playCorrect();
          toast.success(`成功载入教材文档: 《${res.value.title}》`);
        } else {
          setParseError(res.error.userMessage);
          setParsedAST(null);
          sound.playMistake();
        }
      } catch {
        setParseError('读取的文件并非标准 JSON 格式，请检查');
        setParsedAST(null);
        sound.playMistake();
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (!parsedAST) return;

    sound.playCorrect();

    // 转化为客户端 TextbookBook 格式
    const convertedBook: TextbookBook = {
      id: parsedAST.id,
      title: parsedAST.title,
      shortTitle: parsedAST.shortTitle,
      publisher: parsedAST.publisher || '自定义导入',
      totalLessons: parsedAST.lessons.length,
      level: parsedAST.level,
      lessons: parsedAST.lessons.map((l) => ({
        id: l.id,
        bookId: parsedAST.id,
        lessonNumber: l.lessonNumber,
        title: l.title,
        subTitle: l.summary || l.title,
        targetLevel: parsedAST.level,
        scene: '课文解析与句型操练',
        associatedQuizTag: `custom.${parsedAST.id}.${l.id}`,
        dialogues: l.dialogues.map((d, idx) => ({
          id: `dlg-${l.id}-${idx}`,
          speaker: d.speaker,
          japanese: d.japanese,
          chinese: d.chinese,
          furiganaTokens: d.words
            ? d.words.map((w) => {
                const item: FuriganaWord = { surface: w.surface };
                if (w.reading) item.reading = w.reading;
                if (w.meaning) item.meaning = w.meaning;
                if (w.pos) item.pos = w.pos;
                return item;
              })
            : [{ surface: d.japanese }],
        })),
        vocabularies: l.vocabularies.map((v) => ({

          id: v.id,
          kanji: v.kanji,
          kana: v.kana,
          romaji: v.romaji || '',
          chinese: v.chinese,
          pos: v.pos,
          pitchAccent: v.pitchAccent,
          pitchType: v.pitchAccent.includes('⓪')
            ? '平板型'
            : v.pitchAccent.includes('①')
              ? '头高型'
              : '中高型',
          exampleSentence: v.example?.japanese || '',
          exampleTranslation: v.example?.chinese || '',
        })),
        grammarPoints: l.grammarPoints.map((g) => ({
          id: g.id,
          title: g.title,
          structure: g.connection,
          explanation: g.explanation,
          examples: g.examples.map((ex) => ({
            ja: ex.japanese,
            zh: ex.chinese,
          })),
        })),
      })),
    };

    // 提取全部生词并按需转为 FSRS 卡片
    let totalCardsCount = 0;
    if (autoGenerateCards) {
      const generatedCards: { front: string; back: string; category: string; prompt: string }[] = [];
      for (const lesson of parsedAST.lessons) {
        for (const vocab of lesson.vocabularies) {
          generatedCards.push({
            front: `${vocab.kanji} (${vocab.kana})`,
            back: `${vocab.chinese} [${vocab.pos} · ${vocab.pitchAccent}]`,
            category: 'VOCAB',
            prompt: `来自《${parsedAST.shortTitle}》${lesson.title}`,
          });
        }
      }
      if (generatedCards.length > 0) {
        onAddCardsBatch(generatedCards);
        totalCardsCount = generatedCards.length;
      }
    }

    onImportBook(convertedBook, totalCardsCount);
    toast.success(
      `成功导入《${convertedBook.title}》！已收录 ${convertedBook.lessons.length} 课，${totalCardsCount > 0 ? `生成 ${totalCardsCount} 张 FSRS 记忆卡片` : ''}`
    );
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-2xl bg-[#faf9f6] dark:bg-[#1c1a17] rounded-3xl shadow-2xl border border-amber-900/15 dark:border-amber-500/20 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* 模态框顶部 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-amber-900/10 dark:border-amber-500/15 bg-amber-500/5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  结构化教材导入与解析管道
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-mono">
                    Textbook AST v1.0
                  </span>
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  支持严格类型安全的课次知识树，杜绝纯切片检索造成的教学结构破坏
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-800/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 模态框主体内容 */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            {/* 快速动作栏 */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-amber-500/5 border border-amber-900/10 dark:border-amber-500/10">
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  上传教材 JSON 文件
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
                <button
                  onClick={handleLoadSample}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-semibold transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  载入官方样例《新编日语》
                </button>
              </div>
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                下载 AST 规范模版
              </button>
            </div>

            {/* 输入框 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-amber-500" />
                  教材 AST JSON 数据
                </label>
                {parsedAST && (
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    验证通过: 《{parsedAST.shortTitle}》 共 {parsedAST.lessons.length} 课
                  </span>
                )}
              </div>
              <textarea
                value={inputText}
                onChange={handleTextChange}
                placeholder="请在此粘贴符合规范的 Textbook AST JSON，或点击上方载入官方样例..."
                rows={10}
                className="w-full p-3 font-mono text-xs rounded-2xl bg-white dark:bg-[#151412] border border-stone-200 dark:border-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40 text-stone-800 dark:text-stone-200 leading-relaxed resize-none shadow-inner"
              />
            </div>

            {/* 解析错误提示 */}
            {parseError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2 text-rose-700 dark:text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="leading-relaxed">{parseError}</span>
              </div>
            )}

            {/* 提取生词卡选项 */}
            {parsedAST && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-900/10 dark:border-amber-500/20 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    自动为全课生词生成 FSRS 记忆卡片
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    将提取 {parsedAST.lessons.reduce((acc, l) => acc + l.vocabularies.length, 0)} 个生词直接注入今日复习池
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoGenerateCards}
                  onChange={(e) => setAutoGenerateCards(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-stone-300"
                />
              </div>
            )}
          </div>

          {/* 模态框底部按钮 */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-amber-900/10 dark:border-amber-500/15 bg-amber-500/5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800/50 transition-colors"
            >
              取消
            </button>
            <button
              disabled={!parsedAST}
              onClick={handleConfirmImport}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm ${
                parsedAST
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20'
                  : 'bg-stone-300 dark:bg-stone-800 text-stone-500 cursor-not-allowed'
              }`}
            >
              确认导入并激活
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
