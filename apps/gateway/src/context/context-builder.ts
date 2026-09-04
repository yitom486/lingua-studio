import type { ContextSnapshot, ContextFocusItem } from '@study-studio/agent-core';
import type { LearnerProfileSnapshot, LearnerRepository } from '@study-studio/learner-core';
import type { GeneratedQuestion, Flashcard } from '@study-studio/protocol';
import { isOk } from '@study-studio/shared';

export interface BuildTurnContextParams {
  profile: LearnerProfileSnapshot;
  currentQuestion?: GeneratedQuestion;
  userAnswer?: string;
  selectedWord?: string;
  focus?: ContextFocusItem;
  ui?: { activeTab?: string; activeMode?: string };
}

function countDueCards(cards: Flashcard[], nowIso: string): number {
  return cards.filter((c) => !c.fsrs.dueAt || c.fsrs.dueAt <= nowIso).length;
}

function extractKanaMastery(
  metrics: Array<{ id: string; proficiency: number }>
): { hiragana: number; katakana: number } | undefined {
  const hira = metrics.find((m) => m.id === 'jp.kana.hiragana');
  const kata = metrics.find((m) => m.id === 'jp.kana.katakana');
  if (!hira && !kata) return undefined;
  return {
    hiragana: hira?.proficiency ?? 0,
    katakana: kata?.proficiency ?? 0,
  };
}

/** 从错题与薄弱项压缩近期错因标签（限长） */
export function deriveRecentErrorTags(
  mistakes: Array<{
    question?: { testedSkillId?: string | undefined; category?: string | undefined } | undefined;
  }>,
  weaknesses: Array<{ skillId: string }>
): string[] {
  const tags: string[] = [];
  const push = (raw: string | undefined) => {
    if (!raw) return;
    const segment = raw.includes('.') ? raw.split('.')[1]! : raw;
    const tag = segment.replace(/_/g, ' ').trim().toUpperCase();
    if (tag && !tags.includes(tag)) tags.push(tag);
  };

  for (const m of mistakes.slice(0, 12)) {
    push(m.question?.testedSkillId);
    const cat = m.question?.category;
    if (cat && !tags.includes(cat)) tags.push(cat);
  }
  for (const w of weaknesses.slice(0, 5)) {
    push(w.skillId);
  }
  return tags.slice(0, 8);
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

    const kanaMastery = extractKanaMastery(profile.allMetrics ?? []);

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
        ...(kanaMastery ? { kanaMastery } : {}),
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
   * 从 Repository 与客户端快照实时聚合完整 ContextSnapshot
   * （学情 digest 以 DB 为准；ui / focus / intent 优先客户端）
   */
  public async buildTurnSnapshot(
    userId: string,
    learnerRepo: LearnerRepository,
    clientSnapshot?: Partial<ContextSnapshot>
  ): Promise<ContextSnapshot> {
    const [profileRes, snapshotRes, dueCardsRes, mistakesRes] = await Promise.all([
      learnerRepo.getLearnerProfile(userId),
      learnerRepo.getProfileSnapshot(userId),
      learnerRepo.getDueCards(userId, 100),
      learnerRepo.getMistakes(userId, { resolved: false }),
    ]);

    const profile = isOk(profileRes) ? profileRes.value : null;
    const snapshot = isOk(snapshotRes) ? snapshotRes.value : null;
    const nowIso = new Date().toISOString();

    const dueCardsCount = isOk(dueCardsRes)
      ? countDueCards(dueCardsRes.value, nowIso)
      : 0;

    const unresolvedMistakes = isOk(mistakesRes) ? mistakesRes.value : [];
    const unresolvedMistakesCount = unresolvedMistakes.length;

    const weaknesses = (snapshot?.weaknesses || []).slice(0, 5).map((w) => ({
      skillId: w.id,
      name: w.name,
      proficiency: w.proficiency,
    }));

    const allMetrics = snapshot?.allMetrics ?? [];
    const kanaMastery =
      (clientSnapshot?.targetLanguage || profile?.targetLanguage) === 'ja'
        ? extractKanaMastery(allMetrics)
        : undefined;
    const recentErrorTags = deriveRecentErrorTags(
      unresolvedMistakes.map((m) => ({
        question: {
          testedSkillId: m.question?.testedSkillId,
          category: (m.question as { category?: string } | undefined)?.category,
        },
      })),
      weaknesses
    );

    return {
      targetLanguage: (clientSnapshot?.targetLanguage ||
        profile?.targetLanguage ||
        'ja') as 'ja' | 'en' | 'ko',
      learnerLevel: clientSnapshot?.learnerLevel || profile?.overallLevel || 'N3',
      locale: clientSnapshot?.locale || 'zh-CN',
      ui: clientSnapshot?.ui || { activeTab: 'TUTOR' },
      focus: clientSnapshot?.focus,
      learnerDigest: {
        topWeaknesses: weaknesses,
        dueCardsCount,
        unresolvedMistakesCount,
        streakDays: profile?.streakDays || 0,
        recentErrorTags,
        ...(kanaMastery ? { kanaMastery } : {}),
      },
      userIntentHint: clientSnapshot?.userIntentHint || 'EXPLAIN',
      constraints: clientSnapshot?.constraints,
      topWeaknesses: weaknesses.map((w) => `${w.skillId} (${w.name})`),
      metadata: clientSnapshot?.metadata,
      currentQuestion: clientSnapshot?.currentQuestion,
      selectedWord: clientSnapshot?.selectedWord,
    };
  }
}
