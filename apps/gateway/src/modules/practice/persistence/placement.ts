import { and, eq } from 'drizzle-orm';
import {
  ok,
  err,
  isOk,
  type Result,
  BusinessError,
  translateToBusinessError,
  generateId,
  nowIso,
  logger,
} from '@study-studio/shared';
import type { LearnerLevel } from '@study-studio/protocol';
import type { PracticeBlockSpec } from '@study-studio/protocol';
import { learnerLanguageProfiles } from '../../../infrastructure/db/index.js';
import type { RepoDeps } from '../../../infrastructure/persistence/repo-context.js';
import type { TrackLanguage } from '../../../infrastructure/persistence/language.js';
import {
  setTrackLevel,
} from '../../learning-progress/persistence/level.js';
import {
  startPracticePlanRun,
  finalizePracticePlanRun,
  listPracticeItemAttempts,
  getPracticePlanRun,
} from './practice-plan.js';
import { LEVEL_THRESHOLDS } from '@study-studio/learner-core';

const LEVEL_SET: LearnerLevel[] = ['NOVICE', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const EXAM_MIN_GRADED = LEVEL_THRESHOLDS.examVocabQuestions;

export interface PlacementExam {
  id: string;
  userId: string;
  language: TrackLanguage;
  targetLevel: LearnerLevel;
  runId: string;
  status: 'pending' | 'passed' | 'failed';
  accuracy?: number | undefined;
  createdAt: string;
  completedAt?: string | undefined;
}

interface PlacementExamRow {
  id: string;
  user_id: string;
  language: string;
  target_level: string;
  run_id: string;
  status: string;
  accuracy: number | null;
  created_at: string;
  completed_at: string | null;
}

function toPlacementExam(row: PlacementExamRow): PlacementExam {
  const exam: PlacementExam = {
    id: row.id,
    userId: row.user_id,
    language: (row.language === 'ko' ? 'ko' : row.language === 'en' ? 'en' : 'ja'),
    targetLevel: (LEVEL_SET as string[]).includes(row.target_level)
      ? (row.target_level as LearnerLevel)
      : 'BEGINNER',
    runId: row.run_id,
    status: row.status === 'passed' ? 'passed' : row.status === 'failed' ? 'failed' : 'pending',
    createdAt: row.created_at,
  };
  if (row.accuracy !== null) exam.accuracy = row.accuracy;
  if (row.completed_at) exam.completedAt = row.completed_at;
  return exam;
}

function narrowLevel(raw: unknown): LearnerLevel | null {
  return typeof raw === 'string' && (LEVEL_SET as string[]).includes(raw)
    ? (raw as LearnerLevel)
    : null;
}

/**
 * 是否定级考 run（难度门豁免判定：定级考的使命就是往上探，不设上限）。
 * 查不到表/行一律返回 false（不拦正常装配）。
 */
export function isPlacementRunId(deps: RepoDeps, runId: string): boolean {
  try {
    const row = deps.sqlite
      .query('SELECT id AS id FROM placement_exams WHERE run_id = ? LIMIT 1')
      .get(runId) as { id: string } | null;
    return row !== null;
  } catch {
    return false;
  }
}

async function currentLevelOf(
  deps: RepoDeps,
  userId: string,
  track: TrackLanguage
): Promise<LearnerLevel> {
  const rows = await deps.db
    .select({ learnerLevel: learnerLanguageProfiles.learnerLevel })
    .from(learnerLanguageProfiles)
    .where(
      and(eq(learnerLanguageProfiles.userId, userId), eq(learnerLanguageProfiles.language, track))
    )
    .limit(1);
  return narrowLevel(rows[0]?.learnerLevel) ?? 'BEGINNER';
}

/**
 * 开考：目标档必须高于当前档；同语种同时只能有一场 pending。
 * ja/ko 考 BEGINNER 及以上先验字母量（累计尝试≥15），不够直接拒绝并指路字母工作室。
 * 考卷 = QUIZ×20 的练习 run（组卷走既有装配，答题走既有 runner），本函数只建 run + 登记，不组卷（组卷在路由层调 assemble）。
 */
export async function startPlacementExam(
  deps: RepoDeps,
  userId: string,
  track: TrackLanguage,
  targetLevel: LearnerLevel
): Promise<Result<{ exam: PlacementExam; runId: string }, BusinessError>> {
  try {
    const current = await currentLevelOf(deps, userId, track);
    if (LEVEL_SET.indexOf(targetLevel) <= LEVEL_SET.indexOf(current)) {
      return err(
        new BusinessError('E_INVALID_INPUT', `目标档须高于当前档（当前${current}）`, 'VALIDATION')
      );
    }
    const pending = deps.sqlite
      .query(
        `SELECT id AS id FROM placement_exams
         WHERE user_id = ? AND language = ? AND status = 'pending' LIMIT 1`
      )
      .get(userId, track) as { id: string } | null;
    if (pending) {
      return err(
        new BusinessError('E_EXAM_IN_PROGRESS', '有未完成的定级考，先交卷或等它过期', 'VALIDATION')
      );
    }
    if (track !== 'en') {
      const snapshotRes = await deps.repo.getProfileSnapshot(userId, track);
      const metrics = isOk(snapshotRes) ? (snapshotRes.value.allMetrics ?? []) : [];
      const prefix = track === 'ko' ? 'ko.hangul.' : 'jp.kana.';
      const attempts = metrics
        .filter((m) => m.id.startsWith(prefix))
        .reduce((s, m) => s + m.totalAttempts, 0);
      if (attempts < LEVEL_THRESHOLDS.examAlphabetQuestions) {
        return err(
          new BusinessError(
            'E_EXAM_NOT_READY',
            `先去字母工作室做满 ${LEVEL_THRESHOLDS.examAlphabetQuestions} 道（当前 ${attempts} 道），再来考`,
            'VALIDATION'
          )
        );
      }
    }
    const blocks: PracticeBlockSpec[] = [
      {
        id: generateId('blk'),
        kind: 'QUIZ',
        count: LEVEL_THRESHOLDS.examVocabQuestions,
        gradingMode: 'AUTO_IMMEDIATE',
      },
    ];
    const runRes = await startPracticePlanRun(deps, userId, { language: track, blocks });
    if (!isOk(runRes)) return err(runRes.error);
    const id = generateId('pexam');
    const now = nowIso();
    deps.sqlite
      .query(
        `INSERT INTO placement_exams
           (id, user_id, language, target_level, run_id, status, accuracy, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)`
      )
      .run(id, userId, track, targetLevel, runRes.value.id, now);
    const row = deps.sqlite
      .query(
        `SELECT id, user_id, language, target_level, run_id, status, accuracy, created_at, completed_at
         FROM placement_exams WHERE id = ?`
      )
      .get(id) as PlacementExamRow;
    return ok({ exam: toPlacementExam(row), runId: runRes.value.id });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'startPlacementExam',
        entityId: userId,
      })
    );
  }
}

export interface PlacementFinishResult {
  passed: boolean;
  accuracy: number;
  graded: number;
  level: LearnerLevel;
}

/**
 * 交卷：finalize run → 按 GRADED 尝试算准确率（<10 题判卷面不完整）→
 * 字母线（ja/ko：累计尝试≥15 且准确率≥80%）→ 过线写档并完成考试行。
 * 可重考：挂了就是 failed，再开一场新的。
 */
export async function finishPlacementExam(
  deps: RepoDeps,
  userId: string,
  examId: string
): Promise<Result<PlacementFinishResult, BusinessError>> {
  try {
    const row = deps.sqlite
      .query(
        `SELECT id, user_id, language, target_level, run_id, status, accuracy, created_at, completed_at
         FROM placement_exams WHERE id = ? AND user_id = ?`
      )
      .get(examId, userId) as PlacementExamRow | null;
    if (!row) {
      return err(new BusinessError('E_NOT_FOUND', '定级考不存在', 'LEARNER_STATE'));
    }
    const exam = toPlacementExam(row);
    if (exam.status !== 'pending') {
      return err(new BusinessError('E_INVALID_INPUT', '这场考试已交卷', 'VALIDATION'));
    }
    const runRes = await getPracticePlanRun(deps, userId, exam.runId);
    if (!isOk(runRes) || !runRes.value) {
      return err(new BusinessError('E_RUN_NOT_FOUND', '考试用卷未找到', 'DATABASE'));
    }
    const attemptsRes = await listPracticeItemAttempts(deps, exam.runId);
    if (!isOk(attemptsRes)) return err(attemptsRes.error);
    const graded = attemptsRes.value.filter((a) => a.status === 'GRADED' && a.gradingResult);
    if (graded.length < EXAM_MIN_GRADED) {
      return err(
        new BusinessError(
          'E_EXAM_INCOMPLETE',
          `至少答完 ${EXAM_MIN_GRADED} 道才交卷（当前 ${graded.length} 道）`,
          'VALIDATION'
        )
      );
    }
    const finRes = await finalizePracticePlanRun(deps, userId, exam.runId);
    if (!isOk(finRes)) return err(finRes.error);
    const correct = graded.filter((a) => {
      const g = a.gradingResult as { isCorrect?: unknown } | undefined;
      return g?.isCorrect === true;
    }).length;
    const accuracy = graded.length > 0 ? correct / graded.length : 0;

    let alphabetOk = true;
    if (exam.language !== 'en') {
      const snapshotRes = await deps.repo.getProfileSnapshot(userId, exam.language);
      const metrics = isOk(snapshotRes) ? (snapshotRes.value.allMetrics ?? []) : [];
      const prefix = exam.language === 'ko' ? 'ko.hangul.' : 'jp.kana.';
      const rows = metrics.filter((m) => m.id.startsWith(prefix));
      const attempts = rows.reduce((s, m) => s + m.totalAttempts, 0);
      const hits = rows.reduce((s, m) => s + m.correctAttempts, 0);
      alphabetOk =
        attempts >= LEVEL_THRESHOLDS.examAlphabetQuestions &&
        (attempts === 0 ? false : hits / attempts >= LEVEL_THRESHOLDS.examPass);
    }
    const passed = accuracy >= LEVEL_THRESHOLDS.examPass && alphabetOk;
    const now = nowIso();
    deps.sqlite
      .query(`UPDATE placement_exams SET status = ?, accuracy = ?, completed_at = ? WHERE id = ?`)
      .run(passed ? 'passed' : 'failed', accuracy, now, examId);
    let level = await currentLevelOf(deps, userId, exam.language);
    if (passed) {
      const written = await setTrackLevel(deps, userId, exam.language, exam.targetLevel);
      if (!isOk(written)) {
        logger.warn('[placement] setTrackLevel failed', { code: written.error.code, examId });
      } else {
        level = written.value;
      }

    }
    return ok({ passed, accuracy, graded: graded.length, level });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'finishPlacementExam',
        entityId: examId,
      })
    );
  }
}
