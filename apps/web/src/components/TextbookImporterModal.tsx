import React, { useState } from 'react';
import {
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  BookOpen,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseTextbookAST, type TextbookAST } from '@study-studio/protocol';
import { sound } from '../utils/audio.js';
import { getPlatform } from '../platform/capabilities.js';
import type { TextbookBook, FuriganaWord } from '../models/textbook.js';
import { SAMPLE_TEXTBOOK_JSON } from '../fixtures/textbook-sample-ast.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';

interface TextbookImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportBook: (importedBook: TextbookBook, generatedCardsCount: number) => void;
  onAddCardsBatch: (cards: { front: string; back: string; category: string; prompt: string }[]) => void;
}

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

  // Dialog 以 open 控制可见性，无需提前 return
  // if (!isOpen) return null;


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
    getPlatform()
      .downloadFile({
        filename: 'study-studio-textbook-template.json',
        content: JSON.stringify(SAMPLE_TEXTBOOK_JSON, null, 2),
        mimeType: 'application/json',
      })
      .then(() => toast.success('已下载教材 AST 模版文件'))
      .catch(() => toast.error('下载模版失败，请稍后重试'));
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
      language: parsedAST.language,
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0"
        showCloseButton
      >
        <DialogHeader className="px-6 py-4 border-b border-amber-900/10 dark:border-amber-500/15 bg-amber-500/5 text-left">
          <div className="flex items-center gap-2.5 pr-8">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="flex items-center gap-2 text-base">
                结构化教材导入与解析管道
                <Badge variant="amber" className="text-[10px] font-mono">
                  Textbook AST v1.0
                </Badge>
              </DialogTitle>
              <DialogDescription>
                支持严格类型安全的课次知识树，杜绝纯切片检索造成的教学结构破坏
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
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
              <Button variant="secondary" size="sm" onClick={handleLoadSample}>
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                载入官方样例《新编日语》
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={handleDownloadTemplate}>
              <Download className="w-3.5 h-3.5" />
              下载 AST 规范模版
            </Button>
          </div>

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

          {parseError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2 text-rose-700 dark:text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="leading-relaxed">{parseError}</span>
            </div>
          )}

          {parsedAST && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-900/10 dark:border-amber-500/20 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  自动为全课生词生成 FSRS 记忆卡片
                </div>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  将提取{' '}
                  {parsedAST.lessons.reduce((acc, l) => acc + l.vocabularies.length, 0)}{' '}
                  个生词直接注入今日复习池
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

        <div className="flex items-center justify-between px-6 py-4 border-t border-amber-900/10 dark:border-amber-500/15 bg-amber-500/5">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!parsedAST} onClick={handleConfirmImport}>
            确认导入并激活
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
