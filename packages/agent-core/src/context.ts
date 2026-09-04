export interface ContextSnapshot {
  targetLanguage: 'ja' | 'en' | 'ko';
  learnerLevel: string;
  currentQuestion?: {
    id: string;
    content: string;
    correctAnswer: string;
    userAnswer?: string | undefined;
  } | undefined;
  topWeaknesses?: string[] | undefined;
  selectedWord?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface AgentInput {
  message: string;
  contextSnapshot?: ContextSnapshot | undefined;
}
