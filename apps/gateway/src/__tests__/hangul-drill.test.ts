import { describe, expect, it } from 'bun:test';
import { isOk } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../infrastructure/drizzle-learner-repository.js';
import { LearningContentTool } from '../transport/tools/learning-content-tool.js';

describe('learning.content hangul_drill', () => {
  it('builds jamo-to-romanization questions from curriculum_hangul without LLM', async () => {
    const repo = new DrizzleLearnerRepository(':memory:');
    const tool = new LearningContentTool(repo);
    const res = await tool.execute(
      { action: 'hangul_drill', count: 3 },
      { userId: 'u_hangul_drill', sessionId: 's1' }
    );
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.language).toBe('ko');
    const questions = res.value.questions ?? [];
    expect(questions.length).toBe(3);
    const ids = new Set(questions.map((q) => q.content));
    expect(ids.size).toBe(3);
    for (const q of questions) {
      expect(q.type).toBe('MULTIPLE_CHOICE');
      expect(q.options?.length).toBe(4);
      expect(q.options).toContain(q.correctAnswer);
      expect(q.testedSkillId.startsWith('ko.hangul.')).toBe(true);
    }
  });
});
