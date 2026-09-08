import {
  ok,
  err,
  type Result,
  BusinessError,
  translateToBusinessError,
} from '@study-studio/shared';
import { parseTextbookAST } from '@study-studio/protocol';
import type { RepoDeps } from '../../../infrastructure/persistence/repo-context.js';
import {
  normalizeTrackLanguage,
  type TrackLanguage,
} from '../../../infrastructure/persistence/language.js';

export interface TextbookFocus {
  documentId: string;
  bookTitle: string;
  lessonId: string;
  lessonTitle: string;
  lessonNumber: number;
}

interface FocusRow {
  document_id: string;
  locator: string;
  doc_title: string;
  doc_language: string;
  ast_json: string | null;
}

/**
 * 教材焦点 = 最近读到的教材课次（给今日计划指“学哪课”）。
 * 数据源复用 reading_positions（切课即记，已有链路），只认带 AST 课次的文档；
 * 无记录/课次对不上返回 null（计划保持原样，不挡主路径）。
 */
export async function getTextbookFocus(
  deps: RepoDeps,
  userId: string,
  language: string
): Promise<Result<TextbookFocus | null, BusinessError>> {
  try {
    const track: TrackLanguage = normalizeTrackLanguage(language);
    const rows = deps.sqlite
      .query(
        `SELECT rp.document_id AS document_id, rp.locator AS locator,
                d.title AS doc_title, d.language AS doc_language, d.ast_json AS ast_json
         FROM reading_positions rp JOIN documents d ON d.id = rp.document_id
         WHERE rp.user_id = ? AND (d.user_id = ? OR d.source_kind = 'curriculum_textbook')
           AND d.ast_json IS NOT NULL
         ORDER BY rp.updated_at DESC LIMIT 10`
      )
      .all(userId, userId) as FocusRow[];
    for (const row of rows) {
      if ((row.doc_language || '').toLowerCase() !== track) continue;
      let lessonId = '';
      try {
        const locator = JSON.parse(row.locator || '{}') as { lessonId?: unknown };
        if (typeof locator.lessonId === 'string') lessonId = locator.lessonId;
      } catch {
        continue;
      }
      if (!lessonId) continue;
      let astRaw: unknown = null;
      try {
        astRaw = JSON.parse(row.ast_json as string);
      } catch {
        continue;
      }
      const parsed = parseTextbookAST(astRaw);
      if (parsed.ok !== true) continue;
      const lesson = parsed.value.lessons.find((l) => l.id === lessonId);
      if (!lesson) continue;
      return ok({
        documentId: row.document_id,
        bookTitle: row.doc_title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        lessonNumber: lesson.lessonNumber,
      });
    }
    return ok(null);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'getTextbookFocus',
        entityId: userId,
      })
    );
  }
}
