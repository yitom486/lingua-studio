/** Tutor 上下文契约（独立模块，避免 store 反向依赖 UI 组件）。 */
export interface AiTutorContext {
  questionText: string;
  userAnswer?: string | undefined;
  correctAnswer: string;
  skillTag: string;
  explanation: string;
}
