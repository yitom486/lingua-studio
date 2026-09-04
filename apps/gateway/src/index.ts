import { GatewayServer } from './server.js';
import { DrizzleLearnerRepository } from './repository/drizzle-learner-repository.js';
import { SqliteLearnerRepository } from './repository/sqlite-learner-repository.js';
import {
  type WsEnvelope,
  WsEventTypes,
} from '@study-studio/protocol';
import { isOk, generateId, nowIso } from '@study-studio/shared';

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

export function startGatewayServer(port = PORT) {
  const server = Bun.serve<{ sessionId?: string | undefined }>({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);

      // CORS 头处理
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };

      if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // 1. WebSocket 升级路由 /ws
      if (url.pathname === '/ws') {
        const upgraded = server.upgrade(req, {
          data: { sessionId: undefined },
        });
        if (upgraded) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      // 2. HTTP 健康检查端点
      if (url.pathname === '/health' || url.pathname === '/api/health') {
        return Response.json(
          {
            status: 'ok',
            service: 'Study Studio Agent Gateway',
            port,
            timestamp: Date.now(),
          },
          { headers: corsHeaders }
        );
      }

      // 3. HTTP 学习者画像快照与更新端点
      if (url.pathname.startsWith('/api/profile/')) {
        const userId = url.pathname.replace('/api/profile/', '');
        if (req.method === 'POST') {
          try {
            const body = await req.json();
            const res = await drizzleRepo.updateLearnerProfile(userId, body);
            if (isOk(res)) return Response.json(res.value, { headers: corsHeaders });
            return Response.json({ error: res.error }, { status: 400, headers: corsHeaders });
          } catch (e: any) {
            return Response.json({ error: e?.message || 'Invalid JSON' }, { status: 400, headers: corsHeaders });
          }
        } else {
          const res = await drizzleRepo.getProfileSnapshot(userId);
          if (isOk(res)) return Response.json(res.value, { headers: corsHeaders });
          return Response.json({ error: res.error }, { status: 400, headers: corsHeaders });
        }
      }

      // 4. HTTP 每日打卡与足迹进度端点
      if (url.pathname.startsWith('/api/task/progress/')) {
        const userId = url.pathname.replace('/api/task/progress/', '');
        const date = url.searchParams.get('date') || undefined;
        const res = await drizzleRepo.getDailyTaskProgress(userId, date);
        if (isOk(res)) return Response.json(res.value, { headers: corsHeaders });
        return Response.json({ error: res.error }, { status: 400, headers: corsHeaders });
      }

      // 5. HTTP 记录足迹打卡端点
      if (url.pathname.startsWith('/api/task/activity/')) {
        const userId = url.pathname.replace('/api/task/activity/', '');
        try {
          const body = await req.json();
          const res = await drizzleRepo.recordDailyActivity(userId, body);
          if (isOk(res)) return Response.json(res.value, { headers: corsHeaders });
          return Response.json({ error: res.error }, { status: 400, headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e?.message || 'Invalid JSON' }, { status: 400, headers: corsHeaders });
        }
      }

      return new Response('Study Studio Gateway Running. Connect via /ws', {
        status: 200,
        headers: corsHeaders,
      });
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

  console.log(`🚀 Study Studio Agent Gateway listening on http://localhost:${server.port}`);
  return server;
}

// 如果作为主入口直接运行，则启动服务器
if (import.meta.main) {
  startGatewayServer();
}
