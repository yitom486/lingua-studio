import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Loader2, Sparkles, Wrench } from 'lucide-react';
import { BorderBeam } from './magicui/index.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.js';
import {
  formatToolArguments,
  type ToolCallTrace,
} from '../lib/chat-transcript.js';

interface ChatTurnActivityProps {
  streaming: boolean;
  reasoning?: string;
  effortLabel: string;
  toolCalls?: ToolCallTrace[];
}

function ToolCallCard({
  call,
  defaultOpen,
}: {
  call: ToolCallTrace;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
    else setOpen(false);
  }, [defaultOpen]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={`relative overflow-hidden rounded-xl border px-2.5 py-1.5 ${
        call.status === 'running'
          ? 'border-sky-500/40 bg-sky-500/10'
          : 'border-stone-700/80 bg-stone-900/70'
      }`}
    >
      {call.status === 'running' ? (
        <BorderBeam size={90} duration={5} colorFrom="#38bdf8" colorTo="#a78bfa" />
      ) : null}
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-left">
        {call.status === 'running' ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-sky-300" />
        ) : (
          <Wrench className="size-3 shrink-0 text-stone-400" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-stone-200">
          {call.toolName}
        </span>
        <span className="shrink-0 text-[10px] text-stone-500">
          {call.status === 'running' ? '调用中' : '已完成'}
        </span>
        <ChevronDown
          className={`size-3 shrink-0 text-stone-500 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5">
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-stone-400">
          {formatToolArguments(call.arguments)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ChatTurnActivity({
  streaming,
  reasoning,
  effortLabel,
  toolCalls = [],
}: ChatTurnActivityProps) {
  const hasReasoning = Boolean(reasoning?.trim());
  const hasTools = toolCalls.length > 0;
  const hasActivity = hasReasoning || hasTools;
  const [open, setOpen] = useState(streaming);

  useEffect(() => {
    setOpen(streaming);
  }, [streaming]);

  if (!hasActivity) return null;

  const summary = [
    hasReasoning ? '思考' : null,
    hasTools ? `${toolCalls.length} 个工具` : streaming && !hasTools ? '生成中' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const body = (
    <div className="space-y-1.5">
      {hasReasoning ? (
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/8 px-2.5 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-violet-300/90">
            <Sparkles className="size-3" />
            思考 · {effortLabel}
            {streaming ? (
              <span className="ml-auto inline-flex gap-0.5">
                <span className="size-1 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.2s]" />
                <span className="size-1 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.1s]" />
                <span className="size-1 animate-bounce rounded-full bg-violet-300" />
              </span>
            ) : null}
          </div>
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-stone-400">
            {reasoning}
          </p>
        </div>
      ) : null}
      {toolCalls.map((call) => (
        <ToolCallCard key={call.id} call={call} defaultOpen={streaming} />
      ))}
    </div>
  );

  if (streaming) {
    return <div className="mb-2 space-y-1.5">{body}</div>;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left text-[11px] text-stone-500 hover:bg-stone-800/70 hover:text-stone-300">
        <ChevronDown
          className={`size-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
        <Sparkles className="size-3 text-violet-400/80" />
        <span className="min-w-0 truncate">{summary || '思考与工具'}</span>
        <span className="ml-auto shrink-0 text-[10px] text-stone-600">
          {open ? '收起' : '查看过程'}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5">{body}</CollapsibleContent>
    </Collapsible>
  );
}

const STREAMING_HINTS = [
  '正在组织回复',
  '正在整理思路',
  '马上开始书写',
  '正在铺开上下文',
] as const;

export function StreamingReplyPlaceholder() {
  const [hintIndex, setHintIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHintIndex((i) => (i + 1) % STREAMING_HINTS.length);
    }, 1700);
    return () => window.clearInterval(timer);
  }, []);

  const hint = STREAMING_HINTS[hintIndex] ?? STREAMING_HINTS[0];

  return (
    <div className="space-y-2.5 py-0.5" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2.5">
        <span className="flex h-4 items-end gap-[3px]" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="animate-reply-bar w-[3px] rounded-full bg-sky-400/90"
              style={{
                height: '100%',
                animationDelay: `${i * 0.11}s`,
                opacity: 0.55 + i * 0.08,
              }}
            />
          ))}
        </span>
        <span className="relative h-5 min-w-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={hint}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 text-[12px] text-stone-400"
            >
              {hint}
              <span className="ml-0.5 inline-flex gap-0.5 align-middle">
                <span className="size-1 animate-bounce rounded-full bg-sky-400 [animation-delay:-0.22s]" />
                <span className="size-1 animate-bounce rounded-full bg-sky-400 [animation-delay:-0.11s]" />
                <span className="size-1 animate-bounce rounded-full bg-sky-400" />
              </span>
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
      <div className="space-y-1.5" aria-hidden>
        {[
          'w-[94%]',
          'w-[72%]',
          'w-[84%]',
        ].map((width, i) => (
          <div
            key={width}
            className={`relative h-1.5 overflow-hidden rounded-full bg-stone-800/90 ${width}`}
          >
            <span
              className="animate-reply-shimmer absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-sky-300/35 to-transparent"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
