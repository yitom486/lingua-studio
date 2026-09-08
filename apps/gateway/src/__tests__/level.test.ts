import { describe, expect, it, beforeEach } from 'bun:test';
import { isOk } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../infrastructure/drizzle-learner-repository.js';

const UID = 'level_user_01';

async function setLevel(repo: DrizzleLearnerRepository, track: 'ja' | 'ko' | 'en', level: string) {
  const res = await repo.updateLearnerProfile(UID, {
    targetLanguage: track,
    learnerLevel: level as 'NOVICE' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED',
  });
  expect(isOk(res)).toBe(true);
}

async function kanaGood(repo: DrizzleLearnerRepository, n: number) {
  for (let i = 0; i < n; i++) {
    await repo.recordKanaPractice(UID, `lv_kana_${i}_${Math.random()}`, true, 'HIRAGANA');
  }
}

async function collects(repo: DrizzleLearnerRepository, n: number) {
  const insert = repo
    .getRawDb()
    .prepare(
      'INSERT INTO flashcards (id, user_id, language, type, front, back, tags, fsrs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
  for (let i = 0; i < n; i++) {
    insert.run(
      `lv_card_${i}`,
      UID,
      'ja',
      'VOCABULARY',
      `升级词${i}`,
      'back',
      '[]',
      JSON.stringify({ stability: 1, difficulty: 5, reps: 0, lapses: 0, dueAt: new Date().toISOString(), state: 'NEW' })
    );
  }
}

async function wrongQuizzes(repo: DrizzleLearnerRepository, n: number) {
  for (let i = 0; i < n; i++) {
    await repo.recordQuizAttempt({
      id: `lv_q_${i}_${Math.random()}`,
      userId: UID,
      questionId: `lv_qq_${i}`,
      userAnswer: 'で',
      isCorrect: false,
      score: 0,
      timeSpentMs: 1000,
      testedSkillId: 'jp.particle.ni_vs_de',
      createdAt: new Date().toISOString(),
    });
  }
}

async function levelOf(repo: DrizzleLearnerRepository): Promise<string> {
  const info = await repo.getLevelInfo(UID, 'ja');
  expect(isOk(info)).toBe(true);
  if (!isOk(info)) return '';
  return info.value.level;
}

describe('level state machine（网关自动边）', () => {
  let repo: DrizzleLearnerRepository;
  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
  });

  it('练习与收藏不能自动升级', async () => {
    await setLevel(repo, 'ja', 'NOVICE');
    await kanaGood(repo, 30);
    await collects(repo, 200);
    // 最后一次字母落盘触发求值（hook 在 repo.recordKanaPractice 内）
    await repo.recordKanaPractice(UID, 'lv_kana_last', true, 'HIRAGANA');
    expect(await levelOf(repo)).toBe('NOVICE');
  });

  it('日常失误保留中级资格', async () => {
    await setLevel(repo, 'ja', 'INTERMEDIATE');
    await kanaGood(repo, 30);
    await wrongQuizzes(repo, 3);
    expect(await levelOf(repo)).toBe('INTERMEDIATE');
  });

  it('hint 给出升级进度', async () => {
    await setLevel(repo, 'ja', 'NOVICE');
    const info = await repo.getLevelInfo(UID, 'ja');
    expect(isOk(info)).toBe(true);
    if (!isOk(info)) return;
    expect(info.value.level).toBe('NOVICE');
    expect(info.value.hint).toContain('初级');
  });
});

describe('placement exam（跳级通道）', () => {
  let repo: DrizzleLearnerRepository;
  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
  });

  it('目标不高于当前档拒绝；字母量不够拒绝', async () => {
    await setLevel(repo, 'ja', 'BEGINNER');
    const low = await repo.startPlacementExam(UID, 'ja', 'NOVICE');
    expect(isOk(low)).toBe(false);
    const notReady = await repo.startPlacementExam(UID, 'ja', 'INTERMEDIATE');
    expect(isOk(notReady)).toBe(false);
    if (!isOk(notReady)) {
      expect(notReady.error.code).toBe('E_EXAM_NOT_READY');
    }
  });

  it('通过：字母达标+卷面≥80%→写档；可重考（挂了能再开）', async () => {
    await setLevel(repo, 'ja', 'NOVICE');
    await kanaGood(repo, 15);
    const started = await repo.startPlacementExam(UID, 'ja', 'BEGINNER');
    expect(isOk(started)).toBe(true);
    if (!isOk(started)) return;
    // 同语种同时只能一场 pending
    const dup = await repo.startPlacementExam(UID, 'ja', 'BEGINNER');
    expect(isOk(dup)).toBe(false);

    const incomplete = await repo.finishPlacementExam(UID, started.value.exam.id);
    expect(isOk(incomplete)).toBe(false);
    if (!isOk(incomplete)) expect(incomplete.error.code).toBe('E_EXAM_INCOMPLETE');
    const stillOpen = await repo.getPracticePlanRun(UID, started.value.runId);
    expect(isOk(stillOpen) && stillOpen.value?.status).not.toBe('COMPLETED');
    // 20 道全对（直接落 graded 尝试，绕开 runner UI）
    for (let i = 0; i < 20; i++) {
      repo
        .getRawDb()
        .prepare(
          `INSERT INTO practice_item_attempts
             (id, run_id, block_id, item_id, status, user_answer, grading_result_json, time_spent_ms, submitted_at, graded_at)
           VALUES (?, ?, 'b1', ?, 'GRADED', 'x', ?, 1000, ?, ?)`
        )
        .run(
          `lv_att_${i}`,
          started.value.runId,
          `lv_item_${i}`,
          JSON.stringify({ isCorrect: true, score: 1, testedSkillId: 'jp.vocab.review' }),
          new Date().toISOString(),
          new Date().toISOString()
        );
    }
    const finished = await repo.finishPlacementExam(UID, started.value.exam.id);
    expect(isOk(finished)).toBe(true);
    if (!isOk(finished)) return;
    expect(finished.value.passed).toBe(true);
    expect(finished.value.level).toBe('BEGINNER');
    expect(await levelOf(repo)).toBe('BEGINNER');
  });

  it('挂科：准确率不够→failed，档位不动，可再开一场', async () => {
    await setLevel(repo, 'ja', 'NOVICE');
    await kanaGood(repo, 15);
    const started = await repo.startPlacementExam(UID, 'ja', 'BEGINNER');
    if (!isOk(started)) return;
    for (let i = 0; i < 20; i++) {
      repo
        .getRawDb()
        .prepare(
          `INSERT INTO practice_item_attempts
             (id, run_id, block_id, item_id, status, user_answer, grading_result_json, time_spent_ms, submitted_at, graded_at)
           VALUES (?, ?, 'b1', ?, 'GRADED', 'x', ?, 1000, ?, ?)`
        )
        .run(
          `lv_attf_${i}`,
          started.value.runId,
          `lv_itemf_${i}`,
          JSON.stringify({ isCorrect: i < 2, score: i < 2 ? 1 : 0, testedSkillId: 'jp.vocab.review' }),
          new Date().toISOString(),
          new Date().toISOString()
        );
    }
    const finished = await repo.finishPlacementExam(UID, started.value.exam.id);
    expect(isOk(finished)).toBe(true);
    if (!isOk(finished)) return;
    expect(finished.value.passed).toBe(false);
    expect(await levelOf(repo)).toBe('NOVICE');
    // 可重考
    const retry = await repo.startPlacementExam(UID, 'ja', 'BEGINNER');
    expect(isOk(retry)).toBe(true);
  });

  it('考试通过当天豁免掉级', async () => {
    await setLevel(repo, 'ja', 'NOVICE');
    await kanaGood(repo, 15);
    const started = await repo.startPlacementExam(UID, 'ja', 'BEGINNER');
    if (!isOk(started)) return;
    for (let i = 0; i < 20; i++) {
      repo
        .getRawDb()
        .prepare(
          `INSERT INTO practice_item_attempts
             (id, run_id, block_id, item_id, status, user_answer, grading_result_json, time_spent_ms, submitted_at, graded_at)
           VALUES (?, ?, 'b1', ?, 'GRADED', 'x', ?, 1000, ?, ?)`
        )
        .run(
          `lv_atte_${i}`,
          started.value.runId,
          `lv_iteme_${i}`,
          JSON.stringify({ isCorrect: true, score: 1, testedSkillId: 'jp.vocab.review' }),
          new Date().toISOString(),
          new Date().toISOString()
        );
    }
    const finished = await repo.finishPlacementExam(UID, started.value.exam.id);
    expect(isOk(finished)).toBe(true);
    // 当天考过，接着做题拉胯也不掉
    await wrongQuizzes(repo, 3);
    expect(await levelOf(repo)).toBe('BEGINNER');
  });

  it('交卷题数不够拒绝（<10 已评）', async () => {
    await setLevel(repo, 'ja', 'NOVICE');
    await kanaGood(repo, 15);
    const started = await repo.startPlacementExam(UID, 'ja', 'BEGINNER');
    if (!isOk(started)) return;
    const finished = await repo.finishPlacementExam(UID, started.value.exam.id);
    expect(isOk(finished)).toBe(false);
  });

  it('迁移 v6 落库（placement_exams）', () => {
    const rows = repo
      .getRawDb()
      .query<{ version: number }, []>(
        'SELECT version AS version FROM schema_migrations ORDER BY version'
      )
      .all();
    expect(rows.map((r) => r.version)).toContain(6);
    const tbl = repo
      .getRawDb()
      .query<{ name: string }, []>(
        "SELECT name AS name FROM sqlite_master WHERE type = 'table' AND name = 'placement_exams'"
      )
      .get();
    expect(tbl?.name).toBe('placement_exams');
  });
});
