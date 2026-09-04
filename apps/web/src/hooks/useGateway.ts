import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  WsEventTypes,
  type WsEventType,
  type WsEnvelope,
  type CardReviewRating,
} from '@study-studio/protocol';
import { generateId } from '@study-studio/shared';

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

        // 建立会话
        const initEnvelope: WsEnvelope = {
          version: '1.0',
          id: generateId('msg'),
          sessionId: 'init_req',
          type: WsEventTypes.CLIENT_SESSION_INIT,
          payload: { userId, targetLanguage: 'ja', targetLevel: 'N3' },
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

          if (envelope.type === WsEventTypes.AGENT_TURN_COMPLETED) {
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
          } else if (envelope.type === WsEventTypes.GATEWAY_PONG) {
            if (pingSentTimeRef.current > 0) {
              setLatencyMs(Date.now() - pingSentTimeRef.current);
            }
          } else if (envelope.type === WsEventTypes.AGENT_ERROR) {
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
      return sendRequest(WsEventTypes.CLIENT_QUIZ_GENERATE, {
        userId,
        targetLanguage: 'ja',
        targetLevel: 'JLPT N3',
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
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

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
  };
}
