import { GatewayServer } from './server.js';
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
export * from './repository/sqlite-learner-repository.js';

// 持久化存储实例：在生产/开发环境下持久化到本地 study-studio.db，或使用环境变量
const dbPath = process.env.STUDY_STUDIO_DB || 'study-studio.db';
export const sqliteRepo = new SqliteLearnerRepository(dbPath);
export const gatewayServer = new GatewayServer(sqliteRepo);

const PORT = Number(process.env.GATEWAY_PORT || 8080);

export function startGatewayServer(port = PORT) {
  const server = Bun.serve<{ sessionId?: string | undefined }>({
    port,
    fetch(req, server) {
      const url = new URL(req.url);

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
        return Response.json({
          status: 'ok',
          service: 'Study Studio Agent Gateway',
          port,
          timestamp: Date.now(),
        });
      }

      // 3. HTTP 学习者画像快照直查端点
      if (url.pathname.startsWith('/api/profile/')) {
        const userId = url.pathname.replace('/api/profile/', '');
        return sqliteRepo.getProfileSnapshot(userId).then((res) => {
          if (isOk(res)) return Response.json(res.value);
          return Response.json({ error: res.error }, { status: 400 });
        });
      }

      return new Response('Study Studio Gateway Running. Connect via /ws', { status: 200 });
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
