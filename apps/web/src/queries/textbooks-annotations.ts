import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@study-studio/shared';
import { parseTextbookAST, type TextbookAST } from '@study-studio/protocol';
import { apiClient, GATEWAY_BASE_URL } from '../lib/api-client.js';
import type { TextbookBook } from '../models/textbook.js';
import { DEFAULT_USER_ID, QUERY_KEYS } from './query-keys.js';

/** P1-2 拆分：教材 / 批注组（自 useLearnerQueries.ts 逐行平移，仅改 import）。 */

/**
 * 教材知识树查询（Gateway documents 为 SSOT；空库 / 失败时返回空数组，
 * 由 UI 显式提示导入或等待内置课程种子，不再回退到前端内置教材内容）。
 *
 * QueryKey 豁免说明（G2）：本键不带 track——documents 按 userId 隔离，
 * 教材 Tab 仅在 ja 轨道开放（见 learning-shell allowedTabs），无跨语种串扰；
 * kana 为 JA 唯一底座、news-topics 为语言中立，均同理豁免。
 */
export function useTextbooksQuery(userId = DEFAULT_USER_ID) {
  return useQuery<TextbookBook[]>({
    queryKey: [...QUERY_KEYS.TEXTBOOKS, userId],
    queryFn: async () => {
      try {
        const res = await apiClient.api.documents[':userId'].$get({ param: { userId } });
        if (res.ok) {
          const docs = await res.json();
          if (Array.isArray(docs) && docs.length > 0) {
            const dynamicBooks: TextbookBook[] = [];
            for (const doc of docs) {
              if (doc.astJson) {
                try {
                  const parsed = JSON.parse(doc.astJson);
                  if (parsed && parsed.id && Array.isArray(parsed.lessons)) {
                    dynamicBooks.push({ ...(parsed as TextbookBook), documentId: doc.id });
                  }
                } catch {
                  // ignore corrupt ast
                }
              }
            }
            return dynamicBooks;
          }
        }
      } catch (e) {
        logger.debug('[useTextbooksQuery] failed to load documents from gateway', e);
      }
      return [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** 追加导入教材并持久化至 Gateway SQLite */
export function useImportTextbookMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (book: TextbookBook) => {
      try {
        // TextbookBook 类型无 description；导入 AST 运行时可能携带该字段，兼容读取。
        const bookDescription = (book as { description?: unknown }).description;
        await apiClient.api.documents[':userId'].$post({
          param: { userId },
          json: {
            id: book.id,
            title: book.title,
            sourceKind: 'user_import',
            language: 'ja',
            content: (typeof bookDescription === 'string' && bookDescription) || book.title,
            astJson: JSON.stringify(book),
            sourcePublisher: book.publisher || '用户自主导入',
          },
        });
      } catch (e) {
        logger.debug('[useImportTextbookMutation] Hono RPC failed to save textbook to gateway', e);
      }
      return book;
    },
    onSuccess: (book) => {
      queryClient.setQueryData<TextbookBook[]>([...QUERY_KEYS.TEXTBOOKS, userId], (prev = []) => [
        book,
        ...prev.filter((b) => b.id !== book.id),
      ]);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEXTBOOKS });
    },
  });
}

/** 课文划线批注查询 (依托 Hono RPC 端到端强类型系统) */
export function useAnnotationsQuery(documentId: string, userId = DEFAULT_USER_ID) {
  return useQuery({
    queryKey: [...QUERY_KEYS.ANNOTATIONS, userId, documentId],
    queryFn: async () => {
      if (!documentId) return [];
      try {
        const res = await apiClient.api.annotations[':userId'][':documentId'].$get({
          param: { userId, documentId },
        });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) return list;
        }
      } catch (e) {
        logger.debug('[useAnnotationsQuery] Hono RPC failed to load annotations', e);
      }
      return [];
    },
    enabled: Boolean(documentId),
    staleTime: 1000 * 60 * 2,
  });
}

/** 新增课文划线批注 */
export function useAddAnnotationMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      documentId: string;
      kind: 'KEY_POINT' | 'VOCAB' | 'GRAMMAR' | 'EXAM_TRAP' | 'PARAPHRASE';
      quote: string;
      note?: string;
      startOffset?: number;
      endOffset?: number;
    }) => {
      const res = await apiClient.api.annotations[':userId'].$post({
        param: { userId },
        json: input,
      });
      if (res.ok) {
        return await res.json();
      }
      throw new Error('保存批注失败');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...QUERY_KEYS.ANNOTATIONS, userId, variables.documentId],
      });
    },
  });
}

export interface ImportPdfResult {
  book: TextbookAST;
  classification: {
    pdfType: string;
    pageCount: number;
    pagesNeedingOcr: number[];
    ocrUsed: boolean;
  };
  stats: {
    lessons: number;
    dialogues: number;
  };
}

/**
 * PDF 上传导入：multipart 发网关 /api/documents/:userId/import-pdf，
 * 网关做分类/提取/结构化后返回 TextbookAST（协议层已验），前端复用既有
 * 确认导入链路（parseTextbookAST → onImportBook → useImportTextbookMutation）入库。
 * 注意：扫描版首次 OCR 会触发网关按需下载运行时（约 80MB，一次性），属正常等待。
 */
export function useImportPdfMutation(userId = DEFAULT_USER_ID) {
  return useMutation({
    mutationFn: async (file: File): Promise<ImportPdfResult> => {
      const form = new FormData();
      form.append('file', file, file.name);
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/documents/${encodeURIComponent(userId)}/import-pdf`,
        { method: 'POST', body: form }
      );
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof payload === 'object' && payload !== null && 'userMessage' in payload
            ? String((payload as { userMessage: unknown }).userMessage)
            : `PDF 导入失败（HTTP ${res.status}）`;
        throw new Error(msg);
      }
      const bookRaw =
        typeof payload === 'object' && payload !== null && 'book' in payload
          ? (payload as { book: unknown }).book
          : null;
      const parsed = parseTextbookAST(bookRaw);
      if (!parsed.ok) throw new Error(parsed.error.userMessage);
      const rest =
        typeof payload === 'object' && payload !== null
          ? (payload as {
              classification?: ImportPdfResult['classification'];
              stats?: ImportPdfResult['stats'];
            })
          : {};
      return {
        book: parsed.value,
        classification: rest.classification ?? {
          pdfType: 'Unknown',
          pageCount: 0,
          pagesNeedingOcr: [],
          ocrUsed: false,
        },
        stats: rest.stats ?? { lessons: 0, dialogues: 0 },
      };
    },
    onError: (e) => {
      logger.debug('[useImportPdfMutation] pdf import failed', e);
    },
  });
}

export interface EnrichLessonResult {
  enrichedLessons: number;
  vocabularies: number;
  grammarPoints: number;
  dropped: number;
}

/**
 * AI 抽生词：POST /api/documents/:userId/:documentId/enrich { lessonId? }。
 * 网关侧调模型抽取 + 接地校验后写回课文 AST；前端失效教材查询重拉。
 * 无模型连接时网关返回 E_ENRICH_NO_ADAPTER，这里只透出 userMessage。
 */
export function useEnrichLessonMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { documentId: string; lessonId?: string }): Promise<EnrichLessonResult> => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/documents/${encodeURIComponent(userId)}/${encodeURIComponent(vars.documentId)}/enrich`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(vars.lessonId ? { lessonId: vars.lessonId } : {}),
        }
      );
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof payload === 'object' && payload !== null && 'userMessage' in payload
            ? String((payload as { userMessage: unknown }).userMessage)
            : `抽生词失败（HTTP ${res.status}）`;
        throw new Error(msg);
      }
      const p = (payload ?? {}) as Partial<EnrichLessonResult>;
      return {
        enrichedLessons: Number(p.enrichedLessons ?? 0),
        vocabularies: Number(p.vocabularies ?? 0),
        grammarPoints: Number(p.grammarPoints ?? 0),
        dropped: Number(p.dropped ?? 0),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEXTBOOKS });
    },
    onError: (e) => {
      logger.debug('[useEnrichLessonMutation] enrich failed', e);
    },
  });
}

/** 批注一键转化为 FSRS 闪卡 */
export function useAnnotationToCardMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      annotationId: string;
      documentId: string;
      front: string;
      back: string;
      tag?: string;
      pos?: string;
      phonetic?: string;
    }) => {
      const res = await apiClient.api.annotations[':userId'][':annotationId']['to-card'].$post({
        param: { userId, annotationId: payload.annotationId },
        json: {
          front: payload.front,
          back: payload.back,
          tag: payload.tag || '课文批注',
          pos: payload.pos || '重点词句',
          phonetic: payload.phonetic,
        },
      });
      if (res.ok) {
        return await res.json();
      }
      throw new Error('转为生词卡失败');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CARDS });
      queryClient.invalidateQueries({
        queryKey: [...QUERY_KEYS.ANNOTATIONS, userId, variables.documentId],
      });
    },
  });
}
