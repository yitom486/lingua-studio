import { describe, it, expect, beforeEach } from 'bun:test';
import { isOk } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../repository/drizzle-learner-repository.js';
import { assemblePracticeRun, acceptedDbTypesForBlock } from '../services/practice-assembly.js';
import type { PracticeBlockSpec } from '@study-studio/protocol';

describe('practice assembly by block spec (P5-E4)', () => {
  let repo: DrizzleLearnerRepository;
  const userId = 'p5e4_user';

  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
  });

  function seed(type: string, id: string, difficulty = 3) {
    return repo.saveQuestion({
      id,
      userId,
      type,
      category: 'test',
      prompt: `prompt ${id}`,
      content: `content ${id}`,
      correctAnswer: 'a',
      explanation: 'x',
      testedSkillId: 'en.test.grammar',
      difficulty,
      language: 'en',
    });
  }

  it('maps block kinds and explicit formats to accepted db types', () => {
    expect(
      acceptedDbTypesForBlock({ id: 'b', kind: 'TRANSLATION', count: 1, gradingMode: 'AI_BATCH' })
    ).toEqual(['TRANSLATION']);
    expect(
      acceptedDbTypesForBlock({ id: 'b', kind: 'DICTATION', count: 1, gradingMode: 'AUTO_IMMEDIATE' })
    ).toEqual(['DICTATION']);
    expect(
      acceptedDbTypesForBlock({ id: 'b', kind: 'QUIZ', count: 1, gradingMode: 'AUTO_IMMEDIATE' })
    ).toEqual(['CHOICE', 'FILL_BLANK', 'REORDER']);
    expect(
      acceptedDbTypesForBlock({
        id: 'b',
        kind: 'QUIZ',
        count: 1,
        gradingMode: 'AUTO_IMMEDIATE',
        questionFormats: ['TRANSLATION'],
      })
    ).toEqual(['TRANSLATION']);
  });

  it('selects per-block question types, dedupes across blocks, and falls back when a type is missing', async () => {
    await seed('CHOICE', 'q_mc_1');
    await seed('CHOICE', 'q_mc_2');
    await seed('FILL_BLANK', 'q_fill_1');
    await seed('REORDER', 'q_re_1');
    await seed('TRANSLATION', 'q_tr_1');

    const runRes = await repo.startPracticePlanRun(userId, {
      language: 'en',
      blocks: [
        { id: 'blk_quiz', kind: 'QUIZ', count: 2, gradingMode: 'AUTO_IMMEDIATE' },
        { id: 'blk_tr', kind: 'TRANSLATION', count: 1, gradingMode: 'AI_BATCH' },
        { id: 'blk_dic', kind: 'DICTATION', count: 1, gradingMode: 'AUTO_IMMEDIATE' },
      ] satisfies PracticeBlockSpec[],
    });
    expect(isOk(runRes)).toBe(true);
    if (!isOk(runRes)) return;

    const asm = await assemblePracticeRun(repo, userId, runRes.value.id);
    expect(isOk(asm)).toBe(true);
    if (!isOk(asm)) return;
    expect(asm.value.blocks.length).toBe(3);
    expect(asm.value.totalItems).toBe(4);
    expect(asm.value.skippedBlocks).toEqual([]);

    const itemsRes = await repo.getPracticeRunItems(userId, runRes.value.id);
    expect(isOk(itemsRes)).toBe(true);
    if (!isOk(itemsRes)) return;

    const byBlock = new Map<string, Array<{ id: string; type: string }>>();
    for (const it of itemsRes.value) {
      const list = byBlock.get(it.blockId) ?? [];
      list.push({ id: String(it.question.id), type: String(it.question.type) });
      byBlock.set(it.blockId, list);
    }

    const quizItems = byBlock.get('blk_quiz') ?? [];
    expect(quizItems.length).toBe(2);
    expect(
      quizItems.every((q) =>
        ['MULTIPLE_CHOICE', 'FILL_IN_BLANK', 'SENTENCE_REORDER'].includes(q.type)
      )
    ).toBe(true);

    // TRANSLATION 块按题型命中 q_tr_1，而不是拿通用选择题
    const trItems = byBlock.get('blk_tr') ?? [];
    expect(trItems.map((q) => q.id)).toEqual(['q_tr_1']);

    // DICTATION 池无题 → 回退同语种可用题，不空跑
    const dicItems = byBlock.get('blk_dic') ?? [];
    expect(dicItems.length).toBe(1);

    // 跨块去重：三块题目 id 互不相同
    const allIds = [...quizItems, ...trItems, ...dicItems].map((q) => q.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('prefers requested difficulty first and relaxes only when scarce', async () => {
    await seed('CHOICE', 'q_easy_1', 2);
    await seed('CHOICE', 'q_hard_1', 5);
    await seed('CHOICE', 'q_hard_2', 5);

    const runRes = await repo.startPracticePlanRun(userId, {
      language: 'en',
      blocks: [
        { id: 'blk_hard', kind: 'QUIZ', count: 2, difficulty: 5, gradingMode: 'AUTO_IMMEDIATE' },
      ] satisfies PracticeBlockSpec[],
    });
    expect(isOk(runRes)).toBe(true);
    if (!isOk(runRes)) return;

    const asm = await assemblePracticeRun(repo, userId, runRes.value.id);
    expect(isOk(asm)).toBe(true);
    if (!isOk(asm)) return;

    const itemsRes = await repo.getPracticeRunItems(userId, runRes.value.id);
    if (!isOk(itemsRes)) return;
    const ids = itemsRes.value.map((it) => String(it.question.id)).sort();
    expect(ids).toEqual(['q_hard_1', 'q_hard_2']);
  });
});
