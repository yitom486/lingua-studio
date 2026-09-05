import { Hono } from 'hono';
import type { GatewayDeps } from './gateway-deps.js';

/** 健康检查（G2：由 index.ts 链式注册迁移而来，行为不变）。 */
export function createHealthRoutes(deps: GatewayDeps) {
  return new Hono()
  .get('/health', (c) =>
    c.json({
      status: 'ok',
      service: 'Study Studio Agent Gateway',
      port: deps.port,
      timestamp: Date.now(),
    })
  )
  .get('/api/health', (c) =>
    c.json({
      status: 'ok',
      service: 'Study Studio Agent Gateway',
      port: deps.port,
      timestamp: Date.now(),
    })
  )
;
}
