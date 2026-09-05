/**
 * @deprecated 请改用 `useAgentGateway` / `useEnsureGateway`（`hooks/useAgentGateway.ts`）。
 * 本文件保留兼容导出，避免旧 import 断裂。
 */
export {
  useGateway,
  useAgentGateway,
  useEnsureGateway,
  type StreamTurnOptions,
} from './useAgentGateway.js';
