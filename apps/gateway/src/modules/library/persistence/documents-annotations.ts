import { eq, and, desc } from 'drizzle-orm';
import {
  ok,
  err,
  type Result,
  BusinessError,
  translateToBusinessError,
  generateId,
  nowIso,
} from '@study-studio/shared';
import type { DocumentItem, AnnotationItem, Flashcard } from '@study-studio/protocol';
import { documents, annotations } from '../../../infrastructure/db/index.js';
import type { RepoDeps } from '../../../infrastructure/persistence/repo-context.js';

/**
 * 文档/批注域（由 DrizzleLearnerRepository 搬迁而来，行为不变）。
 * 跨域调用一律走 `deps.repo`（接口方法）；同域互调直接调模块函数。
 */

export async function saveDocument(
  deps: RepoDeps,
  doc: DocumentItem
): Promise<Result<DocumentItem, BusinessError>> {
  try {
    const existing = await deps.db
      .select()
      .from(documents)
      .where(eq(documents.id, doc.id))
      .limit(1);

    if (existing.length > 0) {
      await deps.db
        .update(documents)
        .set({
          title: doc.title,
          sourceKind: doc.sourceKind,
          language: doc.language,
          content: doc.content,
          astJson: doc.astJson ?? null,
          topic: doc.topic ?? null,
          difficulty: doc.difficulty ?? null,
          sourceUrl: doc.sourceUrl ?? null,
          sourcePublisher: doc.sourcePublisher ?? null,
          examTag: doc.examTag ?? null,
          updatedAt: doc.updatedAt || nowIso(),
        })
        .where(eq(documents.id, doc.id));
    } else {
      await deps.db.insert(documents).values({
        id: doc.id,
        userId: doc.userId,
        title: doc.title,
        sourceKind: doc.sourceKind,
        language: doc.language,
        content: doc.content,
        astJson: doc.astJson ?? null,
        topic: doc.topic ?? null,
        difficulty: doc.difficulty ?? null,
        sourceUrl: doc.sourceUrl ?? null,
        sourcePublisher: doc.sourcePublisher ?? null,
        examTag: doc.examTag ?? null,
        createdAt: doc.createdAt || nowIso(),
        updatedAt: doc.updatedAt || nowIso(),
      });
    }

    return ok(doc);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'saveDocument',
        entityId: doc.id,
      })
    );
  }
}

export async function listDocuments(
  deps: RepoDeps,
  userId: string,
  sourceKind?: string
): Promise<Result<DocumentItem[], BusinessError>> {
  try {
    const query = deps.db.select().from(documents);
    const conditions = [eq(documents.userId, userId)];
    if (sourceKind) {
      conditions.push(eq(documents.sourceKind, sourceKind));
    }

    const rows = await query
      .where(and(...conditions))
      .orderBy(desc(documents.updatedAt));

    const items: DocumentItem[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      title: r.title,
      sourceKind: r.sourceKind as any,
      language: r.language,
      content: r.content,
      astJson: r.astJson ?? undefined,
      topic: r.topic ?? undefined,
      difficulty: r.difficulty ?? undefined,
      sourceUrl: r.sourceUrl ?? undefined,
      sourcePublisher: r.sourcePublisher ?? undefined,
      examTag: r.examTag ?? undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return ok(items);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'listDocuments',
        entityId: userId,
      })
    );
  }
}

export async function getDocumentById(
  deps: RepoDeps,
  id: string
): Promise<Result<DocumentItem | null, BusinessError>> {
  try {
    const rows = await deps.db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (rows.length === 0) {
      return ok(null);
    }

    const r = rows[0]!;
    return ok({
      id: r.id,
      userId: r.userId,
      title: r.title,
      sourceKind: r.sourceKind as any,
      language: r.language,
      content: r.content,
      astJson: r.astJson ?? undefined,
      topic: r.topic ?? undefined,
      difficulty: r.difficulty ?? undefined,
      sourceUrl: r.sourceUrl ?? undefined,
      sourcePublisher: r.sourcePublisher ?? undefined,
      examTag: r.examTag ?? undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'getDocumentById',
        entityId: id,
      })
    );
  }
}

export async function deleteDocument(
  deps: RepoDeps,
  id: string,
  userId: string
): Promise<Result<void, BusinessError>> {
  try {
    await deps.db
      .delete(annotations)
      .where(and(eq(annotations.documentId, id), eq(annotations.userId, userId)));
    await deps.db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)));
    return ok(undefined);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'deleteDocument',
        entityId: id,
      })
    );
  }
}

export async function saveAnnotation(
  deps: RepoDeps,
  ann: AnnotationItem
): Promise<Result<AnnotationItem, BusinessError>> {
  try {
    await deps.db.insert(annotations).values({
      id: ann.id,
      documentId: ann.documentId,
      userId: ann.userId,
      kind: ann.kind,
      quote: ann.quote,
      note: ann.note ?? null,
      startOffset: ann.startOffset,
      endOffset: ann.endOffset,
      pageNumber: ann.pageNumber ?? null,
      createdBy: ann.createdBy,
      flashcardId: ann.flashcardId ?? null,
      createdAt: ann.createdAt || nowIso(),
    });

    return ok(ann);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'saveAnnotation',
        entityId: ann.id,
      })
    );
  }
}

export async function listAnnotations(
  deps: RepoDeps,
  documentId: string,
  userId: string
): Promise<Result<AnnotationItem[], BusinessError>> {
  try {
    const rows = await deps.db
      .select()
      .from(annotations)
      .where(and(eq(annotations.documentId, documentId), eq(annotations.userId, userId)))
      .orderBy(desc(annotations.createdAt));

    const items: AnnotationItem[] = rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      userId: r.userId,
      kind: r.kind as any,
      quote: r.quote,
      note: r.note ?? undefined,
      startOffset: r.startOffset,
      endOffset: r.endOffset,
      pageNumber: r.pageNumber ?? undefined,
      createdBy: r.createdBy as any,
      flashcardId: r.flashcardId ?? undefined,
      createdAt: r.createdAt,
    }));

    return ok(items);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'listAnnotations',
        entityId: documentId,
      })
    );
  }
}

export async function deleteAnnotation(
  deps: RepoDeps,
  annotationId: string,
  userId: string
): Promise<Result<void, BusinessError>> {
  try {
    await deps.db
      .delete(annotations)
      .where(and(eq(annotations.id, annotationId), eq(annotations.userId, userId)));
    return ok(undefined);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'deleteAnnotation',
        entityId: annotationId,
      })
    );
  }
}

export async function convertAnnotationToCard(
  deps: RepoDeps,
  annotationId: string,
  userId: string,
  cardData: {
    front: string;
    back: string;
    tag?: string | undefined;
    pos?: string | undefined;
    phonetic?: string | undefined;
  }
): Promise<Result<Flashcard, BusinessError>> {
  try {
    const rows = await deps.db
      .select()
      .from(annotations)
      .where(and(eq(annotations.id, annotationId), eq(annotations.userId, userId)))
      .limit(1);

    if (rows.length === 0) {
      return err(new BusinessError('E_NOT_FOUND', '未找到对应的批注记录', 'DATABASE'));
    }

    const ann = rows[0]!;
    const cardId = generateId('card_ann');
    const now = nowIso();

    const newCard: Flashcard = {
      id: cardId,
      userId,
      type: 'VOCABULARY',
      front: cardData.front,
      back: cardData.back,
      phonetic: cardData.phonetic || undefined,
      audioUrl: undefined,
      tags: [cardData.tag || '课文批注', cardData.pos || '重点词句'],
      fsrs: {
        stability: 1.0,
        difficulty: 5.0,
        reps: 0,
        lapses: 0,
        dueAt: now,
        state: 'NEW',
      },
    };

    // 1. 插入 flashcards（跨域：走外观 saveCard）
    await deps.repo.saveCard(newCard);

    // 2. 回填批注关联卡片 ID
    await deps.db
      .update(annotations)
      .set({ flashcardId: cardId })
      .where(eq(annotations.id, annotationId));

    return ok(newCard);
  } catch (error) {
    return err(
      translateToBusinessError(error, {
        category: 'DATABASE',
        action: 'convertAnnotationToCard',
        entityId: annotationId,
      })
    );
  }
}
