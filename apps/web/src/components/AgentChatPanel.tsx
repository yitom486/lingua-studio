import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Bot,
  History,
  ListOrdered,
  Play,
  Plus,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  GitFork,
  Minimize2,
  X,
  Wifi,
  WifiOff,
  KeyRound,
  Gauge,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { BorderBeam } from './magicui/index.js';
import { ChatTurnActivity, StreamingReplyPlaceholder } from './ChatTurnActivity.js';
import {
  mapThreadItemsToBubbles,
  markToolCallsDone,
  stripTranscriptNoise,
  upsertToolCall,
  type ToolCallTrace,
} from '../lib/chat-transcript.js';
import { sound } from '../utils/audio.js';
import {
  buildTutorFreeGreeting,
  buildTutorOfflineReply,
  getTutorTrackCopy,
} from '../data/tutor-track-copy.js';
import { normalizeTrackLanguage } from '../learning/learning-shell.js';
import {
  useArchiveCodexThreadMutation,
  useCompactCodexThreadMutation,
  useCodexCollaborationModesQuery,
  useCodexModelsQuery,
  useCodexQueueQuery,
  useCodexSkillsQuery,
  useCodexRateLimitsQuery,
  useCodexMcpServersQuery,
  useCodexStatusQuery,
  useCodexThreadItemsQuery,
  useCodexThreadsQuery,
  useCodexRealtimeInvalidation,
  useDeleteCodexQueueItemMutation,
  useForkCodexThreadMutation,
  useQueueCodexMessageMutation,
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
  toolCalls?: ToolCallTrace[];
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

type CodexTurnHealth =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'healthy' }
  | { state: 'fallback'; message: string }
  | { state: 'failed'; message: string };

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

  const { data: codexStatus, refetch: refetchCodexStatus } = useCodexStatusQuery();
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
  const { data: threadItems = [], isFetched: threadItemsFetched } = useCodexThreadItemsQuery(
    coachThreadId || null,
    Boolean(coachThreadId) && Boolean(gateway.isConnected)
  );
  const archiveThread = useArchiveCodexThreadMutation();
  const compactThread = useCompactCodexThreadMutation();
  const forkThread = useForkCodexThreadMutation();
  useCodexRealtimeInvalidation();
  const queueMessage = useQueueCodexMessageMutation();
  const deleteQueueItem = useDeleteCodexQueueItemMutation();
  const { data: queueItems = [] } = useCodexQueueQuery(
    coachThreadId || null,
    Boolean(coachThreadId) && Boolean(gateway.isConnected)
  );
  const { data: skills = [] } = useCodexSkillsQuery(Boolean(gateway.isConnected));
  const { data: rateLimits } = useCodexRateLimitsQuery(Boolean(gateway.isConnected));
  const { data: mcpServers = [] } = useCodexMcpServersQuery(Boolean(gateway.isConnected));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [composerSettingsOpen, setComposerSettingsOpen] = useState(false);
  const [codexTurnHealth, setCodexTurnHealth] = useState<CodexTurnHealth>({ state: 'idle' });
  const lastCoachPromptRef = useRef<string | null>(null);
  const queueDrainRef = useRef(false);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === coachModelId || m.model === coachModelId),
    [models, coachModelId]
  );

  const effortOptions = useMemo(() => {
    const fromModel = selectedModel?.supportedReasoningEfforts?.filter(Boolean);
    if (fromModel?.length) return fromModel;
    return [...FALLBACK_EFFORTS];
  }, [selectedModel]);

  const recordCodexTurnCompletion = useCallback(
    (data: {
      status?: 'COMPLETED' | 'INTERRUPTED' | 'FAILED';
      source?: string;
      codexOutcome?: 'streamed' | 'fallback' | 'not_requested';
      codexFailureMessage?: string;
    }) => {
      if (data.status === 'INTERRUPTED') {
        setCodexTurnHealth({ state: 'idle' });
        return;
      }
      if (data.codexOutcome === 'streamed' || data.source === 'codex') {
        setCodexTurnHealth({ state: 'healthy' });
        return;
      }
      if (data.codexOutcome === 'fallback') {
        setCodexTurnHealth({
          state: 'fallback',
          message: data.codexFailureMessage || 'Codex 本轮未完成，已使用本地学习提示。',
        });
        void refetchCodexStatus();
        return;
      }
      if (data.status === 'FAILED') {
        setCodexTurnHealth({ state: 'failed', message: '本轮请求未完成，请重试。' });
        void refetchCodexStatus();
      }
    },
    [refetchCodexStatus]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  // 偏好水合后再决定问候语 / 恢复提示，避免先闪 greeting 再被 thread items 覆盖
  useEffect(() => {
    if (bootedRef.current) return;
    const boot = () => {
      if (bootedRef.current) return;
      bootedRef.current = true;
      const threadId = usePreferencesStore.getState().coachThreadId;
      if (threadId) {
        setMessages([
          {
            id: 'resume',
            role: 'system',
            text: '正在恢复上次 Codex 会话…',
          },
        ]);
      } else {
        setMessages([
          {
            id: 'open',
            role: 'assistant',
            text: buildTutorFreeGreeting(track),
          },
        ]);
      }
    };
    if (usePreferencesStore.persist.hasHydrated()) {
      boot();
      return;
    }
    return usePreferencesStore.persist.onFinishHydration(boot);
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

  /** 显式新建会话（清空 thread，下次 turn 会 start 新 thread） */
  const startNewChat = () => {
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

  /** 仅清屏，保留 coachThreadId，便于继续 resume */
  const clearDisplay = () => {
    sound.playClick();
    setMessages([
      {
        id: `wipe_${Date.now()}`,
        role: 'system',
        text: coachThreadId
          ? '已清屏（会话仍保留，发送消息将续写当前 thread）'
          : '已清屏',
      },
    ]);
  };

  const openThread = (threadId: string) => {
    sound.playClick();
    setCoachThreadId(threadId);
    setHistoryOpen(false);
  };

  const enqueueQueued = () => {
    const text = input.trim();
    if (!text) return;
    if (!coachThreadId) {
      toast.error('请先有一个活跃会话再加入队列');
      return;
    }
    sound.playClick();
    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: `queue_${Date.now()}`, role: 'user', text: `排队 ${text}` },
    ]);
    queueMessage.mutate(
      { threadId: coachThreadId, message: text },
      {
        onError: () => toast.error('加入队列失败'),
        onSuccess: () => toast.success('已加入下一轮队列'),
      }
    );
  };

  // 选中 / 恢复历史 thread：把 items 映射成聊天气泡
  useEffect(() => {
    if (!coachThreadId) return;
    if (threadItems.length) {
      const mapped: ChatMessage[] = mapThreadItemsToBubbles(threadItems).map((b) => ({
        ...b,
        text: b.role === 'user' ? stripTranscriptNoise(b.text) : b.text,
      }));
      if (mapped.length) setMessages(mapped);
      return;
    }
    if (threadItemsFetched) {
      setMessages((prev) => {
        if (prev.length === 1 && prev[0]?.id === 'resume') {
          return [
            {
              id: `open_${Date.now()}`,
              role: 'assistant',
              text: buildTutorFreeGreeting(track),
            },
          ];
        }
        return prev;
      });
    }
  }, [coachThreadId, threadItems, threadItemsFetched, track]);

  const startQueuedTurn = useCallback(
    (queuedSubmissionId?: string) => {
      if (!gateway.isConnected) return;
      if (queueDrainRef.current) return;
      queueDrainRef.current = true;
      sound.playClick();
      const aiId = `a_q_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_q_${Date.now()}`,
          role: 'system',
          text: '▶ 正在消费队列下一项…',
        },
        {
          id: aiId,
          role: 'assistant',
          text: '',
          reasoning: '',
          streaming: true,
          toolCalls: [],
        },
      ]);
      setBusy(true);
      setCodexTurnHealth({ state: 'running' });

      const finish = (data: {
        finalOutput?: string;
        source?: string;
        threadId?: string;
        queueRemaining?: number;
      }) => {
        queueDrainRef.current = false;
        recordCodexTurnCompletion(data);
        if (data.threadId) {
          setCoachThreadId(data.threadId);
          void queryClient.invalidateQueries({ queryKey: CODEX_QUERY_KEYS.THREADS });
          void queryClient.invalidateQueries({
            queryKey: [...CODEX_QUERY_KEYS.QUEUE, data.threadId],
          });
        }
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== aiId) return m;
            const next: ChatMessage = {
              ...m,
              text: data.finalOutput || m.text,
              streaming: false,
            };
            const doneCalls = markToolCallsDone(m.toolCalls);
            if (doneCalls) next.toolCalls = doneCalls;
            if (data.source) next.source = data.source;
            return next;
          })
        );
        setBusy(false);
        if ((data.queueRemaining ?? 0) > 0) {
          window.setTimeout(() => startQueuedTurn(), 80);
        }
      };

      const ok = gateway.startQueueStream({
        lane: 'coach',
        ...(queuedSubmissionId ? { queuedSubmissionId } : {}),
        ...(coachApprovalPolicy ? { approvalPolicy: coachApprovalPolicy } : {}),
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
              return { ...m, toolCalls: upsertToolCall(m.toolCalls ?? [], info) };
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
        onComplete: (data) => finish(data),
        onError: (err) => {
          queueDrainRef.current = false;
          const e = err as { userMessage?: string; message?: string } | undefined;
          const msg = e?.userMessage || e?.message || '队列消费失败';
          setCodexTurnHealth({ state: 'failed', message: msg });
          void refetchCodexStatus();
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, text: msg, streaming: false } : m))
          );
          setBusy(false);
        },
      });
      if (!ok) {
        queueDrainRef.current = false;
        setBusy(false);
      }
    },
    [
      gateway,
      coachApprovalPolicy,
      setCoachThreadId,
      queryClient,
      recordCodexTurnCompletion,
      refetchCodexStatus,
    ]
  );

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
        gateway.steerTurn?.(text, 'coach');
        return;
      }

      sound.playClick();
      setInput('');
      const userId = `u_${Date.now()}`;
      const aiId = `a_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: userId, role: 'user', text },
        { id: aiId, role: 'assistant', text: '', reasoning: '', streaming: true, toolCalls: [] },
      ]);
      setBusy(true);
      setCodexTurnHealth({ state: 'running' });
      lastCoachPromptRef.current = text;

      if (!gateway.isConnected) {
        const offline = buildTutorOfflineReply(track, text);
        setCodexTurnHealth({ state: 'failed', message: 'Gateway 未连接，无法请求 Codex。' });
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
          lane: 'coach',
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
              return { ...m, toolCalls: upsertToolCall(m.toolCalls ?? [], info) };
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
          recordCodexTurnCompletion(data);
          if (data.threadId) {
            setCoachThreadId(data.threadId);
            void queryClient.invalidateQueries({ queryKey: CODEX_QUERY_KEYS.THREADS });
            void queryClient.invalidateQueries({
              queryKey: [...CODEX_QUERY_KEYS.QUEUE, data.threadId],
            });
          }
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== aiId) return m;
              const next: ChatMessage = {
                ...m,
                text: data.finalOutput || m.text,
                streaming: false,
              };
              const doneCalls = markToolCallsDone(m.toolCalls);
              if (doneCalls) next.toolCalls = doneCalls;
              if (data.source) next.source = data.source;
              return next;
            })
          );
          setBusy(false);
          if ((data.queueRemaining ?? 0) > 0) {
            window.setTimeout(() => startQueuedTurn(), 80);
          }
        },
        onError: (err) => {
          const e = err as { userMessage?: string; message?: string } | undefined;
          const msg =
            e?.userMessage || e?.message || '导师服务暂时不可用，请稍后重试。';
          setCodexTurnHealth({ state: 'failed', message: msg });
          void refetchCodexStatus();
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
      startQueuedTurn,
      recordCodexTurnCompletion,
      refetchCodexStatus,
    ]
  );

  const retryLastCodexTurn = useCallback(() => {
    const prompt = lastCoachPromptRef.current;
    if (!prompt || busy) return;
    void send(prompt);
  }, [busy, send]);

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
    queueDrainRef.current = false;
    gateway.interruptTurn('coach');
    setBusy(false);
    setCodexTurnHealth({ state: 'idle' });
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    );
  };

  const connected = gateway.isConnected;
  const authLinked = Boolean(codexStatus?.linked);
  const modelLabel =
    selectedModel?.displayName || coachModelId || (modelsLoading ? '加载中…' : '本机默认');

  const compactSelect =
    'h-7 min-w-0 w-full gap-1 overflow-hidden rounded-md border border-stone-700/80 bg-transparent px-2 text-[11px] text-stone-300 hover:border-stone-500 hover:bg-stone-800/60 focus:ring-0 shadow-none';
  const composerSettingsNonDefault =
    Boolean(coachCollaborationMode) ||
    (coachApprovalPolicy && coachApprovalPolicy !== 'never') ||
    (coachEffort && coachEffort !== 'medium');

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
                Codex 已登录
              </span>
            ) : (
              <span className="text-[10px] text-amber-500/90" title={codexStatus?.message}>
                待 login
              </span>
            )}
            {codexTurnHealth.state !== 'idle' ? (
              <span
                className={`inline-flex items-center gap-1 text-[10px] ${
                  codexTurnHealth.state === 'healthy'
                    ? 'text-emerald-400'
                    : codexTurnHealth.state === 'running'
                      ? 'text-sky-400'
                      : codexTurnHealth.state === 'fallback'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                }`}
                title={
                  codexTurnHealth.state === 'fallback' || codexTurnHealth.state === 'failed'
                    ? codexTurnHealth.message
                    : undefined
                }
              >
                <span
                  className={`size-1.5 rounded-full ${
                    codexTurnHealth.state === 'healthy'
                      ? 'bg-emerald-400'
                      : codexTurnHealth.state === 'running'
                        ? 'bg-sky-400 animate-pulse'
                        : codexTurnHealth.state === 'fallback'
                          ? 'bg-amber-400'
                          : 'bg-rose-400'
                  }`}
                />
                {codexTurnHealth.state === 'healthy'
                  ? '本轮正常'
                  : codexTurnHealth.state === 'running'
                    ? '请求中'
                    : codexTurnHealth.state === 'fallback'
                      ? '本轮已回退'
                      : '本轮失败'}
              </span>
            ) : null}
            {(codexTurnHealth.state === 'fallback' || codexTurnHealth.state === 'failed') &&
            lastCoachPromptRef.current ? (
              <button
                type="button"
                className="text-[10px] font-medium text-sky-400 hover:text-sky-300"
                disabled={busy}
                onClick={retryLastCodexTurn}
              >
                重试 Codex
              </button>
            ) : null}
            {typeof rateLimits?.primaryUsedPercent === 'number' ? (
              <span
                className="inline-flex items-center gap-1 text-[10px] text-stone-500"
                title={
                  rateLimits.primaryResetsAt
                    ? `重置于 ${new Date(rateLimits.primaryResetsAt * 1000).toLocaleString()}`
                    : rateLimits.limitName || 'rate limit'
                }
              >
                <Gauge className="size-3" />
                {Math.round(rateLimits.primaryUsedPercent)}%
              </span>
            ) : null}
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
                    startNewChat();
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
                        className="size-6 shrink-0 text-stone-500 hover:text-amber-300"
                        title="压缩上下文"
                        disabled={compactThread.isPending}
                        onClick={() => {
                          sound.playClick();
                          compactThread.mutate(t.id, {
                            onSuccess: () => toast.success('已请求压缩会话上下文'),
                            onError: () => toast.error('压缩失败'),
                          });
                        }}
                      >
                        <Minimize2 className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-stone-500 hover:text-sky-300"
                        title="分叉会话"
                        disabled={forkThread.isPending}
                        onClick={() => {
                          sound.playClick();
                          forkThread.mutate(
                            {
                              threadId: t.id,
                              ephemeral: !coachPersistThread,
                            },
                            {
                              onSuccess: (res) => {
                                toast.success('已分叉新会话');
                                openThread(res.threadId);
                              },
                              onError: () => toast.error('分叉失败'),
                            }
                          );
                        }}
                      >
                        <GitFork className="size-3" />
                      </Button>
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
                              if (coachThreadId === t.id) startNewChat();
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
          <Popover open={skillsOpen} onOpenChange={setSkillsOpen}>
            <PopoverTrigger
              className="inline-flex size-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-800 hover:text-stone-100"
              title="Skills"
              onClick={() => sound.playClick()}
            >
              <Sparkles className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-72 p-2 bg-[#12141a] border-stone-700 text-stone-100"
            >
              <p className="px-1 pb-2 text-[11px] font-medium text-stone-300">
                Codex Skills（只读）
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {skills.length === 0 ? (
                  <p className="px-2 py-3 text-[11px] text-stone-500">暂无 skill</p>
                ) : (
                  skills.map((s) => (
                    <div
                      key={`${s.scope ?? 'x'}:${s.name}`}
                      className="rounded-lg px-2 py-1.5 hover:bg-stone-800/80"
                    >
                      <div className="flex items-center gap-1.5">
                        <p className="min-w-0 truncate text-[11px] text-stone-200">{s.name}</p>
                        <span
                          className={`shrink-0 text-[9px] ${
                            s.enabled ? 'text-emerald-500' : 'text-stone-600'
                          }`}
                        >
                          {s.enabled ? 'on' : 'off'}
                        </span>
                      </div>
                      {s.description ? (
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-stone-500">
                          {s.description}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
              <div className="mt-2 border-t border-stone-800 px-1 pt-2">
                <p className="pb-1 text-[10px] font-medium text-stone-400">
                  MCP 状态（观测，非学习工具总线）
                </p>
                <div className="max-h-28 space-y-1 overflow-y-auto">
                  {mcpServers.length === 0 ? (
                    <p className="px-1 py-2 text-[10px] text-stone-600">未配置 MCP</p>
                  ) : (
                    mcpServers.map((s) => (
                      <div
                        key={s.name}
                        className="flex items-center justify-between gap-2 rounded px-1 py-0.5"
                      >
                        <span className="truncate text-[10px] text-stone-300">{s.name}</span>
                        <span className="shrink-0 text-[9px] text-stone-500">
                          {s.authStatus} · {s.toolCount} tools
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-stone-400 hover:text-stone-100"
            title="新对话（新开 thread）"
            onClick={startNewChat}
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-stone-400 hover:text-stone-100"
            title="清屏（保留当前会话）"
            onClick={clearDisplay}
          >
            <Trash2 className="size-3.5" />
          </Button>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-stone-400 hover:text-stone-100"
              title="关闭面板（会话不断开）"
              onClick={onClose}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {queueItems.length > 0 ? (
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 px-2.5 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-sky-300/90">
                <ListOrdered className="size-3" />
                下一轮队列 · {queueItems.length}
              </div>
              <Button
                type="button"
                size="sm"
                className="h-6 gap-1 px-2 text-[10px] bg-sky-700 hover:bg-sky-600"
                disabled={busy}
                title="立即消费队列"
                onClick={() => startQueuedTurn()}
              >
                <Play className="size-3" />
                开始
              </Button>
            </div>
            <div className="space-y-1">
              {queueItems.map((q) => (
                <div
                  key={q.id}
                  className="flex items-start gap-1 rounded-lg bg-stone-900/50 px-2 py-1"
                >
                  <p className="min-w-0 flex-1 truncate text-[11px] text-stone-300">{q.text}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-5 shrink-0 text-stone-500 hover:text-rose-400"
                    title="移出队列"
                    onClick={() => {
                      if (!coachThreadId) return;
                      sound.playClick();
                      deleteQueueItem.mutate({
                        threadId: coachThreadId,
                        queuedId: q.id,
                      });
                    }}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'system' ? (
              <p className="w-full text-center text-[10px] text-stone-500">{m.text}</p>
            ) : m.role === 'approval' && m.approval ? (
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
              <div
                className={`mt-0.5 w-7 h-7 rounded-full bg-stone-800 flex items-center justify-center shrink-0 ${
                  m.streaming ? 'ring-2 ring-sky-400/40' : ''
                }`}
              >
                <Bot
                  className={`w-3.5 h-3.5 ${
                    m.streaming ? 'text-sky-300' : 'text-emerald-400'
                  }`}
                />
              </div>
            )}
            {(() => {
              const waitingFirstToken =
                m.role !== 'user' &&
                Boolean(m.streaming) &&
                !m.text.trim() &&
                !m.reasoning &&
                !m.toolCalls?.length;
              return (
            <div
              className={`relative max-w-[88%] rounded-2xl text-[13px] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-sky-700/25 border border-sky-600/30 px-3 py-2 text-stone-50'
                  : waitingFirstToken
                    ? 'px-1 py-1 text-stone-200'
                    : m.streaming
                      ? 'overflow-hidden border border-sky-500/25 bg-stone-900/40 px-3 py-2 text-stone-200'
                      : 'px-3 py-2 bg-transparent text-stone-200'
              }`}
            >
              {m.role !== 'user' && m.streaming && !waitingFirstToken ? (
                <BorderBeam
                  size={140}
                  duration={7}
                  colorFrom="#38bdf8"
                  colorTo="#a78bfa"
                  borderWidth={1.25}
                />
              ) : null}
              {m.role !== 'user' ? (
                <ChatTurnActivity
                  streaming={Boolean(m.streaming)}
                  {...(m.reasoning ? { reasoning: m.reasoning } : {})}
                  effortLabel={effortLabel(coachEffort)}
                  {...(m.toolCalls ? { toolCalls: m.toolCalls } : {})}
                />
              ) : null}
              {m.role === 'user' ? (
                <div className="whitespace-pre-wrap">{stripTranscriptNoise(m.text)}</div>
              ) : waitingFirstToken ? (
                <StreamingReplyPlaceholder />
              ) : (
                <div className="whitespace-pre-wrap">
                  {m.text}
                  {m.streaming && m.text ? (
                    <span className="ml-0.5 inline-block h-3.5 w-1.5 align-middle bg-sky-400/80 animate-pulse" />
                  ) : null}
                </div>
              )}
              {!m.streaming && m.source ? (
                <div className="mt-1.5 text-[10px] text-stone-600">
                  via {m.source === 'codex' ? 'Codex App Server' : m.source}
                </div>
              ) : null}
            </div>
              );
            })()}
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
                ? '生成中：Enter=steer；队列按钮=下一轮排队 · Shift+Enter 换行'
                : '输入消息，Enter 发送 · Shift+Enter 换行'
            }
            className="w-full resize-none bg-transparent px-3 py-2.5 text-[13px] text-stone-100 placeholder:text-stone-600 outline-none min-h-[72px]"
          />
          <div className="flex items-center gap-0.5 border-t border-stone-800/80 px-1.5 py-1">
            <Popover open={composerSettingsOpen} onOpenChange={setComposerSettingsOpen}>
              <PopoverTrigger
                className={`relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-stone-800/80 hover:text-stone-100 ${
                  composerSettingsOpen ? 'bg-stone-800 text-stone-100' : ''
                }`}
                title="Mode / 审批 / 思考"
                aria-label="会话设置"
                onClick={() => sound.playClick()}
              >
                <Settings2 className="size-3.5" />
                {composerSettingsNonDefault && !composerSettingsOpen ? (
                  <span className="absolute top-1 right-1 size-1.5 rounded-full bg-sky-400" />
                ) : null}
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={8}
                className="w-72 space-y-3 border-stone-700 bg-[#12141a] p-3 text-stone-100"
              >
                <div>
                  <p className="text-xs font-medium text-stone-200">会话参数</p>
                  <p className="mt-0.5 text-[10px] text-stone-500">设置仅影响后续发送的消息</p>
                </div>

                <div className="space-y-2">
                  <div className="space-y-0.5">
                    <span className="block px-0.5 text-[10px] text-stone-500">Mode</span>
                    <Select
                      value={coachCollaborationMode || '__none__'}
                      onValueChange={(v) =>
                        setCoachCollaborationMode(v === '__none__' ? '' : String(v ?? ''))
                      }
                      disabled={busy}
                    >
                      <SelectTrigger className={compactSelect}>
                        <SelectValue>{coachCollaborationMode || '默认'}</SelectValue>
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
                  </div>

                  <div className="space-y-0.5">
                    <span className="block px-0.5 text-[10px] text-stone-500">审批</span>
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
                  </div>

                  <div className="space-y-0.5">
                    <span className="block px-0.5 text-[10px] text-stone-500">思考深度</span>
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
                </div>
              </PopoverContent>
            </Popover>

            <div className="min-w-0 flex-1">
              <Select
                value={coachModelId || '__default__'}
                onValueChange={(v) => setCoachModelId(v === '__default__' ? '' : String(v ?? ''))}
                disabled={busy}
              >
                <SelectTrigger className={`${compactSelect} max-w-[14rem]`}>
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
                  size="icon"
                  className="size-7 shrink-0 rounded-full bg-violet-700 hover:bg-violet-600"
                  title="加入下一轮队列"
                  disabled={!input.trim() || !coachThreadId || queueMessage.isPending}
                  onClick={enqueueQueued}
                >
                  <ListOrdered className="size-3.5" />
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
          ~/.codex · queue/changed · compact · rateLimits
          {codexStatus?.message ? ` · ${codexStatus.message}` : ''}
        </p>
      </footer>
    </div>
  );
}
