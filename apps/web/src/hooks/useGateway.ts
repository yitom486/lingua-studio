import { useState, useEffect, useRef, useCallback } from 'react';
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
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<Timer | null>(null);
  const pingSentTimeRef = useRef<number>(0);

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
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingSentTimeRef.current = Date.now();
            const ping: WsEnvelope = {
              version: '1.0',
              id: generateId('msg'),
              sessionId: sessionId ?? 'active_session',
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

          if (envelope.type === WsEventTypes.AGENT_TURN_COMPLETED && (envelope.payload as any)?.status === 'INITIALIZED') {
            setSessionId(envelope.sessionId);
          } else if (envelope.type === WsEventTypes.GATEWAY_PONG) {
            if (pingSentTimeRef.current > 0) {
              setLatencyMs(Date.now() - pingSentTimeRef.current);
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      };

      ws.onerror = () => {
        setIsConnected(false);
        setIsConnecting(false);
      };
    } catch {
      setIsConnected(false);
      setIsConnecting(false);
    }
  }, [url, userId, sessionId]);

  const disconnect = useCallback(() => {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
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
        sessionId: sessionId ?? 'active_session',
        type,
        payload,
        timestamp: Date.now(),
      };

      wsRef.current.send(JSON.stringify(envelope));
      return true;
    },
    [sessionId]
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
  };
}
