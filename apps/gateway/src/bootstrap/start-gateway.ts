import type { CreatedApp } from '../transport/http/create-app.js';
import type { GatewayServer } from '../runtime/gateway-runtime.js';
import { createWebsocketHandlers } from '../transport/websocket/websocket-handler.js';
import { PORT } from './config.js';

/**
 * 启动网关：Bun.serve 同时承载 `/ws` 升级与 Hono HTTP。
 * 应用构建（createApp）与依赖装配（createGateway）已分离，
 * 本函数只负责监听生命周期。
 */
export function startGateway(app: CreatedApp, server: GatewayServer, port = PORT) {
  const started = Bun.serve<{ sessionId?: string | undefined }>({
    hostname: '127.0.0.1',
    port,
    // 大书上传：Bun 默认请求体上限接不住百 MB 级 PDF（实测 100MB+ 被秒断），显式放开。
    maxRequestBodySize: 512 * 1024 * 1024,
    async fetch(req, upgradeServer) {
      const url = new URL(req.url);

      // 1. WebSocket 升级路由 /ws
      if (url.pathname === '/ws') {
        const upgraded = upgradeServer.upgrade(req, {
          data: { sessionId: undefined },
        });
        if (upgraded) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      // 2. HTTP REST 交由 Hono 驱动
      return app.fetch(req);
    },
    websocket: createWebsocketHandlers(server) as never,
  });

  console.log(`🚀 Lingua Studio Agent Gateway (Hono + Bun WS) listening on http://localhost:${started.port}`);
  return started;
}
