import { describe, expect, it } from 'bun:test';
import { isOk } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../repository/drizzle-learner-repository.js';
import { LearningProgressTool } from '../tools/learning-progress-tool.js';
import { LearningCurriculumTool } from '../tools/learning-curriculum-tool.js';
import { LearningLibraryTool } from '../tools/learning-library-tool.js';
import { LearningContentTool } from '../tools/learning-content-tool.js';

describe('learning control tools (C1–C3 / D)', () => {
  it('learning.progress records quiz attempt', async () => {
    const repo = new DrizzleLearnerRepository(':memory:');
    const tool = new LearningProgressTool(repo);
    const res = await tool.execute(
      {
        action: 'record_quiz_attempt',
        questionId: 'q1',
        userAnswer: 'で',
        isCorrect: true,
        score: 1,
        testedSkillId: 'jp.particle.ni_vs_de',
      },
      { userId: 'u_test', sessionId: 's1' }
    );
    expect(isOk(res)).toBe(true);
    if (isOk(res)) expect(res.value.action).toBe('record_quiz_attempt');
  });

  it('learning.curriculum returns kana chart without LLM', async () => {
    const repo = new DrizzleLearnerRepository(':memory:');
    const tool = new LearningCurriculumTool(repo);
    const res = await tool.execute(
      { action: 'get_kana_chart', filters: { type: 'SEION' } },
      { userId: 'u_test', sessionId: 's1' }
    );
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      expect(res.value.kana?.length).toBeGreaterThan(0);
    }
  });

  it('learning.library lists news topics', async () => {
    const repo = new DrizzleLearnerRepository(':memory:');
    const tool = new LearningLibraryTool(repo);
    const res = await tool.execute(
      { action: 'list_news_topics' },
      { userId: 'u_test', sessionId: 's1' }
    );
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      expect(res.value.topics?.length).toBeGreaterThan(0);
      expect(res.value.topics?.[0]).toHaveProperty('id');
      expect(res.value.topics?.[0]).toHaveProperty('label');
    }
  });

  it('learning.curriculum lists pitch lexicon without OJAD', async () => {
    const repo = new DrizzleLearnerRepository(':memory:');
    const tool = new LearningCurriculumTool(repo);
    const res = await tool.execute(
      { action: 'list_pitch_benchmarks' },
      { userId: 'u_test', sessionId: 's1' }
    );
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      expect(res.value.pitchEntries?.length).toBeGreaterThan(0);
    }
  });

  it('learning.content generates writing prompts and dictation', async () => {
    const repo = new DrizzleLearnerRepository(':memory:');
    const tool = new LearningContentTool(repo);

    const writing = await tool.execute(
      {
        action: 'generate_writing_prompt',
        genre: 'translation',
        count: 2,
        collect: true,
      },
      { userId: 'u_test', sessionId: 's1' }
    );
    expect(isOk(writing)).toBe(true);
    if (isOk(writing)) {
      expect(
        (writing.value.writingPrompts?.length ?? writing.value.questions?.length ?? 0) > 0
      ).toBe(true);
    }

    const dictation = await tool.execute(
      {
        action: 'generate_quiz',
        format: 'LISTENING_DICTATION',
        count: 2,
        collect: true,
      },
      { userId: 'u_test', sessionId: 's1' }
    );
    expect(isOk(dictation)).toBe(true);
    if (isOk(dictation)) {
      expect(dictation.value.dictationItems?.length).toBeGreaterThan(0);
    }
  });
});
