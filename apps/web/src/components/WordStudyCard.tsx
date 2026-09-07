import { BookPlus, Check, Sparkles, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { sound, speechStudio, type SupportedLanguage } from '../utils/audio.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';

export interface StudyEntry {
  id: string;
  headword: string;
  reading?: string;
  partOfSpeech?: string;
  meanings: string[];
  sourceLabel: string;
}

const TRACK_SPEECH_LANG: Record<'ja' | 'en' | 'ko', SupportedLanguage> = {
  ja: 'JA',
  en: 'EN',
  ko: 'KO',
};

/**
 * 单词讲透卡（三语统一模板）：先学透，再去练。
 * 同一形式跑 ja/en/ko，只换数据源（读音/TTS/释义/问 AI 上下文）。
 * 例句位 v1 不硬凑：词典无例句字段，例句由“问 AI”按需讲，P2 再做 AI 例句生成+缓存。
 */
export function WordStudyCard({
  entry,
  language,
  collected,
  collectPending,
  studyPending,
  onCollect,
  onStudyComplete,
}: {
  entry: StudyEntry;
  language: 'ja' | 'en' | 'ko';
  collected: boolean;
  collectPending: boolean;
  studyPending: boolean;
  onCollect: (entryId: string) => void;
  onStudyComplete: (entryId: string) => void;
}) {
  const openTutor = useStudySessionStore((s) => s.openTutor);

  const handleSpeak = () => {
    sound.playClick();
    void speechStudio
      .speak(entry.headword, { lang: TRACK_SPEECH_LANG[language], purpose: 'preview' })
      .catch(() => toast.error('朗读失败，请检查语音设置'));
  };

  const handleAskAi = () => {
    sound.playClick();
    openTutor({
      questionText: `请讲透这个${language === 'ja' ? '日语' : language === 'ko' ? '韩语' : '英语'}词：${entry.headword}${entry.reading ? `（${entry.reading}）` : ''}，含义、用法，再给 2 个带中文的例句。`,
      correctAnswer: entry.meanings.join('；'),
      skillTag: `${language}.vocab`,
      explanation: entry.partOfSpeech ?? '',
    });
    toast.success('已把这个词交给 AI 导师讲透');
  };

  return (
    <div className="mt-2 rounded-xl border border-amber-500/25 bg-white p-4 shadow-sm dark:bg-stone-900 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-serif text-3xl font-bold text-stone-900 dark:text-stone-100">
          {entry.headword}
        </span>
        {entry.reading && (
          <span className="font-mono text-sm text-amber-700 dark:text-amber-300">
            {entry.reading}
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={handleSpeak}
          title="听发音"
        >
          <Volume2 className="h-3.5 w-3.5" />
          朗读
        </Button>
        {entry.partOfSpeech && <Badge variant="outline">{entry.partOfSpeech}</Badge>}
      </div>
      <ol className="space-y-1.5">
        {entry.meanings.map((m, i) => (
          <li key={i} className="flex gap-2 text-sm text-stone-700 dark:text-stone-200">
            <span className="font-mono text-xs text-amber-600 dark:text-amber-400 pt-0.5">
              {i + 1}.
            </span>
            <span>{m}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="button" size="sm" className="gap-1.5" onClick={handleAskAi} title="让 AI 讲用法和例句">
          <Sparkles className="h-3.5 w-3.5" />
          问 AI 讲透
        </Button>
        <Button
          type="button"
          size="sm"
          variant={collected ? 'ghost' : 'outline'}
          className="gap-1.5"
          disabled={collected || collectPending}
          onClick={() => onCollect(entry.id)}
          title={collected ? '已在生词本' : '加入生词本开始 FSRS 复习'}
        >
          {collected ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              已在生词本
            </>
          ) : (
            <>
              <BookPlus className="h-3.5 w-3.5" />
              {collectPending ? '加入中…' : '加入生词本'}
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-1.5"
          disabled={studyPending}
          onClick={() => onStudyComplete(entry.id)}
          title="先收后标讲透：这张卡进练习池 NEW 块；只收不标的不进"
        >
          <Check className="h-3.5 w-3.5" />
          {studyPending ? '入库中…' : '学透了，入库开练'}
        </Button>
        <span className="text-[11px] text-stone-400">只收不标的不进练习池——别裸考。</span>
      </div>
    </div>
  );
}
