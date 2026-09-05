import { useEffect } from 'react';
import {
  gatewayClient,
  type StreamTurnOptions,
  type GatewayClientOptions,
} from '../lib/gateway-client.js';
import { useGatewayStore } from '../stores/useGatewayStore.js';

export type { StreamTurnOptions };

/**
 * App 根调用一次：启动 Gateway 单例（水合后自动连 WS）。
 */
export function useEnsureGateway(options?: GatewayClientOptions): void {
  useEffect(() => {
    gatewayClient.start(options);
    // 单例只启动一次；卸载不断连，避免 StrictMode 双挂载闪断
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once
  }, []);
}

/**
 * 任意模块自取 Agent/Gateway 能力（不绑死具体 UI）。
 * 连接指示灯来自 Zustand；命令走 gatewayClient 单例（引用稳定）。
 */
export function useAgentGateway() {
  const isConnected = useGatewayStore((s) => s.isConnected);
  const isConnecting = useGatewayStore((s) => s.isConnecting);
  const sessionId = useGatewayStore((s) => s.sessionId);
  const latencyMs = useGatewayStore((s) => s.latencyMs);
  const lastError = useGatewayStore((s) => s.lastError);

  return {
    isConnected,
    isConnecting,
    sessionId,
    latencyMs,
    lastError,
    connect: gatewayClient.connect.bind(gatewayClient),
    disconnect: gatewayClient.disconnect.bind(gatewayClient),
    sendTurnStream: (opts: StreamTurnOptions) => gatewayClient.sendTurnStream(opts),
    startQueueStream: (
      opts: import('../lib/gateway-client.js').StreamQueueStartOptions
    ) => gatewayClient.startQueueStream(opts),
    interruptTurn: () => gatewayClient.interruptTurn(),
    steerTurn: (message: string) => gatewayClient.steerTurn(message),
    respondApproval: (
      approvalId: string,
      decision: boolean | 'accept' | 'acceptForSession' | 'decline' | 'cancel'
    ) => gatewayClient.respondApproval(approvalId, decision),
    submitQuizToGateway: gatewayClient.submitQuiz.bind(gatewayClient),
    reviewCardToGateway: gatewayClient.reviewCard.bind(gatewayClient),
    generateAdaptiveQuiz: gatewayClient.generateAdaptiveQuiz.bind(gatewayClient),
    gradeSubjectiveQuiz: gatewayClient.gradeSubjectiveQuiz.bind(gatewayClient),
  };
}

/** @deprecated 使用 useAgentGateway + useEnsureGateway */
export function useGateway(options?: GatewayClientOptions) {
  useEnsureGateway(options);
  return useAgentGateway();
}
