import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startGatewayServer } from '../index.js';
import { WsEventTypes, type WsEnvelope } from '@study-studio/protocol';
import { generateId } from '@study-studio/shared';

describe('Gateway WebSocket Server E2E', () => {
  const TEST_PORT = 8999;
  let server: ReturnType<typeof startGatewayServer>;

  beforeAll(() => {
    server = startGatewayServer(TEST_PORT);
  });

  afterAll(() => {
    server.stop(true);
  });

  it('should respond to HTTP health check', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('Study Studio Agent Gateway');
  });

  it('should establish WebSocket connection and handle session init + ping + quiz submit', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
    });

    let activeSessionId = '';

    // 1. 发送 session.init
    const initEnvelope: WsEnvelope = {
      version: '1.0',
      id: generateId('msg'),
      sessionId: 'temp_init',
      type: WsEventTypes.CLIENT_SESSION_INIT,
      payload: { userId: 'student_e2e', targetLanguage: 'ja', targetLevel: 'N3' },
      timestamp: Date.now(),
    };

    const initReplyPromise = new Promise<WsEnvelope>((resolve) => {
      const handler = (evt: MessageEvent) => {
        const data = JSON.parse(evt.data.toString()) as WsEnvelope;
        if ((data.payload as any)?.status === 'INITIALIZED') {
          ws.removeEventListener('message', handler);
          resolve(data);
        }
      };
      ws.addEventListener('message', handler);
    });

    ws.send(JSON.stringify(initEnvelope));
    const initReply = await initReplyPromise;
    expect(initReply.type).toBe(WsEventTypes.AGENT_TURN_COMPLETED);
    expect(initReply.sessionId).toBeDefined();
    activeSessionId = initReply.sessionId;

    // 2. 发送 ping
    const pingEnvelope: WsEnvelope = {
      version: '1.0',
      id: generateId('msg'),
      sessionId: activeSessionId,
      type: WsEventTypes.CLIENT_PING,
      payload: {},
      timestamp: Date.now(),
    };

    const pongPromise = new Promise<WsEnvelope>((resolve) => {
      const handler = (evt: MessageEvent) => {
        const data = JSON.parse(evt.data.toString()) as WsEnvelope;
        if (data.type === WsEventTypes.GATEWAY_PONG) {
          ws.removeEventListener('message', handler);
          resolve(data);
        }
      };
      ws.addEventListener('message', handler);
    });

    ws.send(JSON.stringify(pingEnvelope));
    const pongReply = await pongPromise;
    expect(pongReply.type).toBe(WsEventTypes.GATEWAY_PONG);

    // 3. 发送 quiz.submit 并验证写入 SQLite
    const quizEnvelope: WsEnvelope = {
      version: '1.0',
      id: generateId('msg'),
      sessionId: activeSessionId,
      type: WsEventTypes.CLIENT_QUIZ_SUBMIT,
      payload: {
        userId: 'student_e2e',
        questionId: 'q_ws_test',
        userAnswer: 'A',
        isCorrect: true,
        score: 1.0,
        timeSpentMs: 2500,
        testedSkillId: 'jp.particle.wa',
      },
      timestamp: Date.now(),
    };

    const quizPromise = new Promise<WsEnvelope>((resolve) => {
      const handler = (evt: MessageEvent) => {
        const data = JSON.parse(evt.data.toString()) as WsEnvelope;
        if ((data.payload as any)?.status === 'RECORDED') {
          ws.removeEventListener('message', handler);
          resolve(data);
        }
      };
      ws.addEventListener('message', handler);
    });

    ws.send(JSON.stringify(quizEnvelope));
    const quizReply = await quizPromise;
    expect((quizReply.payload as any)?.persistedToDb).toBe(true);

    ws.close();
  });
});
