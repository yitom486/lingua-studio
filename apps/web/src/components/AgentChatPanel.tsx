import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronRight,
  History,
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
import { useAgentGateway } from '../hooks/useAgentGateway.js';
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
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js';
import { sound } from '../utils/audio.js';
import {
  buildTutorFreeGreeting,
  buildTutorOfflineReply,
  getTutorTrackCopy,
} from '../data/tutor-track-copy.js';
import { normalizeTrackLanguage } from '../learning/learning-shell.js';
import {
  useArchiveCodexThreadMutation,
  useCodexCollaborationModesQuery,
  useCodexModelsQuery,
  useCodexStatusQuery,
  useCodexThreadItemsQuery,
  useCodexThreadsQuery,
  CODEX_QUERY_KEYS,
} from '../queries/useCodexQueries.js';
import { useQueryClient } from '@tanstack/react-query';

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
export function AgentChatPanel({ className = '', onClose }: AgentChatPanelProps) {
  const gateway = useAgentGateway();
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
  const coachThreadId = usePreferencesStore((s) => s.coachThreadId);
  const setCoachThreadId = usePreferencesStore((s) => s.setCoachThreadId);
  const coachPersistThread = usePreferencesStore((s) => s.coachPersistThread);
  const setCoachPersistThread = usePreferencesStore((s) => s.setCoachPersistThread);
  const coachCollaborationMode = usePreferencesStore((s) => s.coachCollaborationMode);
  const setCoachCollaborationMode = usePreferencesStore((s) => s.setCoachCollaborationMode);

  const track = normalizeTrackLanguage(profile.targetLanguage);
  const copy = getTutorTrackCopy(track);
  const queryClient = useQueryClient();

  const { data: codexStatus } = useCodexStatusQuery();
  const { data: models = [], isFetching: modelsLoading } = useCodexModelsQuery(
    Boolean(gateway.isConnected)
  );
  const { data: threadsData, refetch: refetchThreads } = useCodexThreadsQuery(
    Boolean(gateway.isConnected)
  );
  const threads = threadsData?.threads ?? [];
  const { data: collabModes = [] } = useCodexCollaborationModesQuery(
    Boolean(gateway.isConnected)
  );
  const { data: threadItems = [] } = useCodexThreadItemsQuery(
    coachThreadId || null,
    Boolean(coachThreadId) && Boolean(gateway.isConnected)
  );
  const archiveThread = useArchiveCodexThreadMutation();
  const [historyOpen, setHistoryOpen] = useState(false);

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
    setCoachThreadId('');
    setMessages([
      {
        id: `open_${Date.now()}`,
        role: 'assistant',
        text: buildTutorFreeGreeting(track),
      },
    ]);
  };

  const openThread = (threadId: string) => {
    sound.playClick();
    setCoachThreadId(threadId);
    setHistoryOpen(false);
  };

  // 选中历史 thread 后，把 items 映射成聊天气泡
  useEffect(() => {
    if (!coachThreadId || !threadItems.length) return;
    const mapped: ChatMessage[] = [];
    for (const item of threadItems) {
      if (item.type === 'userMessage' && item.text) {
        mapped.push({
          id: item.id || `u_${item.turnId}_${mapped.length}`,
          role: 'user',
          text: item.text,
        });
      } else if (item.type === 'agentMessage' && item.text) {
        mapped.push({
          id: item.id || `a_${item.turnId}_${mapped.length}`,
          role: 'assistant',
          text: item.text,
          source: 'codex',
        });
      } else if (item.type === 'reasoning' && item.text) {
        const last = mapped[mapped.length - 1];
        if (last?.role === 'assistant') {
          last.reasoning = item.text;
        }
      }
    }
    if (mapped.length) setMessages(mapped);
  }, [coachThreadId, threadItems]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      // 生成中：注入 turn/steer，不新开一轮
      if (busy) {
        if (!gateway.isConnected) return;
        sound.playClick();
        setInput('');
        setMessages((prev) => [
          ...prev,
          { id: `steer_${Date.now()}`, role: 'user', text: `↗ ${text}` },
        ]);
        gateway.steerTurn?.(text);
        return;
      }

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

      if (!gateway.isConnected) {
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
          ephemeral: !coachPersistThread,
          ...(coachModelId ? { model: coachModelId } : {}),
          ...(coachEffort ? { effort: coachEffort } : {}),
          ...(coachApprovalPolicy ? { approvalPolicy: coachApprovalPolicy } : {}),
          ...(coachThreadId ? { threadId: coachThreadId } : {}),
          ...(coachCollaborationMode
            ? { collaborationMode: coachCollaborationMode }
            : {}),
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
          if (data.threadId) {
            setCoachThreadId(data.threadId);
            void queryClient.invalidateQueries({ queryKey: CODEX_QUERY_KEYS.THREADS });
          }
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
          const e = err as { userMessage?: string; message?: string } | undefined;
          const msg =
            e?.userMessage || e?.message || '导师服务暂时不可用，请稍后重试。';
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
      coachThreadId,
      coachPersistThread,
      coachCollaborationMode,
      setCoachThreadId,
      queryClient,
    ]
  );

  const respondApproval = (
    approvalId: string,
    decision: 'accept' | 'acceptForSession' | 'decline'
  ) => {
    sound.playClick();
    gateway.respondApproval(approvalId, decision);
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
    gateway.interruptTurn();
    setBusy(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    );
  };

  const connected = gateway.isConnected;
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
            {coachThreadId ? ` · ${coachThreadId.slice(0, 8)}…` : ''}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {connected ? (
            <Wifi className="size-3.5 text-emerald-500/70 mr-1" />
          ) : (
            <WifiOff className="size-3.5 text-stone-600 mr-1" />
          )}
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger
              className="inline-flex size-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-800 hover:text-stone-100"
              title="会话历史"
              onClick={() => {
                sound.playClick();
                void refetchThreads();
              }}
            >
              <History className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-72 p-2 bg-[#12141a] border-stone-700 text-stone-100"
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-[11px] font-medium text-stone-300">Codex 会话</p>
                <button
                  type="button"
                  className="text-[10px] text-sky-400 hover:text-sky-300"
                  onClick={() => {
                    clearChat();
                    setHistoryOpen(false);
                  }}
                >
                  新建
                </button>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {threads.length === 0 ? (
                  <p className="px-2 py-3 text-[11px] text-stone-500">暂无持久化会话</p>
                ) : (
                  threads.map((t) => (
                    <div
                      key={t.id}
                      className={`flex items-start gap-1 rounded-lg px-2 py-1.5 hover:bg-stone-800/80 ${
                        t.id === coachThreadId ? 'bg-stone-800' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => openThread(t.id)}
                      >
                        <p className="truncate text-[11px] text-stone-200">
                          {t.name || t.preview || t.id.slice(0, 12)}
                        </p>
                        <p className="text-[10px] text-stone-500">
                          {t.updatedAt
                            ? new Date(t.updatedAt * 1000).toLocaleString()
                            : t.id.slice(0, 8)}
                        </p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-stone-500 hover:text-rose-400"
                        title="归档"
                        onClick={() => {
                          sound.playClick();
                          archiveThread.mutate(t.id, {
                            onSuccess: () => {
                              if (coachThreadId === t.id) clearChat();
                            },
                          });
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <label className="mt-2 flex items-center gap-2 border-t border-stone-800 px-1 pt-2 text-[10px] text-stone-400">
                <input
                  type="checkbox"
                  checked={coachPersistThread}
                  onChange={(e) => setCoachPersistThread(e.target.checked)}
                />
                持久化新会话（thread ephemeral=false）
              </label>
            </PopoverContent>
          </Popover>
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
            placeholder={
              busy
                ? '生成中可输入引导（steer）后 Enter 注入 · Shift+Enter 换行'
                : '输入消息，Enter 发送 · Shift+Enter 换行'
            }
            className="w-full resize-none bg-transparent px-3 py-2.5 text-[13px] text-stone-100 placeholder:text-stone-600 outline-none min-h-[72px]"
          />
          <div className="flex items-center gap-0.5 border-t border-stone-800/80 px-1.5 py-1">
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              <Select
                value={coachCollaborationMode || '__none__'}
                onValueChange={(v) =>
                  setCoachCollaborationMode(v === '__none__' ? '' : String(v ?? ''))
                }
                disabled={busy}
              >
                <SelectTrigger className={compactSelect}>
                  <SelectValue>
                    {coachCollaborationMode || 'Mode'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#12141a] border-stone-700 text-stone-100">
                  <SelectItem value="__none__" className={darkMenuItem}>
                    Mode（默认）
                  </SelectItem>
                  <SelectItem value="default" className={darkMenuItem}>
                    default
                  </SelectItem>
                  <SelectItem value="plan" className={darkMenuItem}>
                    plan
                  </SelectItem>
                  {collabModes
                    .filter((m) => m.mode && m.mode !== 'default' && m.mode !== 'plan')
                    .map((m) => (
                      <SelectItem
                        key={m.name}
                        value={m.mode || m.name}
                        className={darkMenuItem}
                      >
                        {m.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

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
              <>
                <Button
                  type="button"
                  size="icon"
                  className="size-7 shrink-0 rounded-full bg-sky-600 hover:bg-sky-500"
                  title="注入引导 (steer)"
                  disabled={!input.trim()}
                  onClick={() => void send(input)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
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
              </>
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
          ~/.codex · thread/list · collaborationMode · steer
          {codexStatus?.message ? ` · ${codexStatus.message}` : ''}
        </p>
      </footer>
    </div>
  );
}
