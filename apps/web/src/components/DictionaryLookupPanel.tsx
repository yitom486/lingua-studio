import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookPlus, Check, ExternalLink, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCollectDictionaryEntryMutation,
  useDictionaryHistoryQuery,
  useDictionaryLookupQuery,
  useAnkiStatusQuery,
  usePushToAnkiMutation,
  type AnkiPushTts,
} from '../queries/useLearnerQueries.js';
import { useTtsStore } from '../stores/useTtsStore.js';
import { buildPitchGraphSvg } from '@study-studio/learner-core';
import { QUERY_KEYS } from '../queries/query-keys.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';

type DictionaryLookupPanelProps = {
  language: 'en' | 'ja' | 'ko';
  title: string;
  helper: string;
};

/** pronunciation.pitch 安全抽取（label + positions；结构不对返回 null，不抛）。 */
function pitchInfoOf(pronunciation: unknown): { label: string; positions: number[] } | null {
  if (typeof pronunciation !== 'object' || pronunciation === null) return null;
  const pitch: unknown = (pronunciation as { pitch?: unknown }).pitch;
  if (typeof pitch !== 'object' || pitch === null) return null;
  const rec = pitch as { label?: unknown; positions?: unknown };
  if (typeof rec.label !== 'string' || !rec.label) return null;
  const positions = Array.isArray(rec.positions)
    ? rec.positions.filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p >= 0)
    : [];
  return { label: rec.label, positions };
}

/** 声调徽标 + 迷你阶梯图（SVG 为本地生成，读音已转义；无核位置时只显示徽标）。 */
function PitchBadge({ pronunciation, reading }: { pronunciation: unknown; reading?: string }) {
  const info = pitchInfoOf(pronunciation);
  if (!info) return null;
  const graph =
    reading && info.positions.length > 0 ? buildPitchGraphSvg(reading, info.positions, { label: info.label }) : '';
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="amber" className="font-mono">
        声调 {info.label}
      </Badge>
      {graph && (
        <span
          className="inline-flex items-center rounded-md border border-amber-500/25 bg-white px-1 dark:bg-stone-900 [&_svg]:h-7 [&_svg]:w-auto"
          title={`声调阶梯（${reading} ${info.label}）`}
          dangerouslySetInnerHTML={{ __html: graph }}
        />
      )}
    </span>
  );
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
  const ankiStatus = useAnkiStatusQuery(true);
  const pushToAnki = usePushToAnkiMutation();
  // TTS 凭证只存浏览器本地：推送时随请求携带、网关不落盘；未配置则音频留空。
  const customPluginUrl = useTtsStore((s) => s.customPluginUrl);
  const isCustomPluginEnabled = useTtsStore((s) => s.isCustomPluginEnabled);
  const customPluginApiKey = useTtsStore((s) => s.customPluginApiKey);
  const customPluginVoiceId = useTtsStore((s) => s.customPluginVoiceId);
  const ttsRate = useTtsStore((s) => s.rate);
  const ankiPushable = (ankiStatus.data?.enabled && ankiStatus.data.connected) === true;
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

  /** 推送到本机 Anki：先入库生词本（去重），再按卡片模板渲染推送。 */
  const pushEntryToAnki = (entryId: string) => {
    let tts: AnkiPushTts | undefined;
    if (isCustomPluginEnabled && customPluginUrl) {
      tts = {
        provider: 'openai-compatible',
        baseUrl: customPluginUrl,
        ...(customPluginApiKey ? { apiKey: customPluginApiKey } : {}),
        ...(customPluginVoiceId ? { voice: customPluginVoiceId } : {}),
        rate: ttsRate,
      };
    }
    collect.mutate(entryId, {
      onSuccess: (result) => {
        pushToAnki.mutate(
          { cardId: result.card.id, ...(tts ? { tts } : {}) },
          {
            onSuccess: (r) => {
              toast.success(
                `已推送到 Anki「${r.deckName}」${r.audioStored ? '（含发音）' : '（无音频）'}`
              );
            },
            onError: (error) => {
              toast.error(error instanceof Error ? error.message : '推送到 Anki 失败。');
            },
          }
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
                      <PitchBadge
                        pronunciation={entry.pronunciation}
                        {...(entry.reading ? { reading: entry.reading } : {})}
                      />
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
                  <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
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
                  {ankiPushable && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-[11px]"
                      disabled={collect.isPending || pushToAnki.isPending}
                      title="先加入生词本，再按卡片模板推送到本机 Anki"
                      onClick={() => pushEntryToAnki(entry.id)}
                    >
                      <Send className="h-3.5 w-3.5" />
                      推送 Anki
                    </Button>
                  )}
                  </div>
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
