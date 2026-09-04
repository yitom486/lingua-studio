import { hc } from 'hono/client';
import type { GatewayAppType } from '@study-studio/gateway';

export const GATEWAY_BASE_URL = 'http://localhost:8080';

/**
 * Hono RPC 类型安全客户端实例
 * 具备从 Gateway Hono 路由全自动类型推导能力 (路径、参数、返回值 100% 编译期类型检查)
 */
export const apiClient = hc<GatewayAppType>(GATEWAY_BASE_URL);
