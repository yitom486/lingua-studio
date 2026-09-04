import type { ContextSnapshot } from '@study-studio/agent-core';
import type { LearnerProfileSnapshot } from '@study-studio/learner-core';
import type { GeneratedQuestion } from '@study-studio/protocol';

export interface BuildTurnContextParams {
  profile: LearnerProfileSnapshot;
  currentQuestion?: GeneratedQuestion;
  userAnswer?: string;
  selectedWord?: string;
}

export class ContextBuilder {
  /**
   * 组装每轮对话的不可变 Context Snapshot
   */
  public build(params: BuildTurnContextParams): ContextSnapshot {
    const { profile, currentQuestion, userAnswer, selectedWord } = params;

    const topWeaknesses = profile.weaknesses
      .slice(0, 3)
      .map((w) => `${w.id} (${w.name})`);

    return {
      targetLanguage: profile.targetLanguage,
      learnerLevel: profile.overallLevel,
      topWeaknesses,
      currentQuestion: currentQuestion
        ? {
            id: currentQuestion.id,
            content: currentQuestion.content,
            correctAnswer: currentQuestion.correctAnswer,
            userAnswer,
          }
        : undefined,
      selectedWord,
    };
  }
}
