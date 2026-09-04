import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  QueryClient,
  QueryClientProvider,
  MutationCache,
  QueryCache,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { App } from './App.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import './index.css';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分钟内视为新鲜数据
      gcTime: 1000 * 60 * 30, // 30 分钟缓存回收期
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        // 如果后端明确告知 retryable 为 false，则不再进行重试
        if (error?.retryable === false) return false;
        return failureCount < 2;
      },
    },
  },
  // 全局 Query 错误统一拦截
  queryCache: new QueryCache({
    onError: (error: any) => {
      if (error?.userMessage) {
        toast.error(error.userMessage);
      }
    },
  }),
  // 全局 Mutation 变更失败统一拦截与友好安抚
  mutationCache: new MutationCache({
    onError: (error: any) => {
      const userMessage =
        error?.userMessage ||
        (error instanceof Error ? error.message : '学习数据保存失败，请检查网络后重试。');
      toast.error(userMessage);
    },
  }),
});

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary
        variant="fullscreen"
        title="应用遇到了意外崩溃"
        message="Study Studio 核心运行环境遇到了不可预期的错误。您的本地设置与学习资产已得到保护。"
      >
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
