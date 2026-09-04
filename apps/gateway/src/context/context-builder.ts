import type { ContextSnapshot, ContextFocusItem } from '@study-studio/agent-core';
import type { LearnerProfileSnapshot, LearnerRepository } from '@study-studio/learner-core';
import type { GeneratedQuestion } from '@study-studio/protocol';
import { isOk } from '@study-studio/shared';

export interface BuildTurnContextParams {
  profile: LearnerProfileSnapshot;
  currentQuestion?: GeneratedQuestion;
  userAnswer?: string;
  selectedWord?: string;
  focus?: ContextFocusItem;
  ui?: { activeTab?: string; activeMode?: string };
}

export class ContextBuilder {
  /**
   * 组装每轮对话的不可变 Context Snapshot (支持经典入参)
   */
  public build(params: BuildTurnContextParams): ContextSnapshot {
    const { profile, currentQuestion, userAnswer, selectedWord, focus, ui } = params;

    const topWeaknesses = profile.weaknesses
      .slice(0, 5)
      .map((w) => ({ skillId: w.id, name: w.name, proficiency: w.proficiency }));

    return {
      targetLanguage: profile.targetLanguage,
      learnerLevel: profile.overallLevel,
      locale: 'zh-CN',
      ui: ui || { activeTab: 'TUTOR' },
      focus: focus || (currentQuestion ? {
        kind: 'QUESTION' as const,
        id: currentQuestion.id,
        surface: currentQuestion.content,
        correctAnswer: currentQuestion.correctAnswer,
        userAnswer,
        explanation: currentQuestion.explanation,
        skillTag: currentQuestion.testedSkillId,
      } : undefined),
      learnerDigest: {
        topWeaknesses,
      },
      topWeaknesses: topWeaknesses.map((w) => `${w.skillId} (${w.name})`),
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

  /**
   * 从 Repository 与客户端快照实时聚合完整 ContextSnapshotV2
   */
  public async buildTurnSnapshot(
    userId: string,
    learnerRepo: LearnerRepository,
    clientSnapshot?: Partial<ContextSnapshot>
  ): Promise<ContextSnapshot> {
    const profileRes = await learnerRepo.getLearnerProfile(userId);
    const profile = isOk(profileRes) ? profileRes.value : null;

    const snapshotRes = await learnerRepo.getProfileSnapshot(userId);
    const snapshot = isOk(snapshotRes) ? snapshotRes.value : null;

    const weaknesses = (snapshot?.weaknesses || []).slice(0, 5).map((w) => ({
      skillId: w.id,
      name: w.name,
      proficiency: w.proficiency,
    }));

    return {
      targetLanguage: (clientSnapshot?.targetLanguage || profile?.targetLanguage || 'ja') as 'ja' | 'en' | 'ko',
      learnerLevel: clientSnapshot?.learnerLevel || profile?.overallLevel || 'N3',
      locale: clientSnapshot?.locale || 'zh-CN',
      ui: clientSnapshot?.ui || { activeTab: 'TUTOR' },
      focus: clientSnapshot?.focus,
      learnerDigest: {
        topWeaknesses: weaknesses,
        dueCardsCount: profile?.dailyGoalCards || 0,
        unresolvedMistakesCount: 0,
        streakDays: profile?.streakDays || 0,
      },
      userIntentHint: clientSnapshot?.userIntentHint || 'EXPLAIN',
      topWeaknesses: weaknesses.map((w) => `${w.skillId} (${w.name})`),
      metadata: clientSnapshot?.metadata,
    };
  }
}

