import { toast } from 'sonner';
import {
  WsEventTypes,
  type WsEventType,
  type WsEnvelope,
  type CardReviewRating,
  type GeneratedQuestion,
} from '@study-studio/protocol';
import { generateId } from '@study-studio/shared';
import { useGatewayStore } from '../stores/useGatewayStore.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';

export const DEFAULT_GATEWAY_WS_URL = 'ws://localhost:8080/ws';
export const DEFAULT_GATEWAY_USER_ID = 'student_web_01';

export interface StreamTurnOptions {
  input: string;
  intent?:
    | 'EXPLAIN'
    | 'GENERATE_QUIZ'
    | 'GRADE'
    | 'DRILL_KANA'
    | 'REVIEW_MISTAKES'
    | 'FREE_COACH'
    | undefined;
  contextSnapshot?: unknown;
  agentOptions?: {
    model?: string;
    preferCodex?: boolean;
    effort?: string;
    approvalPolicy?: string;
    threadId?: string;
    ephemeral?: boolean;
    collaborationMode?: string;
  };
  onStart?: () => void;
  onDelta: (delta: string, accumulated: string) => void;
  onReasoningDelta?: (delta: string, accumulated: string) => void;
  onToolCall?: (info: {
    callId?: string;
    toolName: string;
    arguments?: Record<string, unknown>;
  }) => void;
  onApprovalRequest?: (info: {
    approvalId: string;
    action: string;
    description: string;
    riskLevel: string;
    expiresAt?: number;
  }) => void;
  onApprovalResolved?: (info: {
    approvalId: string;
    decision: string;
    reason?: string;
  }) => void;
  onComplete: (data: {
    status: 'COMPLETED' | 'INTERRUPTED';
    finalOutput: string;
    toolResults?: unknown;
    source?: string;
    model?: string;
    threadId?: string;
  }) => void;
  onError?: (err: unknown) => void;
}

export interface QuizSubmitPayload {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  score: number;
  timeSpentMs: number;
  testedSkillId: string;
  questionContent?: string;
  correctAnswer?: string;
  explanation?: string;
}

export interface CardReviewPayload {
  cardId: string;
  rating: CardReviewRating;
  currentStability?: number;
  currentReps?: number;
}

export interface SubjectiveGradePayload {
  questionId: string;
  prompt: string;
  standardAnswer: string;
  userSubmission: string;
  testedSkillId: string;
  contextSentence?: string;
}

type ActiveStream = {
  onStart?: (() => void) | undefined;
  onDelta: (delta: string, accumulated: string) => void;
  onReasoningDelta?: ((delta: string, accumulated: string) => void) | undefined;
  onToolCall?: ((info: {
    callId?: string;
    toolName: string;
    arguments?: Record<string, unknown>;
  }) => void) | undefined;
  onApprovalRequest?: StreamTurnOptions['onApprovalRequest'];
  onApprovalResolved?: StreamTurnOptions['onApprovalResolved'];
  onComplete: (data: any) => void;
  onError?: ((err: any) => void) | undefined;
  accumulatedText: string;
  accumulatedReasoning: string;
};

export interface GatewayClientOptions {
  url?: string;
  userId?: string;
  autoConnect?: boolean;
}

/**
 * 无 React 的 Gateway WS 单例：连接 / 会话 / 流式 Turn / 学习命令。
 * UI 经 Zustand（连接态）+ hooks / TanStack Mutation 消费，禁止业务组件自建 WebSocket。
 */
export class GatewayClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pingSentAt = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private activeStream: ActiveStream | null = null;
  private pendingResolvers = new Map<string, (val: unknown) => void>();
  private started = false;
  private options: Required<GatewayClientOptions> = {
    url: DEFAULT_GATEWAY_WS_URL,
    userId: DEFAULT_GATEWAY_USER_ID,
    autoConnect: true,
  };

  public configure(opts: GatewayClientOptions = {}): void {
    this.options = {
      url: opts.url ?? this.options.url,
      userId: opts.userId ?? this.options.userId,
      autoConnect: opts.autoConnect ?? this.options.autoConnect,
    };
  }

  /** App 根挂载一次：等档案水合后再连，避免默认 en 抢跑 */
  public start(opts?: GatewayClientOptions): void {
    if (opts) this.configure(opts);
    if (this.started) return;
    this.started = true;

    const boot = () => {
      if (this.options.autoConnect) this.connect();
    };

    if (useUserProfileStore.persist.hasHydrated()) {
      boot();
      return;
    }
    useUserProfileStore.persist.onFinishHydration(boot);
  }

  public stop(): void {
    this.started = false;
    this.disconnect({ clearReconnect: true });
  }

  public get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    useGatewayStore.getState().patch({ isConnecting: true, lastError: null });

    try {
      const ws = new WebSocket(this.options.url);
      this.ws = ws;

      ws.onopen = () => {
        useGatewayStore.getState().patch({
          isConnected: true,
          isConnecting: false,
          lastError: null,
        });
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }

        const profile = useUserProfileStore.getState().profile;
        this.sendRaw({
          version: '1.0',
          id: generateId('msg'),
          sessionId: 'init_req',
          type: WsEventTypes.CLIENT_SESSION_INIT,
          payload: {
            userId: this.options.userId,
            targetLanguage: profile.targetLanguage || 'en',
            targetLevel: profile.overallLevel || 'B1',
          },
          timestamp: Date.now(),
        });

        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            this.pingSentAt = Date.now();
            this.sendRaw({
              version: '1.0',
              id: generateId('msg'),
              sessionId: this.sessionId ?? 'active_session',
              type: WsEventTypes.CLIENT_PING,
              payload: {},
              timestamp: Date.now(),
            });
          }
        }, 15_000);
      };

      ws.onmessage = (event) => {
        this.handleMessage(event.data.toString());
      };

      ws.onclose = () => {
        useGatewayStore.getState().patch({
          isConnected: false,
          isConnecting: false,
        });
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        if (this.options.autoConnect && this.started) {
          if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
        }
      };

      ws.onerror = () => {
        useGatewayStore.getState().patch({
          isConnected: false,
          isConnecting: false,
          lastError: 'Gateway WebSocket 连接异常',
        });
      };
    } catch {
      useGatewayStore.getState().patch({
        isConnected: false,
        isConnecting: false,
        lastError: '无法创建 Gateway 连接',
      });
      if (this.options.autoConnect && this.started) {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
      }
    }
  }

  public disconnect(opts?: { clearReconnect?: boolean }): void {
    if (opts?.clearReconnect !== false && this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.close();
    }
    useGatewayStore.getState().patch({
      isConnected: false,
      isConnecting: false,
    });
  }

  public sendEnvelope(type: WsEventType, payload: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.sendRaw({
      version: '1.0',
      id: generateId('msg'),
      sessionId: this.sessionId ?? 'active_session',
      type,
      payload,
      timestamp: Date.now(),
    });
    return true;
  }

  public submitQuiz(data: QuizSubmitPayload): boolean {
    return this.sendEnvelope(WsEventTypes.CLIENT_QUIZ_SUBMIT, {
      userId: this.options.userId,
      ...data,
    });
  }

  public reviewCard(data: CardReviewPayload): boolean {
    return this.sendEnvelope(WsEventTypes.CLIENT_CARD_REVIEW, {
      userId: this.options.userId,
      ...data,
    });
  }

  public async generateAdaptiveQuiz(options?: {
    weaknessSkillId?: string;
    count?: number;
  }): Promise<unknown> {
    const profile = useUserProfileStore.getState().profile;
    return this.sendRequest(WsEventTypes.CLIENT_QUIZ_GENERATE, {
      userId: this.options.userId,
      targetLanguage: profile.targetLanguage || 'en',
      targetLevel: profile.overallLevel || 'CEFR B1',
      ...options,
    });
  }

  public async gradeSubjectiveQuiz(data: SubjectiveGradePayload): Promise<unknown> {
    return this.sendRequest(WsEventTypes.CLIENT_QUIZ_GRADE_SUBJECTIVE, {
      userId: this.options.userId,
      ...data,
    });
  }

  public sendTurnStream(options: StreamTurnOptions): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      options.onError?.(new Error('Gateway is not connected'));
      return false;
    }

    this.activeStream = {
      onStart: options.onStart,
      onDelta: options.onDelta,
      onReasoningDelta: options.onReasoningDelta,
      onToolCall: options.onToolCall,
      onApprovalRequest: options.onApprovalRequest,
      onApprovalResolved: options.onApprovalResolved,
      onComplete: options.onComplete,
      onError: options.onError,
      accumulatedText: '',
      accumulatedReasoning: '',
    };

    this.sendRaw({
      version: '1.0',
      id: generateId('turn_req'),
      sessionId: this.sessionId ?? 'active_session',
      type: WsEventTypes.CLIENT_TURN_SEND,
      payload: {
        userId: this.options.userId,
        input: options.input,
        intent: options.intent ?? 'EXPLAIN',
        contextSnapshot: options.contextSnapshot,
        agentOptions: options.agentOptions,
      },
      timestamp: Date.now(),
    });
    return true;
  }

  public interruptTurn(): boolean {
    return this.sendEnvelope(WsEventTypes.CLIENT_TURN_INTERRUPT, {});
  }

  public steerTurn(message: string): boolean {
    const text = message.trim();
    if (!text) return false;
    return this.sendEnvelope(WsEventTypes.CLIENT_TURN_STEER, { input: text });
  }

  public respondApproval(
    approvalId: string,
    decision: boolean | 'accept' | 'acceptForSession' | 'decline' | 'cancel'
  ): boolean {
    const normalized =
      typeof decision === 'boolean' ? (decision ? 'accept' : 'decline') : decision;
    return this.sendEnvelope(WsEventTypes.CLIENT_APPROVAL_RESPOND, {
      approvalId,
      decision: normalized,
      approved: normalized === 'accept' || normalized === 'acceptForSession',
    });
  }

  private sendRaw(envelope: WsEnvelope): void {
    this.ws?.send(JSON.stringify(envelope));
  }

  private sendRequest<T = unknown>(type: WsEventType, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Gateway is not connected'));
        return;
      }

      this.pendingResolvers.set(type, resolve as (val: unknown) => void);
      this.sendRaw({
        version: '1.0',
        id: generateId('req'),
        sessionId: this.sessionId ?? 'active_session',
        type,
        payload,
        timestamp: Date.now(),
      });

      setTimeout(() => {
        if (this.pendingResolvers.has(type)) {
          this.pendingResolvers.delete(type);
          reject(new Error('Gateway request timed out'));
        }
      }, 6000);
    });
  }

  private handleMessage(raw: string): void {
    try {
      const envelope = JSON.parse(raw) as WsEnvelope;

      if (envelope.type === WsEventTypes.AGENT_TURN_START) {
        this.activeStream?.onStart?.();
      } else if (envelope.type === WsEventTypes.AGENT_TEXT_DELTA) {
        if (this.activeStream) {
          const p = envelope.payload as any;
          const delta = p?.delta || p?.textDelta || '';
          this.activeStream.accumulatedText += delta;
          this.activeStream.onDelta(delta, this.activeStream.accumulatedText);
        }
      } else if (envelope.type === WsEventTypes.AGENT_REASONING_DELTA) {
        if (this.activeStream) {
          const p = envelope.payload as any;
          const delta = p?.delta || '';
          this.activeStream.accumulatedReasoning += delta;
          this.activeStream.onReasoningDelta?.(
            delta,
            this.activeStream.accumulatedReasoning
          );
        }
      } else if (envelope.type === WsEventTypes.AGENT_TURN_COMPLETED) {
        const status = (envelope.payload as any)?.status;
        if (status === 'APPROVAL_ACK' || status === 'STEER_ACK') return;

        if (this.activeStream) {
          const listener = this.activeStream;
          this.activeStream = null;
          listener.onComplete(envelope.payload);
        }

        if (status === 'INITIALIZED') {
          this.sessionId = envelope.sessionId;
          useGatewayStore.getState().setSessionId(envelope.sessionId);
        } else if (Array.isArray((envelope.payload as any)?.questions)) {
          const resolver = this.pendingResolvers.get(WsEventTypes.CLIENT_QUIZ_GENERATE);
          if (resolver) {
            this.pendingResolvers.delete(WsEventTypes.CLIENT_QUIZ_GENERATE);
            resolver(envelope.payload);
          }
        } else if (
          (envelope.payload as any)?.refinementSuggestion !== undefined ||
          (envelope.payload as any)?.errorDiagnosis !== undefined
        ) {
          const resolver = this.pendingResolvers.get(
            WsEventTypes.CLIENT_QUIZ_GRADE_SUBJECTIVE
          );
          if (resolver) {
            this.pendingResolvers.delete(WsEventTypes.CLIENT_QUIZ_GRADE_SUBJECTIVE);
            resolver(envelope.payload);
          }
        }
      } else if (envelope.type === WsEventTypes.AGENT_APPROVAL_REQUEST) {
        const p = envelope.payload as {
          approvalId?: string;
          action?: string;
          description?: string;
          riskLevel?: string;
          expiresAt?: number;
        };
        if (p?.approvalId) {
          this.activeStream?.onApprovalRequest?.({
            approvalId: p.approvalId,
            action: String(p.action || 'action'),
            description: String(p.description || ''),
            riskLevel: String(p.riskLevel || 'medium'),
            ...(typeof p.expiresAt === 'number' ? { expiresAt: p.expiresAt } : {}),
          });
        }
      } else if (envelope.type === WsEventTypes.AGENT_APPROVAL_RESOLVED) {
        const p = envelope.payload as {
          approvalId?: string;
          decision?: string;
          reason?: string;
        };
        if (p?.approvalId && p.decision) {
          this.activeStream?.onApprovalResolved?.({
            approvalId: p.approvalId,
            decision: p.decision,
            ...(p.reason ? { reason: p.reason } : {}),
          });
        }
      } else if (envelope.type === WsEventTypes.AGENT_TOOL_CALL) {
        this.handleToolCall(envelope);
      } else if (envelope.type === WsEventTypes.GATEWAY_PONG) {
        if (this.pingSentAt > 0) {
          useGatewayStore.getState().setLatencyMs(Date.now() - this.pingSentAt);
        }
      } else if (envelope.type === WsEventTypes.AGENT_ERROR) {
        if (this.activeStream) {
          const listener = this.activeStream;
          this.activeStream = null;
          listener.onError?.(envelope.payload);
        }
        const errPayload = (envelope.payload as any)?.error;
        const userMsg =
          typeof errPayload === 'string'
            ? errPayload
            : errPayload?.userMessage || 'AI 学习助手遇到了一点小问题，请稍后重试。';
        toast.error(userMsg);
      }
    } catch {
      // 忽略畸形帧
    }
  }

  private handleToolCall(envelope: WsEnvelope): void {
    const p = envelope.payload as {
      callId?: string;
      toolName?: string;
      args?: Record<string, unknown>;
      arguments?: Record<string, unknown>;
    };
    const toolName = p?.toolName;
    const args = p?.args ?? p?.arguments ?? {};
    if (toolName) {
      const toolInfo: {
        toolName: string;
        callId?: string;
        arguments?: Record<string, unknown>;
      } = { toolName };
      if (p.callId) toolInfo.callId = p.callId;
      if (Object.keys(args).length) toolInfo.arguments = args;
      this.activeStream?.onToolCall?.(toolInfo);
    }

    const session = useStudySessionStore.getState();
    if (toolName === 'ui.navigate') {
      session.applyUiNavigate(String(args.target ?? ''), Boolean(args.openTutor));
      toast.success(`已切换到 ${String(args.target ?? '工作台')}`);
    } else if (toolName === 'ui.present') {
      const questions = Array.isArray(args.questions)
        ? (args.questions as GeneratedQuestion[])
        : [];
      if (questions.length > 0) {
        session.presentQuiz({
          surface: (args.surface as 'quiz') || 'quiz',
          layout: args.layout as 'SINGLE_COLUMN' | undefined,
          collectionId: args.collectionId as string | undefined,
          questions,
          stepIndex: typeof args.stepIndex === 'number' ? args.stepIndex : 0,
          passageId: args.passageId as string | undefined,
        });
        toast.success(`已推送 ${questions.length} 道练习到工作台`);
      }
    }

    this.sendEnvelope(WsEventTypes.CLIENT_TOOL_RESULT, {
      callId: p?.callId,
      toolName,
      ok: true,
    });
  }
}

/** 全应用共享的 Gateway 连接实例 */
export const gatewayClient = new GatewayClient();
