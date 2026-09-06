import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookPlus, Check, ExternalLink, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCollectDictionaryEntryMutation,
  useDictionaryHistoryQuery,
  useDictionaryLookupQuery,
} from '../queries/useLearnerQueries.js';
import { QUERY_KEYS } from '../queries/query-keys.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';

type DictionaryLookupPanelProps = {
  language: 'en' | 'ja' | 'ko';
  title: string;
  helper: string;
};

/** pronunciation.pitch.label 安全抽取（结构不对返回 null，不抛）。 */
function pitchLabelOf(pronunciation: unknown): string | null {
  if (typeof pronunciation !== 'object' || pronunciation === null) return null;
  const pitch: unknown = (pronunciation as { pitch?: unknown }).pitch;
  if (typeof pitch !== 'object' || pitch === null) return null;
  const label: unknown = (pitch as { label?: unknown }).label;
  return typeof label === 'string' && label ? label : null;
}

type LookupEntry = {
  id: string;
  headword: string;
  reading?: string;
  partOfSpeech?: string;
  pronunciation?: Record<string, unknown>;
  frequency?: number;
  inflectionNote?: string;
  meanings: string[];
  sourceLabel: string;
};

/** 按来源分组（保序；网关已按优先级/词频排好，组内不再重排）。 */
function groupEntriesBySource(entries: LookupEntry[]): Array<{ source: string; entries: LookupEntry[] }> {
  const groups: Array<{ source: string; entries: LookupEntry[] }> = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.source === entry.sourceLabel) {
      last.entries.push(entry);
    } else {
      groups.push({ source: entry.sourceLabel, entries: [entry] });
    }
  }
  return groups;
}

/**
 * 可嵌入任意学习工作台的词典入口。它只组合 Query 与领域 Mutation，
 * 不拥有词典、FSRS 或每日统计的业务规则。
 */
export function DictionaryLookupPanel({ language, title, helper }: DictionaryLookupPanelProps) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const lookup = useDictionaryLookupQuery(language, query);
  const collect = useCollectDictionaryEntryMutation();
  const queryClient = useQueryClient();
  const history = useDictionaryHistoryQuery(language);
  // 查到结果后刷新最近查词（画像信号已由网关记录）
  useEffect(() => {
    if (lookup.data) {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.DICTIONARY, 'history', language] });
    }
  }, [lookup.data, lookup.dataUpdatedAt, queryClient, language]);

  const collectEntry = (entryId: string) => {
    collect.mutate(entryId, {
      onSuccess: (result) => {
        toast.success(
          result.created
            ? '已加入生词本，今天即可在 FSRS 闪卡中复习。'
            : '该词已经在你的生词本中。'
        );
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : '暂时无法加入生词本，请稍后重试。');
      },
    });
  };

  return (
    <section className="rounded-2xl border border-amber-900/10 bg-white/70 p-4 shadow-sm dark:border-amber-500/15 dark:bg-[#1a1816]">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(input.trim());
        }}
      >
        <div className="min-w-0 flex-1">
          <label
            className="text-sm font-semibold text-stone-800 dark:text-stone-200"
            htmlFor={`dictionary-${language}`}
          >
            {title}
          </label>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{helper}</p>
          <input
            id={`dictionary-${language}`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={language === 'en' ? '例如：resilient' : '输入要查询的词'}
            className="mt-2 h-9 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
          />
        </div>
        <Button type="submit" size="sm" disabled={!input.trim() || lookup.isFetching} className="gap-1.5">
          <Search className="h-3.5 w-3.5" />查询
        </Button>
      </form>

      {(history.data?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {history.data?.slice(0, 8).map((h) => (
            <button
              key={`${h.query}-${h.createdAt}`}
              type="button"
              onClick={() => {
                setInput(h.query);
                setQuery(h.query);
              }}
              className="rounded-full border border-stone-200 px-2.5 py-1 text-[11px] text-stone-500 hover:border-amber-500/50 hover:text-amber-700 dark:border-stone-700 dark:text-stone-400 dark:hover:text-amber-300"
              title={`最近查过（${h.hitCount} 条结果）`}
            >
              {h.query}
            </button>
          ))}
        </div>
      )}

      {query && (
        <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800">
          {lookup.isFetching ? (
            <p className="text-xs text-stone-500">正在查询本地词典…</p>
          ) : lookup.isError ? (
            <p className="text-xs text-stone-500">
              暂时无法查询本地词典，请检查 Gateway 连接后重试。
            </p>
          ) : lookup.data?.entries.length ? (
            <div className="space-y-3">
              {groupEntriesBySource(lookup.data.entries).map((group) => (
                <div key={group.source} className="space-y-2">
                  <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
                    {group.source} · {group.entries.length} 条
                  </p>
                  {group.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-2 rounded-xl bg-amber-50/70 p-3 dark:bg-amber-500/10 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
                        {entry.headword}
                      </span>
                      {entry.reading && (
                        <span className="font-mono text-xs text-amber-700 dark:text-amber-300">
                          {entry.reading}
                        </span>
                      )}
                      {entry.partOfSpeech && <Badge variant="outline">{entry.partOfSpeech}</Badge>}
                      {(() => {
                        const label = pitchLabelOf(entry.pronunciation);
                        return label ? (
                          <Badge variant="amber" className="font-mono">
                            声调 {label}
                          </Badge>
                        ) : null;
                      })()}
                      {typeof entry.frequency === 'number' && (
                        <Badge variant="secondary" className="font-mono" title="词频（数字越小越常用）">
                          #{entry.frequency}
                        </Badge>
                      )}
                    </div>
                    {entry.inflectionNote && (
                      <p className="mt-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                        {entry.inflectionNote}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-stone-600 dark:text-stone-300">
                      {entry.meanings.join('；')}
                    </p>
                    <p className="mt-1 text-[11px] text-stone-400">来源：{entry.sourceLabel}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    disabled={collect.isPending}
                    onClick={() => collectEntry(entry.id)}
                  >
                    {collect.isPending ? (
                      <Check className="h-3.5 w-3.5 animate-pulse" />
                    ) : (
                      <BookPlus className="h-3.5 w-3.5" />
                    )}
                    加入生词本
                  </Button>
                </div>
                  ))}
                </div>
              ))}
            </div>
          ) : lookup.data?.externalLookup ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-300">
              <span>本地词典暂未收录「{query}」。</span>
              <a
                href={lookup.data.externalLookup.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:underline dark:text-amber-300"
              >
                前往 OJAD 查询 <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : (
            <p className="text-xs text-stone-500">
              本地词典暂未收录「{query}」。{language === 'en' ? '请先确认英语离线词典包已经安装。' : ''}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
