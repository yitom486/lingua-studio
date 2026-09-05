import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  WsEventTypes,
  type WsEventType,
  type WsEnvelope,
  type CardReviewRating,
  type GeneratedQuestion,
} from '@study-studio/protocol';
import { generateId } from '@study-studio/shared';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';

export interface StreamTurnOptions {
  input: string;
  intent?: 'EXPLAIN' | 'GENERATE_QUIZ' | 'GRADE' | 'DRILL_KANA' | 'REVIEW_MISTAKES' | 'FREE_COACH' | undefined;
  contextSnapshot?: any;
  agentOptions?: {
    model?: string;
    preferCodex?: boolean;
    effort?: string;
    approvalPolicy?: string;
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
    toolResults?: any;
    source?: string;
    model?: string;
  }) => void;
  onError?: (err: any) => void;
}

interface UseGatewayOptions {
  url?: string;
  userId?: string;
  autoConnect?: boolean;
}

export function useGateway({
  url = 'ws://localhost:8080/ws',
  userId = 'student_web_01',
  autoConnect = true,
}: UseGatewayOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<any>(null);
  const pingSentTimeRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<any>(null);

  const activeStreamRef = useRef<{
    onStart?: (() => void) | undefined;
    onDelta: (delta: string, accumulated: string) => void;
    onReasoningDelta?: ((delta: string, accumulated: string) => void) | undefined;
    onToolCall?: ((info: {
      callId?: string;
      toolName: string;
      arguments?: Record<string, unknown>;
    }) => void) | undefined;
    onApprovalRequest?: ((info: {
      approvalId: string;
      action: string;
      description: string;
      riskLevel: string;
      expiresAt?: number;
    }) => void) | undefined;
    onApprovalResolved?: ((info: {
      approvalId: string;
      decision: string;
      reason?: string;
    }) => void) | undefined;
    onComplete: (data: any) => void;
    onError?: ((err: any) => void) | undefined;
    accumulatedText: string;
    accumulatedReasoning: string;
  } | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setIsConnecting(true);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

        // 建立会话：使用当前学情档案的目标语种，禁止写死 en 覆盖用户选择
        const profileLang =
          useUserProfileStore.getState().profile.targetLanguage || 'en';
        const initEnvelope: WsEnvelope = {
          version: '1.0',
          id: generateId('msg'),
          sessionId: 'init_req',
          type: WsEventTypes.CLIENT_SESSION_INIT,
          payload: {
            userId,
            targetLanguage: profileLang,
            targetLevel: useUserProfileStore.getState().profile.overallLevel || 'B1',
          },
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(initEnvelope));

        // 启动心跳探测
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingSentTimeRef.current = Date.now();
            const ping: WsEnvelope = {
              version: '1.0',
              id: generateId('msg'),
              sessionId: sessionIdRef.current ?? 'active_session',
              type: WsEventTypes.CLIENT_PING,
              payload: {},
              timestamp: Date.now(),
            };
            ws.send(JSON.stringify(ping));
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data.toString()) as WsEnvelope;

          if (envelope.type === WsEventTypes.AGENT_TURN_START) {
            activeStreamRef.current?.onStart?.();
          } else if (envelope.type === WsEventTypes.AGENT_TEXT_DELTA) {
            if (activeStreamRef.current) {
              const p = envelope.payload as any;
              const delta = p?.delta || p?.textDelta || '';
              activeStreamRef.current.accumulatedText += delta;
              activeStreamRef.current.onDelta(delta, activeStreamRef.current.accumulatedText);
            }
          } else if (envelope.type === WsEventTypes.AGENT_REASONING_DELTA) {
            if (activeStreamRef.current) {
              const p = envelope.payload as any;
              const delta = p?.delta || '';
              activeStreamRef.current.accumulatedReasoning += delta;
              activeStreamRef.current.onReasoningDelta?.(
                delta,
                activeStreamRef.current.accumulatedReasoning
              );
            }
          } else if (envelope.type === WsEventTypes.AGENT_TURN_COMPLETED) {
            if ((envelope.payload as any)?.status === 'APPROVAL_ACK') {
              // 审批回执不结束当前 Turn 流
              return;
            }
            if (activeStreamRef.current) {
              const listener = activeStreamRef.current;
              activeStreamRef.current = null;
              listener.onComplete(envelope.payload);
            }
            if ((envelope.payload as any)?.status === 'INITIALIZED') {
              sessionIdRef.current = envelope.sessionId;
              setSessionId(envelope.sessionId);
            } else if (Array.isArray((envelope.payload as any)?.questions)) {
              const resolver = pendingResolversRef.current.get(WsEventTypes.CLIENT_QUIZ_GENERATE);
              if (resolver) {
                pendingResolversRef.current.delete(WsEventTypes.CLIENT_QUIZ_GENERATE);
                resolver(envelope.payload);
              }
            } else if ((envelope.payload as any)?.refinementSuggestion !== undefined || (envelope.payload as any)?.errorDiagnosis !== undefined) {
              const resolver = pendingResolversRef.current.get(WsEventTypes.CLIENT_QUIZ_GRADE_SUBJECTIVE);
              if (resolver) {
                pendingResolversRef.current.delete(WsEventTypes.CLIENT_QUIZ_GRADE_SUBJECTIVE);
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
              activeStreamRef.current?.onApprovalRequest?.({
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
              activeStreamRef.current?.onApprovalResolved?.({
                approvalId: p.approvalId,
                decision: p.decision,
                ...(p.reason ? { reason: p.reason } : {}),
              });
            }
          } else if (envelope.type === WsEventTypes.AGENT_TOOL_CALL) {
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
              activeStreamRef.current?.onToolCall?.(toolInfo);
            }
            const session = useStudySessionStore.getState();

            if (toolName === 'ui.navigate') {
              session.applyUiNavigate(
                String(args.target ?? ''),
                Boolean(args.openTutor)
              );
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

            // 回传 Client Tool 结果（当前无服务端等待，静默 ACK）
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              const ack: WsEnvelope = {
                version: '1.0',
                id: generateId('msg'),
                sessionId: sessionIdRef.current ?? 'active_session',
                type: WsEventTypes.CLIENT_TOOL_RESULT,
                payload: {
                  callId: p?.callId,
                  toolName,
                  ok: true,
                },
                timestamp: Date.now(),
              };
              wsRef.current.send(JSON.stringify(ack));
            }
          } else if (envelope.type === WsEventTypes.GATEWAY_PONG) {
            if (pingSentTimeRef.current > 0) {
              setLatencyMs(Date.now() - pingSentTimeRef.current);
            }
          } else if (envelope.type === WsEventTypes.AGENT_ERROR) {
            if (activeStreamRef.current) {
              const listener = activeStreamRef.current;
              activeStreamRef.current = null;
              listener.onError?.(envelope.payload);
            }
            const errPayload = (envelope.payload as any)?.error;
            const userMsg =
              typeof errPayload === 'string'
                ? errPayload
                : errPayload?.userMessage || 'AI 学习助手遇到了一点小问题，请稍后重试。';
            toast.error(userMsg);
          }
        } catch {}
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        if (autoConnect) {
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
        setIsConnecting(false);
      };
    } catch {
      setIsConnected(false);
      setIsConnecting(false);
      if (autoConnect) {
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    }
  }, [url, userId, autoConnect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      ws.close();
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const sendEnvelope = useCallback(
    (type: WsEventType, payload: unknown) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;

      const envelope: WsEnvelope = {
        version: '1.0',
        id: generateId('msg'),
        sessionId: sessionIdRef.current ?? 'active_session',
        type,
        payload,
        timestamp: Date.now(),
      };

      wsRef.current.send(JSON.stringify(envelope));
      return true;
    },
    []
  );

  const submitQuizToGateway = useCallback(
    (data: {
      questionId: string;
      userAnswer: string;
      isCorrect: boolean;
      score: number;
      timeSpentMs: number;
      testedSkillId: string;
      questionContent?: string;
      correctAnswer?: string;
      explanation?: string;
    }) => {
      return sendEnvelope(WsEventTypes.CLIENT_QUIZ_SUBMIT, {
        userId,
        ...data,
      });
    },
    [sendEnvelope, userId]
  );

  const reviewCardToGateway = useCallback(
    (data: {
      cardId: string;
      rating: CardReviewRating;
      currentStability?: number;
      currentReps?: number;
    }) => {
      return sendEnvelope(WsEventTypes.CLIENT_CARD_REVIEW, {
        userId,
        ...data,
      });
    },
    [sendEnvelope, userId]
  );

  const pendingResolversRef = useRef<Map<string, (val: any) => void>>(new Map());

  const sendRequest = useCallback(
    <T = any>(type: WsEventType, payload: unknown): Promise<T> => {
      return new Promise((resolve, reject) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reject(new Error('Gateway is not connected'));
          return;
        }

        const msgId = generateId('req');
        const envelope: WsEnvelope = {
          version: '1.0',
          id: msgId,
          sessionId: sessionIdRef.current ?? 'active_session',
          type,
          payload,
          timestamp: Date.now(),
        };

        pendingResolversRef.current.set(type, resolve);
        wsRef.current.send(JSON.stringify(envelope));

        // 6 秒超时防挂死
        setTimeout(() => {
          if (pendingResolversRef.current.has(type)) {
            pendingResolversRef.current.delete(type);
            reject(new Error('Gateway request timed out'));
          }
        }, 6000);
      });
    },
    []
  );

  const generateAdaptiveQuiz = useCallback(
    async (options?: { weaknessSkillId?: string; count?: number }) => {
      const profile = useUserProfileStore.getState().profile;
      return sendRequest(WsEventTypes.CLIENT_QUIZ_GENERATE, {
        userId,
        targetLanguage: profile.targetLanguage || 'en',
        targetLevel: profile.overallLevel || 'CEFR B1',
        ...options,
      });
    },
    [sendRequest, userId]
  );

  const gradeSubjectiveQuiz = useCallback(
    async (data: {
      questionId: string;
      prompt: string;
      standardAnswer: string;
      userSubmission: string;
      testedSkillId: string;
      contextSentence?: string;
    }) => {
      return sendRequest(WsEventTypes.CLIENT_QUIZ_GRADE_SUBJECTIVE, {
        userId,
        ...data,
      });
    },
    [sendRequest, userId]
  );

  useEffect(() => {
    if (!autoConnect) return;

    const start = () => {
      connect();
    };

    // 等学情档案从 localStorage 水合后再连 WS，避免用默认 en 覆盖用户轨道
    if (useUserProfileStore.persist.hasHydrated()) {
      start();
    } else {
      const unsub = useUserProfileStore.persist.onFinishHydration(start);
      return () => {
        unsub();
        disconnect();
      };
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  const sendTurnStream = useCallback(
    (options: StreamTurnOptions) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        options.onError?.(new Error('Gateway is not connected'));
        return false;
      }

      activeStreamRef.current = {
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

      const envelope: WsEnvelope = {
        version: '1.0',
        id: generateId('turn_req'),
        sessionId: sessionIdRef.current ?? 'active_session',
        type: WsEventTypes.CLIENT_TURN_SEND,
        payload: {
          userId,
          input: options.input,
          intent: options.intent ?? 'EXPLAIN',
          contextSnapshot: options.contextSnapshot,
          agentOptions: options.agentOptions,
        },
        timestamp: Date.now(),
      };

      wsRef.current.send(JSON.stringify(envelope));
      return true;
    },
    [userId]
  );

  const interruptTurn = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;

    const envelope: WsEnvelope = {
      version: '1.0',
      id: generateId('int_req'),
      sessionId: sessionIdRef.current ?? 'active_session',
      type: WsEventTypes.CLIENT_TURN_INTERRUPT,
      payload: {},
      timestamp: Date.now(),
    };

    wsRef.current.send(JSON.stringify(envelope));
    return true;
  }, []);

  const respondApproval = useCallback(
    (
      approvalId: string,
      decision: boolean | 'accept' | 'acceptForSession' | 'decline' | 'cancel'
    ) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
      const normalized =
        typeof decision === 'boolean'
          ? decision
            ? 'accept'
            : 'decline'
          : decision;
      const envelope: WsEnvelope = {
        version: '1.0',
        id: generateId('appr_req'),
        sessionId: sessionIdRef.current ?? 'active_session',
        type: WsEventTypes.CLIENT_APPROVAL_RESPOND,
        payload: {
          approvalId,
          decision: normalized,
          approved:
            normalized === 'accept' || normalized === 'acceptForSession',
        },
        timestamp: Date.now(),
      };
      wsRef.current.send(JSON.stringify(envelope));
      return true;
    },
    []
  );

  return {
    isConnected,
    isConnecting,
    sessionId,
    latencyMs,
    connect,
    disconnect,
    submitQuizToGateway,
    reviewCardToGateway,
    generateAdaptiveQuiz,
    gradeSubjectiveQuiz,
    sendTurnStream,
    interruptTurn,
    respondApproval,
  };
}
