import { create } from 'zustand';

/**
 * Gateway WebSocket 连接态（非 persist）。
 * 流式回调与命令走 gatewayClient；模块只订阅本 store 的连接指示灯即可。
 */
export interface GatewayConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  sessionId: string | null;
  latencyMs: number | null;
  lastError: string | null;
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setSessionId: (sessionId: string | null) => void;
  setLatencyMs: (ms: number | null) => void;
  setLastError: (message: string | null) => void;
  patch: (partial: Partial<
    Pick<
      GatewayConnectionState,
      'isConnected' | 'isConnecting' | 'sessionId' | 'latencyMs' | 'lastError'
    >
  >) => void;
  reset: () => void;
}

const initial = {
  isConnected: false,
  isConnecting: false,
  sessionId: null as string | null,
  latencyMs: null as number | null,
  lastError: null as string | null,
};

export const useGatewayStore = create<GatewayConnectionState>((set) => ({
  ...initial,
  setConnected: (isConnected) => set({ isConnected }),
  setConnecting: (isConnecting) => set({ isConnecting }),
  setSessionId: (sessionId) => set({ sessionId }),
  setLatencyMs: (latencyMs) => set({ latencyMs }),
  setLastError: (lastError) => set({ lastError }),
  patch: (partial) => set(partial),
  reset: () => set({ ...initial }),
}));
