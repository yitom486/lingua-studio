import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronRight,
  Plus,
  ShieldAlert,
  Square,
  Trash2,
  Wrench,
  X,
  Wifi,
  WifiOff,
  KeyRound,
} from 'lucide-react';
import type { useGateway } from '../hooks/useGateway.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import { usePreferencesStore } from '../stores/usePreferencesStore.js';
import { Button } from './ui/button.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js';
import { sound } from '../utils/audio.js';
import {
  buildTutorFreeGreeting,
  buildTutorOfflineReply,
  getTutorTrackCopy,
} from '../data/tutor-track-copy.js';
import { normalizeTrackLanguage } from '../learning/learning-shell.js';
import {
  useCodexModelsQuery,
  useCodexStatusQuery,
} from '../queries/useCodexQueries.js';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'approval';
  text: string;
  reasoning?: string;
  streaming?: boolean;
  source?: string;
  toolHints?: string[];
  approval?: {
    approvalId: string;
    action: string;
    description: string;
    riskLevel: string;
    status: 'pending' | 'accepted' | 'accepted_session' | 'declined' | 'timed_out' | 'cancelled';
    expiresAt?: number;
  };
}

interface AgentChatPanelProps {
  gateway?: ReturnType<typeof useGateway>;
  className?: string;
  onClose?: () => void;
}

const FALLBACK_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const;

const APPROVAL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'never', label: 'Approve for me' },
  { value: 'on-request', label: 'Ask for approval' },
  { value: 'untrusted', label: 'Untrusted' },
];

function effortLabel(v: string): string {
  const map: Record<string, string> = {
    none: 'None',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'xHigh',
    ultra: 'Ultra',
  };
  return map[v.toLowerCase()] || v;
}

/**
 * 对齐 Inkdown / Codex VS Code 风格：顶栏状态 + 底栏 mode/model/thinking + 流式气泡。
 * 仅经 Gateway；不引入厂商 SDK。
 */
export function AgentChatPanel({ gateway, className = '', onClose }: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const bootedRef = useRef(false);

  const activeTab = useStudySessionStore((s) => s.activeTab);
  const profile = useUserProfileStore((s) => s.profile);
  const coachModelId = usePreferencesStore((s) => s.coachModelId);
  const setCoachModelId = usePreferencesStore((s) => s.setCoachModelId);
  const coachEffort = usePreferencesStore((s) => s.coachEffort);
  const setCoachEffort = usePreferencesStore((s) => s.setCoachEffort);
  const coachApprovalPolicy = usePreferencesStore((s) => s.coachApprovalPolicy);
  const setCoachApprovalPolicy = usePreferencesStore((s) => s.setCoachApprovalPolicy);

  const track = normalizeTrackLanguage(profile.targetLanguage);
  const copy = getTutorTrackCopy(track);

  const { data: codexStatus } = useCodexStatusQuery();
  const { data: models = [], isFetching: modelsLoading } = useCodexModelsQuery(
    Boolean(gateway?.isConnected)
  );

  const selectedModel = useMemo(
    () => models.find((m) => m.id === coachModelId || m.model === coachModelId),
    [models, coachModelId]
  );

  const effortOptions = useMemo(() => {
    const fromModel = selectedModel?.supportedReasoningEfforts?.filter(Boolean);
    if (fromModel?.length) return fromModel;
    return [...FALLBACK_EFFORTS];
  }, [selectedModel]);

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

  useEffect(() => {
    if (!coachModelId && models.length) {
      const def = models.find((m) => m.isDefault) || models[0];
      if (def) setCoachModelId(def.id || def.model);
    }
  }, [coachModelId, models, setCoachModelId]);

  useEffect(() => {
    if (selectedModel?.defaultReasoningEffort && !effortOptions.includes(coachEffort)) {
      setCoachEffort(selectedModel.defaultReasoningEffort);
    } else if (effortOptions.length && !effortOptions.includes(coachEffort)) {
      setCoachEffort(effortOptions.includes('medium') ? 'medium' : effortOptions[0]!);
    }
  }, [selectedModel, effortOptions, coachEffort, setCoachEffort]);

  const snapshot = useCallback(() => {
    return {
      targetLanguage: track,
      learnerLevel: profile.overallLevel,
      locale: 'zh-CN' as const,
      ui: { activeTab, openTutor: true },
      userIntentHint: 'FREE_COACH' as const,
    };
  }, [track, profile.overallLevel, activeTab]);

  const clearChat = () => {
    sound.playClick();
    setMessages([
      {
        id: `open_${Date.now()}`,
        role: 'assistant',
        text: buildTutorFreeGreeting(track),
      },
    ]);
  };

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      sound.playClick();
      setInput('');
      const userId = `u_${Date.now()}`;
      const aiId = `a_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: userId, role: 'user', text },
        { id: aiId, role: 'assistant', text: '', reasoning: '', streaming: true, toolHints: [] },
      ]);
      setBusy(true);

      if (!gateway?.isConnected) {
        const offline = buildTutorOfflineReply(track, text);
        setMessages((prev) =>
          prev.map((m) => (m.id === aiId ? { ...m, text: offline, streaming: false } : m))
        );
        setBusy(false);
        return;
      }

      gateway.sendTurnStream({
        input: text,
        intent: 'FREE_COACH',
        contextSnapshot: snapshot(),
        agentOptions: {
          preferCodex: true,
          ...(coachModelId ? { model: coachModelId } : {}),
          ...(coachEffort ? { effort: coachEffort } : {}),
          ...(coachApprovalPolicy ? { approvalPolicy: coachApprovalPolicy } : {}),
        },
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
        onToolCall: (info) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== aiId) return m;
              const label = info.toolName;
              const hints = [...(m.toolHints ?? [])];
              if (!hints.includes(label)) hints.push(label);
              return { ...m, toolHints: hints };
            })
          );
        },
        onApprovalRequest: (info) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `appr_${info.approvalId}`,
              role: 'approval',
              text: info.description,
              approval: {
                approvalId: info.approvalId,
                action: info.action,
                description: info.description,
                riskLevel: info.riskLevel,
                status: 'pending',
                ...(typeof info.expiresAt === 'number'
                  ? { expiresAt: info.expiresAt }
                  : {}),
              },
            },
          ]);
        },
        onApprovalResolved: (info) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.approval?.approvalId !== info.approvalId || !m.approval) return m;
              if (m.approval.status !== 'pending') return m;
              const status =
                info.reason === 'timeout'
                  ? 'timed_out'
                  : info.reason === 'interrupt' || info.decision === 'cancel'
                    ? 'cancelled'
                    : info.decision === 'acceptForSession'
                      ? 'accepted_session'
                      : info.decision === 'accept'
                        ? 'accepted'
                        : 'declined';
              return {
                ...m,
                approval: { ...m.approval, status },
              };
            })
          );
        },
        onComplete: (data) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== aiId) return m;
              const next: ChatMessage = {
                ...m,
                text: data.finalOutput || m.text,
                streaming: false,
              };
              if (data.source) next.source = data.source;
              return next;
            })
          );
          setBusy(false);
        },
        onError: (err) => {
          const msg =
            err?.userMessage || err?.message || '导师服务暂时不可用，请稍后重试。';
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, text: msg, streaming: false } : m))
          );
          setBusy(false);
        },
      });
    },
    [
      busy,
      gateway,
      snapshot,
      track,
      coachModelId,
      coachEffort,
      coachApprovalPolicy,
    ]
  );

  const respondApproval = (
    approvalId: string,
    decision: 'accept' | 'acceptForSession' | 'decline'
  ) => {
    sound.playClick();
    gateway?.respondApproval?.(approvalId, decision);
    setMessages((prev) =>
      prev.map((m) =>
        m.approval?.approvalId === approvalId && m.approval
          ? {
              ...m,
              approval: {
                ...m.approval,
                status:
                  decision === 'acceptForSession'
                    ? 'accepted_session'
                    : decision === 'accept'
                      ? 'accepted'
                      : 'declined',
              },
            }
          : m
      )
    );
  };

  const interrupt = () => {
    sound.playClick();
    gateway?.interruptTurn?.();
    setBusy(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    );
  };

  const connected = Boolean(gateway?.isConnected);
  const authLinked = Boolean(codexStatus?.linked);
  const modelLabel =
    selectedModel?.displayName || coachModelId || (modelsLoading ? '加载中…' : '本机默认');

  const compactSelect =
    'h-7 min-w-0 max-w-[9.5rem] gap-1 rounded-md border border-stone-700/80 bg-transparent px-2 text-[11px] text-stone-300 hover:border-stone-500 hover:bg-stone-800/60 focus:ring-0 shadow-none';

  /** Agent 面板恒为深色底，不依赖 html.dark；高亮项强制浅色字 */
  const darkMenuItem =
    'text-stone-200 data-[highlighted]:bg-stone-700 data-[highlighted]:text-white focus:bg-stone-700 focus:text-white';

  return (
    <div
      className={`flex flex-col h-full min-h-[420px] rounded-xl border border-stone-800/80 bg-[#141518] text-stone-100 overflow-hidden shadow-xl ${className}`}
    >
      <header className="flex items-start justify-between gap-2 px-3 py-2.5 border-b border-stone-800/90">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">Agent</span>
            <span
              className={`inline-flex items-center gap-1 text-[10px] ${
                connected ? 'text-emerald-400' : 'text-stone-500'
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  connected ? 'bg-emerald-400' : 'bg-stone-600'
                }`}
              />
              {connected ? '已连接' : '未连接'}
            </span>
            {authLinked ? (
              <span
                className="inline-flex items-center gap-1 text-[10px] text-emerald-500/90"
                title={codexStatus?.message}
              >
                <KeyRound className="size-3" />
                Codex 已联动
              </span>
            ) : (
              <span className="text-[10px] text-amber-500/90" title={codexStatus?.message}>
                待 login
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-stone-500 truncate">
            {copy.headerHint} · App Server 流式
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {connected ? (
            <Wifi className="size-3.5 text-emerald-500/70 mr-1" />
          ) : (
            <WifiOff className="size-3.5 text-stone-600 mr-1" />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-stone-400 hover:text-stone-100"
            title="新对话"
            onClick={clearChat}
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-stone-400 hover:text-stone-100"
            title="清空"
            onClick={clearChat}
          >
            <Trash2 className="size-3.5" />
          </Button>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-stone-400 hover:text-stone-100"
              title="关闭"
              onClick={onClose}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'approval' && m.approval ? (
              <div className="w-full max-w-[95%] rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-[11px] font-medium text-amber-100/90">
                        需要批准 · {m.approval.action}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-stone-400">
                        {m.approval.description}
                      </p>
                    </div>
                    {m.approval.status === 'pending' ? (
                      <div className="space-y-2">
                        {m.approval.expiresAt ? (
                          <p className="text-[10px] text-amber-500/80">
                            约 2 分钟内未操作将自动拒绝
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2.5 text-[11px] bg-emerald-700 hover:bg-emerald-600"
                            onClick={() =>
                              respondApproval(m.approval!.approvalId, 'accept')
                            }
                          >
                            允许
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2.5 text-[11px] bg-emerald-800/80 hover:bg-emerald-700"
                            onClick={() =>
                              respondApproval(
                                m.approval!.approvalId,
                                'acceptForSession'
                              )
                            }
                          >
                            本会话允许
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px] border-stone-600"
                            onClick={() =>
                              respondApproval(m.approval!.approvalId, 'decline')
                            }
                          >
                            拒绝
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-stone-500">
                        {m.approval.status === 'accepted'
                          ? '已允许'
                          : m.approval.status === 'accepted_session'
                            ? '已允许（本会话）'
                            : m.approval.status === 'timed_out'
                              ? '已超时自动拒绝'
                              : m.approval.status === 'cancelled'
                                ? '已取消'
                                : '已拒绝'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
            {m.role !== 'user' && (
              <div className="mt-0.5 w-7 h-7 rounded-full bg-stone-800 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            )}
            <div
              className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-sky-700/25 border border-sky-600/30 text-stone-50'
                  : 'bg-transparent text-stone-200'
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
                    Thinking · {effortLabel(coachEffort)}
                  </button>
                  {reasoningOpen && (
                    <div className="mt-1 text-[11px] text-stone-500 border-l border-stone-700 pl-2 whitespace-pre-wrap">
                      {m.reasoning}
                    </div>
                  )}
                </div>
              ) : null}
              {m.toolHints && m.toolHints.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {m.toolHints.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-md border border-stone-700/80 bg-stone-900/80 px-1.5 py-0.5 text-[10px] text-stone-400"
                    >
                      <Wrench className="size-2.5" />
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              {m.text}
              {m.streaming && (
                <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-sky-400/80 animate-pulse" />
              )}
              {!m.streaming && m.source ? (
                <div className="mt-1.5 text-[10px] text-stone-600">
                  via {m.source === 'codex' ? 'Codex App Server' : m.source}
                </div>
              ) : null}
            </div>
              </>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <footer className="shrink-0 p-3 pt-1.5">
        <div className="rounded-2xl border border-stone-700/70 bg-[#0e0f11] focus-within:border-stone-500/80">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={3}
            placeholder="输入消息，Enter 发送 · Shift+Enter 换行"
            className="w-full resize-none bg-transparent px-3 py-2.5 text-[13px] text-stone-100 placeholder:text-stone-600 outline-none min-h-[72px]"
            disabled={busy}
          />
          <div className="flex items-center gap-0.5 border-t border-stone-800/80 px-1.5 py-1">
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              <Select
                value={coachApprovalPolicy || 'never'}
                onValueChange={(v) => v && setCoachApprovalPolicy(String(v))}
                disabled={busy}
              >
                <SelectTrigger className={compactSelect}>
                  <SelectValue>
                    {APPROVAL_OPTIONS.find((o) => o.value === coachApprovalPolicy)?.label ||
                      'Approve for me'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#12141a] border-stone-700 text-stone-100">
                  {APPROVAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className={darkMenuItem}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={coachModelId || '__default__'}
                onValueChange={(v) => setCoachModelId(v === '__default__' ? '' : String(v ?? ''))}
                disabled={busy}
              >
                <SelectTrigger className={`${compactSelect} max-w-[11rem]`}>
                  <SelectValue placeholder="Model">{modelLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#12141a] border-stone-700 text-stone-100">
                  <SelectItem value="__default__" className={darkMenuItem}>
                    本机默认
                  </SelectItem>
                  {models.map((m) => (
                    <SelectItem
                      key={m.id || m.model}
                      value={m.id || m.model}
                      className={darkMenuItem}
                    >
                      {m.displayName || m.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={coachEffort || 'medium'}
                onValueChange={(v) => v && setCoachEffort(String(v))}
                disabled={busy}
              >
                <SelectTrigger className={compactSelect}>
                  <SelectValue>{effortLabel(coachEffort || 'medium')}</SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#12141a] border-stone-700 text-stone-100">
                  {effortOptions.map((e) => (
                    <SelectItem key={e} value={e} className={darkMenuItem}>
                      {effortLabel(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {busy ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7 shrink-0 rounded-full border-stone-600"
                title="停止"
                onClick={interrupt}
              >
                <Square className="size-3" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className="size-7 shrink-0 rounded-full bg-sky-600 hover:bg-sky-500"
                title="发送"
                disabled={!input.trim()}
                onClick={() => void send(input)}
              >
                <ArrowUp className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-stone-600">
          复用本机 ~/.codex · sandbox=read-only · effort → turn/start
          {codexStatus?.message ? ` · ${codexStatus.message}` : ''}
        </p>
      </footer>
    </div>
  );
}
