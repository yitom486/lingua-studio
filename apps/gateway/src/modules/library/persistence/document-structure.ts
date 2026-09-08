import {
  ok,
  err,
  isOk,
  type Result,
  BusinessError,
  translateToBusinessError,
  nowIso,
} from '@study-studio/shared';
import type { RepoDeps } from '../../../infrastructure/persistence/repo-context.js';
import { getDocumentById } from './documents-annotations.js';
import type {
  HeadingCandidate,
  StructureClass,
} from '@study-studio/protocol';

export interface SavedDocumentStructure {
  documentId: string;
  userId: string;
  headings: HeadingCandidate[];
  classes: StructureClass[];
  model: string;
  effort: string;
  dropped: number;
  createdAt: string;
}

function parseJsonArray(raw: unknown): Array<Record<string, unknown>> {
  try {
    if (typeof raw !== 'string' || !raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

/**
 * 保存文档结构分类（幂等全量覆盖；文档归属校验：自有或公共种子）。
 * headings/classes 由调用方（classify 路由）校验后传入，此处只做归属与落库。
 */
export async function saveDocumentStructure(
  deps: RepoDeps,
  userId: string,
  documentId: string,
  input: {
    headings: HeadingCandidate[];
    classes: StructureClass[];
    model: string;
    effort: string;
    dropped: number;
  }
): Promise<Result<SavedDocumentStructure, BusinessError>> {
  try {
    const got = await getDocumentById(deps, documentId);
    if (!isOk(got)) return err(got.error);
    const doc = got.value;
    if (!doc || (doc.userId !== userId && doc.sourceKind !== 'curriculum_textbook')) {
      return err(new BusinessError('E_NOT_FOUND', '未找到指定的教材或文档', 'LEARNER_STATE'));
    }
    const now = nowIso();
    deps.sqlite
      .query(
        `INSERT INTO document_structure
           (document_id, user_id, headings_json, classes_json, model, effort, dropped, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(document_id) DO UPDATE SET
           headings_json = excluded.headings_json,
           classes_json = excluded.classes_json,
           model = excluded.model,
           effort = excluded.effort,
           dropped = excluded.dropped,
           created_at = excluded.created_at`
      )
      .run(
        documentId,
        userId,
        JSON.stringify(input.headings),
        JSON.stringify(input.classes),
        input.model,
        input.effort,
        input.dropped,
        now
      );
    return ok({
      documentId,
      userId,
      headings: input.headings,
      classes: input.classes,
      model: input.model,
      effort: input.effort,
      dropped: input.dropped,
      createdAt: now,
    });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'saveDocumentStructure',
        entityId: documentId,
      })
    );
  }
}

/** 读取文档结构分类（无记录返回 null，不报错）。 */
export async function getDocumentStructure(
  deps: RepoDeps,
  userId: string,
  documentId: string
): Promise<Result<SavedDocumentStructure | null, BusinessError>> {
  try {
    const row = deps.sqlite
      .query(
        `SELECT document_id AS documentId, user_id AS userId, headings_json AS headingsJson,
                classes_json AS classesJson, model AS model, effort AS effort,
                dropped AS dropped, created_at AS createdAt
         FROM document_structure WHERE document_id = ? AND user_id = ?`
      )
      .get(documentId, userId) as
      | {
          documentId: string;
          userId: string;
          headingsJson: string;
          classesJson: string;
          model: string;
          effort: string;
          dropped: number;
          createdAt: string;
        }
      | null;
    if (!row) return ok(null);
    const headings = parseJsonArray(row.headingsJson)
      .filter((h) => typeof h.text === 'string' && typeof h.page === 'number')
      .map((h) => ({ page: h.page as number, text: h.text as string }));
    const classes = parseJsonArray(row.classesJson)
      .filter((c) => typeof c.text === 'string' && typeof c.kind === 'string')
      .map((c) => ({
        text: c.text as string,
        page: typeof c.page === 'number' ? c.page : 0,
        kind: c.kind as StructureClass['kind'],
        lessonNo: typeof c.lessonNo === 'string' ? c.lessonNo : null,
        skillId: typeof c.skillId === 'string' ? c.skillId : null,
      }));
    return ok({
      documentId: row.documentId,
      userId: row.userId,
      headings,
      classes,
      model: row.model,
      effort: row.effort,
      dropped: row.dropped,
      createdAt: row.createdAt,
    });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'getDocumentStructure',
        entityId: documentId,
      })
    );
  }
}
