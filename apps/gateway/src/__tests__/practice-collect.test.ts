import { describe, expect, it } from 'bun:test';
import { DrizzleLearnerRepository } from '../repository/drizzle-learner-repository.js';
import { LearningContentTool } from '../tools/learning-content-tool.js';
import { isOk } from '@study-studio/shared';

describe('practice collections / collect', () => {
  it('persists generated quiz into practice_collections and practice_items', async () => {
    const repo = new DrizzleLearnerRepository(':memory:');
    const tool = new LearningContentTool(repo);

    const res = await tool.execute(
      {
        action: 'generate_quiz',
        count: 2,
        skillIds: ['jp.particle.ni_vs_de'],
        collect: true,
        collectionTitle: '今日助词专练',
      },
      { userId: 'student_web_01', sessionId: 's1' }
    );

    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;

    expect(res.value.collectionId).toBeTruthy();
    expect(res.value.questions?.length).toBe(2);

    const cols = await repo.listPracticeCollections('student_web_01');
    expect(isOk(cols)).toBe(true);
    if (!isOk(cols)) return;
    expect(cols.value.length).toBe(1);
    expect(cols.value[0]!.title).toBe('今日助词专练');

    const items = await repo.listPracticeItems('student_web_01', cols.value[0]!.id);
    expect(isOk(items)).toBe(true);
    if (!isOk(items)) return;
    expect(items.value.length).toBe(2);
    expect(items.value[0]!.question.testedSkillId).toBe('jp.particle.ni_vs_de');
  });
});
