import {
  ok,
  err,
  type Result,
  BusinessError,
  translateToBusinessError,
  nowIso,
} from '@study-studio/shared';
import {
  resolveCourseRoute,
  type CourseRouteSnapshot,
  type UnitEvidence,
} from '@study-studio/learner-core';
import type { RepoDeps } from '../../../infrastructure/persistence/repo-context.js';
import {
  normalizeTrackLanguage,
  type TrackLanguage,
} from '../../../infrastructure/persistence/language.js';

/**
 * 课程路线（长期路线，不随每日重置；每日计划从中取任务）。
 * 证据全部来自既有表：quiz_attempts（分项正确率）/ kana_practice_states（覆盖）/
 * lesson_progress（讲义）/ flashcards.studied_at（生词）/ placement_exams（测评）。
 * unit_progress 只记 mastered 结论（+证据快照）；已记录永不自动收回，
 * 遗忘走错题/复习建议，不锁回。
 */

async function collectEvidence(
  deps: RepoDeps,
  userId: string,
  track: TrackLanguage
): Promise<UnitEvidence> {
  const kanaRows = deps.sqlite
    .query(
      `SELECT kana_id AS kanaId FROM kana_practice_states
       WHERE user_id = ? AND consecutive_errors = 0`
    )
    .all(userId) as Array<{ kanaId: string }>;
  const kanaOk = [...new Set(kanaRows.map((r) => r.kanaId))];

  const quizRows = deps.sqlite
    .query(
      `SELECT tested_skill_id AS skillId, COUNT(*) AS n, SUM(is_correct) AS c
       FROM quiz_attempts WHERE user_id = ? AND language = ? GROUP BY tested_skill_id`
    )
    .all(userId, track) as Array<{ skillId: string; n: number; c: number }>;
  const quizBySkill: Record<string, { attempts: number; correct: number }> = {};
  for (const r of quizRows) {
    quizBySkill[r.skillId] = { attempts: r.n, correct: r.c ?? 0 };
  }

  const lessonRows = deps.sqlite
    .query('SELECT skill_id AS skillId FROM lesson_progress WHERE user_id = ?')
    .all(userId) as Array<{ skillId: string }>;

  const wordRows = deps.sqlite
    .query(
      `SELECT source_entry_id AS entryId FROM flashcards
       WHERE user_id = ? AND studied_at IS NOT NULL AND source_entry_id IS NOT NULL`
    )
    .all(userId) as Array<{ entryId: string }>;

  const examRows = deps.sqlite
    .query(
      `SELECT target_level AS targetLevel FROM placement_exams
       WHERE user_id = ? AND language = ? AND status = 'passed'`
    )
    .all(userId, track) as Array<{ targetLevel: string }>;

  return {
    kanaOk,
    quizBySkill,
    lessonsDone: lessonRows.map((r) => r.skillId),
    wordsStudied: wordRows.map((r) => r.entryId),
    examsPassed: [...new Set(examRows.map((r) => r.targetLevel))],
  };
}

function wordGroupIds(deps: RepoDeps, track: TrackLanguage): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const groups: Array<[string, string]> =
    track === 'ja'
      ? [['ja-n5-core', 'n5_ja_%']]
      : track === 'ko'
        ? [['ko-starter', 'starter_ko_%']]
        : [['en-starter', 'starter_en_%']];
  for (const [group, like] of groups) {
    const rows = deps.sqlite
      .query('SELECT id AS id FROM local_dictionary_entries WHERE language = ? AND id LIKE ? ORDER BY rowid ASC')
      .all(track, like) as Array<{ id: string }>;
    out[group] = rows.map((r) => r.id);
  }
  return out;
}

/** 路线求值 + 新掌握写档（幂等；写档失败只 warn，不挡返回）。 */
export async function getCourseRoute(
  deps: RepoDeps,
  userId: string,
  language: string
): Promise<Result<CourseRouteSnapshot, BusinessError>> {
  try {
    const track = normalizeTrackLanguage(language);
    const evidence = await collectEvidence(deps, userId, track);
    const recordedRows = deps.sqlite
      .query("SELECT unit_id AS unitId FROM unit_progress WHERE user_id = ? AND status = 'mastered'")
      .all(userId) as Array<{ unitId: string }>;
    const recorded = new Set(recordedRows.map((r) => r.unitId));
    const resolvedWords = wordGroupIds(deps, track);
    const units = resolveCourseRoute(track, evidence, recorded, resolvedWords);
    const fresh = units.filter((u) => u.status === 'mastered' && !recorded.has(u.unit.id));
    if (fresh.length > 0) {
      try {
        const now = nowIso();
        const stmt = deps.sqlite.prepare(
          `INSERT OR IGNORE INTO unit_progress (user_id, unit_id, status, evidence_json, updated_at)
           VALUES (?, ?, 'mastered', ?, ?)`
        );
        for (const f of fresh) {
          stmt.run(userId, f.unit.id, JSON.stringify({ progress: f.progress, at: now }), now);
        }
      } catch {
        // 写档失败不挡路线返回（下次调用补记）。
      }
    }
    const next = units.find((u) => u.status === 'available') ?? null;
    return ok({ units, nextUpId: next ? next.unit.id : null });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'getCourseRoute',
        entityId: userId,
      })
    );
  }
}
