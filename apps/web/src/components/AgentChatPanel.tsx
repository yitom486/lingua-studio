import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, ChevronRight, Send, Square, Sparkles, Wifi, WifiOff } from 'lucide-react';
import type { ContextSnapshot } from '@study-studio/agent-core';
import type { useGateway } from '../hooks/useGateway.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { sound } from '../utils/audio.js';
import {
  buildTutorFreeGreeting,
  buildTutorOfflineReply,
  getTutorTrackCopy,
} from '../data/tutor-track-copy.js';
import { normalizeTrackLanguage } from '../learning/learning-shell.js';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  reasoning?: string;
  streaming?: boolean;
  toolHints?: string[];
}

interface AgentChatPanelProps {
  gateway?: ReturnType<typeof useGateway>;
  className?: string;
}

/**
 * Codex VS Code 插件风格的流式导师聊天面板（深色会话流 + 底部输入条）。
 * 仅经 Gateway WS；不引入任何厂商 SDK。
 */
export function AgentChatPanel({ gateway, className = '' }: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const streamIdRef = useRef<string | null>(null);
  const bootedRef = useRef(false);

  const activeTab = useStudySessionStore((s) => s.activeTab);
  const profile = useUserProfileStore((s) => s.profile);
  const track = normalizeTrackLanguage(profile.targetLanguage);
  const copy = getTutorTrackCopy(track);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    setMessages([
      {
        id: 'open',
        role: 'assistant',
        text: buildTutorFreeGreeting(track),
      },
    ]);
  }, [track]);

  const snapshot = useCallback((): Partial<ContextSnapshot> => {
    return {
      targetLanguage: track,
      learnerLevel: profile.overallLevel,
      locale: 'zh-CN',
      ui: { activeTab, openTutor: true },
      userIntentHint: 'FREE_COACH',
    };
  }, [track, profile.overallLevel, activeTab]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      sound.playClick();
      setInput('');
      const userId = `u_${Date.now()}`;
      const aiId = `a_${Date.now()}`;
      streamIdRef.current = aiId;
      setMessages((prev) => [
        ...prev,
        { id: userId, role: 'user', text },
        { id: aiId, role: 'assistant', text: '', reasoning: '', streaming: true, toolHints: [] },
      ]);
      setBusy(true);

      if (!gateway?.isConnected) {
        const offline = buildTutorOfflineReply(track, text);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId ? { ...m, text: offline, streaming: false } : m
          )
        );
        setBusy(false);
        return;
      }

      gateway.sendTurnStream({
        input: text,
        intent: 'FREE_COACH',
        contextSnapshot: snapshot(),
        onDelta: (_d, acc) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, text: acc, streaming: true } : m))
          );
        },
        onReasoningDelta: (_d, acc) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, reasoning: acc } : m))
          );
        },
        onComplete: (data) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiId
                ? {
                    ...m,
                    text: data.finalOutput || m.text,
                    streaming: false,
                  }
                : m
            )
          );
          setBusy(false);
          streamIdRef.current = null;
        },
        onError: (err) => {
          const msg =
            err?.userMessage || err?.message || '导师服务暂时不可用，请稍后重试。';
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiId ? { ...m, text: msg, streaming: false } : m
            )
          );
          setBusy(false);
        },
      });
    },
    [busy, gateway, snapshot, track]
  );

  const interrupt = () => {
    sound.playClick();
    gateway?.interruptTurn?.();
    setBusy(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    );
  };

  const connected = Boolean(gateway?.isConnected);

  return (
    <div
      className={`flex flex-col h-full min-h-[420px] rounded-xl border border-stone-800/80 bg-[#0e0f11] text-stone-100 overflow-hidden shadow-xl ${className}`}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-stone-800/90 bg-[#12141a]">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">Study Coach</div>
            <div className="text-[10px] text-stone-500 truncate">
              Codex App Server · Gateway 流式 · {copy.headerHint}
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`text-[10px] gap-1 ${connected ? 'border-emerald-700/50 text-emerald-400' : 'border-stone-600 text-stone-400'}`}
        >
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? 'Online' : 'Offline'}
        </Badge>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role !== 'user' && (
              <div className="mt-0.5 w-7 h-7 rounded-full bg-stone-800 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-emerald-700/30 border border-emerald-600/30 text-stone-50'
                  : 'bg-stone-900/80 border border-stone-800 text-stone-200'
              }`}
            >
              {m.reasoning ? (
                <div className="mb-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[11px] text-stone-500 hover:text-stone-300"
                    onClick={() => setReasoningOpen((v) => !v)}
                  >
                    {reasoningOpen ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    Reasoning
                  </button>
                  {reasoningOpen && (
                    <div className="mt-1 text-[11px] text-stone-500 border-l border-stone-700 pl-2 whitespace-pre-wrap">
                      {m.reasoning}
                    </div>
                  )}
                </div>
              ) : null}
              {m.text}
              {m.streaming && (
                <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-emerald-400/80 animate-pulse" />
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <footer className="border-t border-stone-800/90 bg-[#12141a] p-2.5">
        <div className="flex items-end gap-2 rounded-xl border border-stone-700/80 bg-[#0e0f11] px-2.5 py-2 focus-within:border-emerald-700/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="Ask for follow-up changes…"
            className="flex-1 resize-none bg-transparent text-[13px] text-stone-100 placeholder:text-stone-600 outline-none min-h-[44px]"
            disabled={busy}
          />
          {busy ? (
            <Button size="sm" variant="secondary" className="shrink-0 gap-1" onClick={interrupt}>
              <Square className="w-3.5 h-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              className="shrink-0 gap-1 bg-emerald-700 hover:bg-emerald-600"
              onClick={() => void send(input)}
              disabled={!input.trim()}
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[10px] text-stone-600 px-1">
          Enter 发送 · Shift+Enter 换行 · 经 Gateway 连接 Codex App Server（失败自动本地旁路）
        </p>
      </footer>
    </div>
  );
}
