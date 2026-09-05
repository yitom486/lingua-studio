import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  gatewayClient,
  type QuizSubmitPayload,
  type SubjectiveGradePayload,
} from '../lib/gateway-client.js';
import { useGatewayStore } from '../stores/useGatewayStore.js';
import { QUERY_KEYS } from './useLearnerQueries.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';

function assertConnected(): void {
  if (!useGatewayStore.getState().isConnected && !gatewayClient.isConnected) {
    const err = new Error('Gateway 未连接，请稍后重试。') as Error & {
      userMessage?: string;
      retryable?: boolean;
    };
    err.userMessage = '学习助手尚未连上，请确认 Gateway 已启动。';
    err.retryable = true;
    throw err;
  }
}

/** 交卷 → Gateway WS（TanStack Mutation） */
export function useSubmitQuizMutation() {
  const queryClient = useQueryClient();
  const recordActivity = useUserProfileStore((s) => s.recordActivity);

  return useMutation({
    mutationFn: async (payload: QuizSubmitPayload) => {
      assertConnected();
      if (!gatewayClient.submitQuiz(payload)) {
        throw new Error('提交练习失败：无法发送到 Gateway');
      }
      return payload;
    },
    onSuccess: () => {
      recordActivity({ quizzes: 1 });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROFILE });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MISTAKES });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DAILY_TASK });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DAILY_PLAN });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LEARNING_ANALYSIS });
    },
  });
}

/** 自适应出题（WS request/response） */
export function useGenerateAdaptiveQuizMutation() {
  return useMutation({
    mutationFn: async (options?: { weaknessSkillId?: string; count?: number }) => {
      assertConnected();
      return gatewayClient.generateAdaptiveQuiz(options);
    },
  });
}

/** 主观题批改 */
export function useGradeSubjectiveMutation() {
  return useMutation({
    mutationFn: async (payload: SubjectiveGradePayload) => {
      assertConnected();
      return gatewayClient.gradeSubjectiveQuiz(payload);
    },
  });
}

/** 连接态：模块只需指示灯时用这个，不必拉整套 agent API */
export function useGatewayConnection() {
  const isConnected = useGatewayStore((s) => s.isConnected);
  const isConnecting = useGatewayStore((s) => s.isConnecting);
  const latencyMs = useGatewayStore((s) => s.latencyMs);
  const sessionId = useGatewayStore((s) => s.sessionId);
  return { isConnected, isConnecting, latencyMs, sessionId };
}
