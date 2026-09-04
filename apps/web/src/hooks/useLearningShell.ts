import { useMemo } from 'react';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import {
  getLearningShellConfig,
  type LearningShellConfig,
} from '../learning/learning-shell.js';

/**
 * 响应式获取当前用户学习轨道壳层配置
 */
export function useLearningShell(): LearningShellConfig {
  const targetLanguage = useUserProfileStore((s) => s.profile.targetLanguage);
  return useMemo(() => getLearningShellConfig(targetLanguage), [targetLanguage]);
}
