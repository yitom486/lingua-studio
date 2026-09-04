import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { validator } from 'hono/validator';
import { GatewayServer } from './server.js';
import { DrizzleLearnerRepository } from './repository/drizzle-learner-repository.js';
import { SqliteLearnerRepository } from './repository/sqlite-learner-repository.js';
import {
  type WsEnvelope,
  type LearnerProfile,
  WsEventTypes,
} from '@study-studio/protocol';
import { isOk, generateId } from '@study-studio/shared';

export * from './server.js';
export * from './session/session-manager.js';
export * from './context/context-builder.js';
export * from './router/tool-router.js';
export * from './db/index.js';
export * from './repository/drizzle-learner-repository.js';
export * from './repository/sqlite-learner-repository.js';

// 持久化存储实例：在生产/开发环境下持久化到本地 study-studio.db，或使用环境变量
const dbPath = process.env.STUDY_STUDIO_DB || 'study-studio.db';
export const drizzleRepo = new DrizzleLearnerRepository(dbPath);
export const sqliteRepo = drizzleRepo; // 保持向前兼容别名
export const gatewayServer = new GatewayServer(drizzleRepo);

const PORT = Number(process.env.GATEWAY_PORT || 8080);

/**
 * Hono API 路由定义 (提供全栈 RPC 类型安全契约 GatewayAppType)
 */
export const app = new Hono()
  .use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  )
  .get('/health', (c) =>
    c.json({
      status: 'ok',
      service: 'Study Studio Agent Gateway',
      port: PORT,
      timestamp: Date.now(),
    })
  )
  .get('/api/health', (c) =>
    c.json({
      status: 'ok',
      service: 'Study Studio Agent Gateway',
      port: PORT,
      timestamp: Date.now(),
    })
  )
  // 1. 学习者全景画像与打卡进度
  .get('/api/profile/:userId', async (c) => {
    const userId = c.req.param('userId');
    const res = await drizzleRepo.getProfileSnapshot(userId);
    if (isOk(res)) return c.json(res.value);
    return c.json({ error: res.error }, 400);
  })
  .post(
    '/api/profile/:userId',
    validator('json', (value) => value as Partial<LearnerProfile>),
    async (c) => {
      const userId = c.req.param('userId');
      try {
        const body = c.req.valid('json');
        const res = await drizzleRepo.updateLearnerProfile(userId, body);
        if (isOk(res)) return c.json(res.value);
        return c.json({ error: res.error }, 400);
      } catch (e: any) {
        return c.json({ error: e?.message || 'Invalid JSON' }, 400);
      }
    }
  )
  // 2. 每日打卡与足迹进度
  .get('/api/task/progress/:userId', async (c) => {
    const userId = c.req.param('userId');
    const date = c.req.query('date') || undefined;
    const res = await drizzleRepo.getDailyTaskProgress(userId, date);
    if (isOk(res)) return c.json(res.value);
    return c.json({ error: res.error }, 400);
  })
  .post(
    '/api/task/activity/:userId',
    validator('json', (value) => value as {
      quizzes?: number;
      cards?: number;
      listeningMinutes?: number;
      mistakesResolved?: number;
      date?: string;
    }),
    async (c) => {
      const userId = c.req.param('userId');
      try {
        const body = c.req.valid('json');
        const res = await drizzleRepo.recordDailyActivity(userId, body);
        if (isOk(res)) return c.json(res.value);
        return c.json({ error: res.error }, 400);
      } catch (e: any) {
        return c.json({ error: e?.message || 'Invalid JSON' }, 400);
      }
    }
  )
  // 3. FSRS 闪卡存取
  .get('/api/cards/:userId', async (c) => {
    const userId = c.req.param('userId');
    const res = await drizzleRepo.getDueCards(userId);
    if (isOk(res)) return c.json(res.value);
    return c.json({ error: res.error }, 400);
  })
  .post(
    '/api/cards/:userId',
    validator('json', (value) => value as Record<string, unknown>[]),
    async (c) => {
      try {
        const body = c.req.valid('json');
        const cardsToSave = Array.isArray(body) ? body : [body];
        for (const card of cardsToSave) {
          await drizzleRepo.saveCard(card as any);
        }
        return c.json({ success: true, count: cardsToSave.length });
      } catch (e: any) {
        return c.json({ error: e?.message || 'Invalid JSON' }, 400);
      }
    }
  )
  // 4. 错题本存取与消除
  .get('/api/mistakes/:userId', async (c) => {
    const userId = c.req.param('userId');
    const res = await drizzleRepo.getMistakes(userId);
    if (isOk(res)) return c.json(res.value);
    return c.json({ error: res.error }, 400);
  })
  .post(
    '/api/mistakes/:userId',
    validator('json', (value) => value as Record<string, unknown>),
    async (c) => {
      try {
        const body = c.req.valid('json');
        const res = await drizzleRepo.saveMistake(body as any);
        if (isOk(res)) return c.json({ success: true });
        return c.json({ error: res.error }, 400);
      } catch (e: any) {
        return c.json({ error: e?.message || 'Invalid JSON' }, 400);
      }
    }
  )
  .post('/api/mistakes/:userId/resolve/:mistakeId', async (c) => {
    const mistakeId = c.req.param('mistakeId');
    const res = await drizzleRepo.resolveMistake(mistakeId);
    if (isOk(res)) return c.json({ success: true, mistakeId });
    return c.json({ error: res.error }, 400);
  })
  // 5. AI 自适应靶向弱项出题
  .get('/api/questions/:userId', async (c) => {
    const userId = c.req.param('userId');
    const tool = gatewayServer.toolRegistry.get('quiz.generateAdaptive');
    if (tool) {
      const toolRes = await tool.execute(
        { targetLanguage: 'ja', count: 6 },
        { userId, sessionId: 'http_req' }
      );
      if (isOk(toolRes)) {
        return c.json(((toolRes.value as any).questions ?? []) as any[]);
      }
    }
    return c.json([]);
  });

export type GatewayAppType = typeof app;

export function startGatewayServer(port = PORT) {
  const server = Bun.serve<{ sessionId?: string | undefined }>({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);

      // 1. WebSocket 升级路由 /ws
      if (url.pathname === '/ws') {
        const upgraded = server.upgrade(req, {
          data: { sessionId: undefined },
        });
        if (upgraded) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      // 2. HTTP REST 交由 Hono 驱动
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        console.log(`[Gateway WS] Client connected`);
      },
      async message(ws, message) {
        try {
          const raw = typeof message === 'string' ? message : message.toString();
          const envelope = JSON.parse(raw) as WsEnvelope;

          const res = await gatewayServer.handleClientMessage(envelope);
          if (isOk(res)) {
            ws.send(JSON.stringify(res.value));
          } else {
            const errorEnvelope: WsEnvelope = {
              version: '1.0',
              id: generateId('err'),
              sessionId: envelope.sessionId,
              type: WsEventTypes.AGENT_ERROR,
              payload: { error: res.error },
              timestamp: Date.now(),
            };
            ws.send(JSON.stringify(errorEnvelope));
          }
        } catch (e) {
          console.error('[Gateway WS] Failed to process message:', e);
        }
      },
      close(ws) {
        console.log(`[Gateway WS] Client disconnected`);
      },
    },
  });

  console.log(`🚀 Study Studio Agent Gateway (Hono + Bun WS) listening on http://localhost:${server.port}`);
  return server;
}

// 如果作为主入口直接运行，则启动服务器
if (import.meta.main) {
  startGatewayServer();
}
