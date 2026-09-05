import { describe, it, expect, beforeEach } from 'bun:test';
import { isOk } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../../../repository/drizzle-learner-repository.js';
import {
  assemblePracticeRun,
  acceptedDbTypesForBlock,
  buildVocabQuestionsFromCards,
} from '../application/practice-assembly.js';
import { LearningContentTool } from '../../../transport/tools/learning-content-tool.js';
import type { Flashcard, PracticeBlockSpec } from '@study-studio/protocol';

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

  function seedCard(id: string, front: string, back: string, state: Flashcard['fsrs']['state']) {
    return repo.saveCard(flashcard(id, front, back, state));
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

  it('builds vocab multiple-choice questions from FSRS cards', () => {
    const cards: Flashcard[] = [
      flashcard('c1', 'elastic', '有弹性的'),
      flashcard('c2', 'fragile', '易碎的'),
      flashcard('c3', 'visible', '可见的'),
      flashcard('c4', 'durable', '耐用的'),
    ];
    const qs = buildVocabQuestionsFromCards(cards, 4, 'en');
    expect(qs.length).toBe(4);
    for (const q of qs) {
      expect(q.type).toBe('MULTIPLE_CHOICE');
      expect(q.options?.length).toBe(4);
      expect(q.options).toContain(q.correctAnswer);
      expect(q.testedSkillId).toBe('en.vocab.review');
    }
    // 题干为卡正面，答案为对应卡背面
    expect(qs[0]!.content).toBe('elastic');
    expect(qs[0]!.correctAnswer).toBe('有弹性的');
    expect(new Set(qs.map((q) => q.content)).size).toBe(4);
  });

  it('assembles VOCAB_REVIEW from due cards without touching the question pool', async () => {
    await seedCard('card_a', 'abundant', '丰富的', 'REVIEW');
    await seedCard('card_b', 'scarce', '稀缺的', 'REVIEW');
    await seedCard('card_c', 'tedious', '乏味的', 'REVIEW');
    await seedCard('card_d', 'vivid', '生动的', 'REVIEW');

    const runRes = await repo.startPracticePlanRun(userId, {
      language: 'en',
      blocks: [
        { id: 'blk_vocab', kind: 'VOCAB_REVIEW', count: 3, gradingMode: 'AUTO_IMMEDIATE', vocabularySource: 'DUE_CARDS' },
      ] satisfies PracticeBlockSpec[],
    });
    expect(isOk(runRes)).toBe(true);
    if (!isOk(runRes)) return;

    const asm = await assemblePracticeRun(repo, userId, runRes.value.id);
    expect(isOk(asm)).toBe(true);
    if (!isOk(asm)) return;
    expect(asm.value.totalItems).toBe(3);
    expect(asm.value.skippedBlocks).toEqual([]);

    const itemsRes = await repo.getPracticeRunItems(userId, runRes.value.id);
    if (!isOk(itemsRes)) return;
    for (const it of itemsRes.value) {
      expect(it.question.type).toBe('MULTIPLE_CHOICE');
      expect(String(it.question.id)).toMatch(/^vocab_card_/);
      expect(String(it.question.testedSkillId)).toBe('en.vocab.review');
    }
    const contents = itemsRes.value.map((it) => it.question.content);
    expect(new Set(contents).size).toBe(3);
  });

  it('tops up TRANSLATION blocks via template generation when pool lacks the type', async () => {
    // 池中只有客观题，没有 TRANSLATION 行
    await seed('CHOICE', 'q_mc_only_1');
    const tool = new LearningContentTool(repo);

    const runRes = await repo.startPracticePlanRun(userId, {
      language: 'en',
      blocks: [
        { id: 'blk_tr', kind: 'TRANSLATION', count: 2, gradingMode: 'AI_BATCH' },
      ] satisfies PracticeBlockSpec[],
    });
    expect(isOk(runRes)).toBe(true);
    if (!isOk(runRes)) return;

    const asm = await assemblePracticeRun(repo, userId, runRes.value.id, tool);
    expect(isOk(asm)).toBe(true);
    if (!isOk(asm)) return;
    expect(asm.value.totalItems).toBe(2);
    expect(asm.value.skippedBlocks).toEqual([]);

    const itemsRes = await repo.getPracticeRunItems(userId, runRes.value.id);
    if (!isOk(itemsRes)) return;
    // 模板生成的翻译题干（zh→en 方向），而非通用选择题
    expect(itemsRes.value.every((it) => it.question.type === 'TRANSLATION')).toBe(true);
  });

  it('tops up DICTATION blocks via dictation templates', async () => {
    await seed('CHOICE', 'q_mc_dict_seed');
    const tool = new LearningContentTool(repo);

    const runRes = await repo.startPracticePlanRun(userId, {
      language: 'en',
      blocks: [
        { id: 'blk_dic', kind: 'DICTATION', count: 2, gradingMode: 'AUTO_IMMEDIATE' },
      ] satisfies PracticeBlockSpec[],
    });
    expect(isOk(runRes)).toBe(true);
    if (!isOk(runRes)) return;

    const asm = await assemblePracticeRun(repo, userId, runRes.value.id, tool);
    expect(isOk(asm)).toBe(true);
    if (!isOk(asm)) return;
    expect(asm.value.totalItems).toBe(2);

    const itemsRes = await repo.getPracticeRunItems(userId, runRes.value.id);
    if (!isOk(itemsRes)) return;
    expect(itemsRes.value.every((it) => it.question.type === 'LISTENING_DICTATION')).toBe(true);
    // P5-E8：完整语料随题携带（TTS 原句 + 挖空提示），答案不入语料
    for (const it of itemsRes.value) {
      expect(it.question.dictation?.fullJapanese).toBeTruthy();
      expect(it.question.dictation?.fullJapanese).not.toBe(it.question.correctAnswer);
    }
  });

  it('assembles READING blocks from the latest reading set with passage attached', async () => {
    const saveRes = await repo.saveReadingSet(userId, {
      id: 'rset_1',
      origin: 'ai',
      title: 'Morning Routines',
      topic: 'daily life',
      difficulty: 2,
      language: 'EN',
      sourceLabel: 'offline template',
      body: 'Every morning, Maya drinks coffee and reads the news before work.',
      questions: [
        {
          id: 'rq1',
          prompt: 'What does Maya do before work?',
          options: [
            { key: 'A', text: 'Drinks coffee and reads the news' },
            { key: 'B', text: 'Goes running' },
            { key: 'C', text: 'Watches TV' },
          ],
          correctAnswer: 'A',
          explanation: '文中明确提到。',
        },
        {
          id: 'rq2',
          prompt: 'When does Maya read the news?',
          options: [
            { key: 'A', text: 'In the morning' },
            { key: 'B', text: 'At night' },
            { key: 'C', text: 'Never' },
          ],
          correctAnswer: 'A',
          explanation: 'Every morning。',
        },
      ],
      // 固定未来时间戳：种子篇目在 initSchema 时以当前时间写入，
      // 同毫秒并列会导致 ORDER BY createdAt DESC 顺序不定而 flaky。
      createdAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(isOk(saveRes)).toBe(true);

    const runRes = await repo.startPracticePlanRun(userId, {
      language: 'en',
      blocks: [
        { id: 'blk_read', kind: 'READING', count: 2, gradingMode: 'AUTO_IMMEDIATE' },
      ] satisfies PracticeBlockSpec[],
    });
    expect(isOk(runRes)).toBe(true);
    if (!isOk(runRes)) return;

    const asm = await assemblePracticeRun(repo, userId, runRes.value.id);
    expect(isOk(asm)).toBe(true);
    if (!isOk(asm)) return;
    expect(asm.value.totalItems).toBe(2);
    expect(asm.value.skippedBlocks).toEqual([]);

    const itemsRes = await repo.getPracticeRunItems(userId, runRes.value.id);
    if (!isOk(itemsRes)) return;
    for (const it of itemsRes.value) {
      expect(it.question.type).toBe('MULTIPLE_CHOICE');
      expect(it.question.reading?.setId).toBe('rset_1');
      expect(it.question.reading?.title).toBe('Morning Routines');
      expect(it.question.reading?.body).toContain('Maya');
      expect(String(it.question.testedSkillId)).toBe('en.reading.comprehension');
    }
  });
});

function flashcard(id: string, front: string, back: string, state: Flashcard['fsrs']['state'] = 'REVIEW'): Flashcard {
  return {
    id,
    userId: 'p5e4_user',
    type: 'VOCABULARY',
    front,
    back,
    phonetic: undefined,
    audioUrl: undefined,
    tags: [],
    fsrs: { stability: 1, difficulty: 5, reps: 1, lapses: 0, dueAt: new Date().toISOString(), state },
  };
}
