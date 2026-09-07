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

export interface ReadingPositionLocator {
  lessonId?: string;
  page?: number;
  viewMode?: string;
}

/** 阅读位置查询（无记录回 null；documentId 为空时禁用）。 */
export function useReadingPositionQuery(documentId?: string, userId = DEFAULT_USER_ID) {
  return useQuery<ReadingPositionLocator | null>({
    queryKey: [...QUERY_KEYS.DOCUMENTS, 'position', userId, documentId ?? ''],
    queryFn: async () => {
      if (!documentId) return null;
      try {
        const res = await fetch(
          `${GATEWAY_BASE_URL}/api/documents/${encodeURIComponent(userId)}/${encodeURIComponent(documentId)}/position`
        );
        if (!res.ok) return null;
        const payload: unknown = await res.json().catch(() => null);
        const position =
          typeof payload === 'object' && payload !== null && 'position' in payload
            ? (payload as { position: unknown }).position
            : null;
        if (!position || typeof position !== 'object') return null;
        const locator = (position as { locator?: unknown }).locator;
        if (!locator || typeof locator !== 'object' || Array.isArray(locator)) return null;
        const out: ReadingPositionLocator = {};
        const rec = locator as Record<string, unknown>;
        if (typeof rec.lessonId === 'string') out.lessonId = rec.lessonId;
        if (typeof rec.page === 'number' && Number.isFinite(rec.page)) out.page = rec.page;
        if (typeof rec.viewMode === 'string') out.viewMode = rec.viewMode;
        return out;
      } catch (e) {
        logger.debug('[useReadingPositionQuery] failed', e);
        return null;
      }
    },
    enabled: Boolean(documentId),
    staleTime: 1000 * 60 * 2,
  });
}

/** 阅读位置保存（静默：失败只记 debug，不打扰阅读）。 */
export function useSaveReadingPositionMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { documentId: string; locator: ReadingPositionLocator }) => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/documents/${encodeURIComponent(userId)}/${encodeURIComponent(vars.documentId)}/position`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locator: vars.locator }),
        }
      );
      if (!res.ok) throw new Error(`保存阅读位置失败（HTTP ${res.status}）`);
    },
    onSuccess: (_, vars) => {
      queryClient.setQueryData(
        [...QUERY_KEYS.DOCUMENTS, 'position', userId, vars.documentId],
        vars.locator
      );
    },
    onError: (e) => logger.debug('[useSaveReadingPositionMutation] failed', e),
  });
}

/**
 * 打开课次即记（reading 源）：把该课生词表记为见过，同课同天一次。
 * 词面/读音取自课文 AST（非 NLP），静默失败；返回 { recorded, skipped }。
 */
export function useRecordReadingExposuresMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      documentId: string;
      lessonId: string;
      language: string;
      terms: Array<{ headword: string; reading?: string }>;
    }): Promise<{ recorded: number; skipped: boolean }> => {
      const res = await fetch(
        `${GATEWAY_BASE_URL}/api/documents/${encodeURIComponent(userId)}/${encodeURIComponent(vars.documentId)}/reading-exposures`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonId: vars.lessonId,
            language: vars.language,
            terms: vars.terms.slice(0, 30),
          }),
        }
      );
      if (!res.ok) throw new Error(`记录阅读相遇失败（HTTP ${res.status}）`);
      const payload: unknown = await res.json().catch(() => null);
      const rec = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<
        string,
        unknown
      >;
      return {
        recorded: typeof rec.recorded === 'number' ? rec.recorded : 0,
        skipped: rec.skipped === true,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DICTIONARY });
    },
    onError: (e) => logger.debug('[useRecordReadingExposuresMutation] failed', e),
  });
}

export interface ImportPdfResult {
  book: TextbookAST;
  classification: {
    pdfType: string;
    pageCount: number;
    pagesNeedingOcr: number[];
    ocrUsed: boolean;
    selectedPages: number[];
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
    mutationFn: async (
      vars:
        | { file: File; startPage?: number; endPage?: number }
        | { filePath: string; startPage?: number; endPage?: number }
    ): Promise<ImportPdfResult> => {
      const hasPath = 'filePath' in vars;
      const res = hasPath
        ? await fetch(`${GATEWAY_BASE_URL}/api/documents/${encodeURIComponent(userId)}/import-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filePath: vars.filePath,
              ...(vars.startPage !== undefined ? { startPage: vars.startPage } : {}),
              ...(vars.endPage !== undefined ? { endPage: vars.endPage } : {}),
            }),
          })
        : await (async () => {
            const form = new FormData();
            form.append('file', vars.file, vars.file.name);
            if (vars.startPage !== undefined) form.append('startPage', String(vars.startPage));
            if (vars.endPage !== undefined) form.append('endPage', String(vars.endPage));
            return fetch(`${GATEWAY_BASE_URL}/api/documents/${encodeURIComponent(userId)}/import-pdf`, {
              method: 'POST',
              body: form,
            });
          })();
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
          selectedPages: [],
        },
        stats: rest.stats ?? { lessons: 0, dialogues: 0 },
      };
    },
    onError: (e) => {
      logger.debug('[useImportPdfMutation] pdf import failed', e);
    },
  });
}

export interface ImportDocumentResult {
  documentId: string;
  title: string;
  lessons: number;
}

/**
 * 统一文档导入（EPUB/MOBI/文本/URL 同一命令；PDF 专线另走 import-pdf）。
 * 后端只接受本机绝对路径（filePath）/直传文本/网址，不收浏览器 File 上传——
 * 浏览器 File 无本地路径，EPUB/MOBI 请填本机路径（桌面端）或改走网址/文本。
 */
export function useImportDocumentMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      vars: { filePath: string } | { url: string } | { text: string; filename?: string }
    ): Promise<ImportDocumentResult> => {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/library/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...vars }),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof payload === 'object' && payload !== null && 'userMessage' in payload
            ? String((payload as { userMessage: unknown }).userMessage)
            : `文档导入失败（HTTP ${res.status}）`;
        throw new Error(msg);
      }
      const body =
        typeof payload === 'object' && payload !== null
          ? (payload as { documentId?: unknown; title?: unknown; lessons?: unknown })
          : {};
      if (typeof body.documentId !== 'string') throw new Error('导入返回缺少 documentId');
      return {
        documentId: body.documentId,
        title: typeof body.title === 'string' ? body.title : '未命名文档',
        lessons: typeof body.lessons === 'number' ? body.lessons : 0,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEXTBOOKS });
    },
    onError: (e) => {
      logger.debug('[useImportDocumentMutation] document import failed', e);
    },
  });
}

export interface EnrichLessonResult {
  enrichedLessons: number;
  vocabularies: number;
  grammarPoints: number;
  dropped: number;
  draftsProposed: number;
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
        draftsProposed: Number(p.draftsProposed ?? 0),
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

export interface AppendPdfResult {
  documentId: string;
  addedLessons: number;
  addedDialogues: number;
  totalLessons: number;
}

/**
 * 接力追加：新页段的课接在已有教材后面（大书分段导入）。
 * lessonNumber 由网关按现有最大值续排；课 id 取自新 AST（时间戳前缀不撞号）。
 */
export function useAppendPdfMutation(userId = DEFAULT_USER_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      vars: { documentId: string } & (
        | { file: File; startPage?: number; endPage?: number }
        | { filePath: string; startPage?: number; endPage?: number }
      )
    ): Promise<AppendPdfResult> => {
      const hasPath = 'filePath' in vars;
      const { documentId, ...src } = vars;
      const startPage = (src as { startPage?: number }).startPage;
      const endPage = (src as { endPage?: number }).endPage;
      const res = hasPath
        ? await fetch(
            `${GATEWAY_BASE_URL}/api/documents/${encodeURIComponent(userId)}/${encodeURIComponent(documentId)}/append-pdf`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filePath: (src as { filePath: string }).filePath,
                ...(startPage !== undefined ? { startPage } : {}),
                ...(endPage !== undefined ? { endPage } : {}),
              }),
            }
          )
        : await (async () => {
            const f = (src as { file: File }).file;
            const form = new FormData();
            form.append('file', f, f.name);
            if (startPage !== undefined) form.append('startPage', String(startPage));
            if (endPage !== undefined) form.append('endPage', String(endPage));
            return fetch(
              `${GATEWAY_BASE_URL}/api/documents/${encodeURIComponent(userId)}/${encodeURIComponent(documentId)}/append-pdf`,
              { method: 'POST', body: form }
            );
          })();
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof payload === 'object' && payload !== null && 'userMessage' in payload
            ? String((payload as { userMessage: unknown }).userMessage)
            : `接力追加失败（HTTP ${res.status}）`;
        throw new Error(msg);
      }
      const p = (payload ?? {}) as Partial<AppendPdfResult>;
      return {
        documentId: String(p.documentId ?? documentId),
        addedLessons: Number(p.addedLessons ?? 0),
        addedDialogues: Number(p.addedDialogues ?? 0),
        totalLessons: Number(p.totalLessons ?? 0),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TEXTBOOKS });
    },
    onError: (e) => {
      logger.debug('[useAppendPdfMutation] append failed', e);
    },
  });
}

export interface PdfPageHeading {
  page: number;
  level: number;
  text: string;
}

export interface PdfTocEntry {
  label: string;
  lessonNo: string;
  printedPage: number;
}

export interface MapPdfResult {
  classification: {
    pdfType: string;
    pageCount: number;
    pagesNeedingOcr: number[];
    ocrUsed: boolean;
    selectedPages: number[];
  };
  window: number[];
  headings: PdfPageHeading[];
  tocEntries: PdfTocEntry[];
}

/**
 * PDF 结构预览：扫一个窗口页，返回每页标题 + 目录条目（目录感知导入第一步）。
 * 调用方按标题页选范围，再调 useImportPdfMutation 精确导入。
 */
export function useMapPdfMutation(userId = DEFAULT_USER_ID) {
  return useMutation({
    mutationFn: async (
      vars:
        | { file: File; startPage?: number; endPage?: number }
        | { filePath: string; startPage?: number; endPage?: number }
    ): Promise<MapPdfResult> => {
      const hasPath = 'filePath' in vars;
      const res = hasPath
        ? await fetch(`${GATEWAY_BASE_URL}/api/documents/${encodeURIComponent(userId)}/map-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filePath: vars.filePath,
              ...(vars.startPage !== undefined ? { startPage: vars.startPage } : {}),
              ...(vars.endPage !== undefined ? { endPage: vars.endPage } : {}),
            }),
          })
        : await (async () => {
            const form = new FormData();
            form.append('file', vars.file, vars.file.name);
            if (vars.startPage !== undefined) form.append('startPage', String(vars.startPage));
            if (vars.endPage !== undefined) form.append('endPage', String(vars.endPage));
            return fetch(`${GATEWAY_BASE_URL}/api/documents/${encodeURIComponent(userId)}/map-pdf`, {
              method: 'POST',
              body: form,
            });
          })();
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof payload === 'object' && payload !== null && 'userMessage' in payload
            ? String((payload as { userMessage: unknown }).userMessage)
            : `结构预览失败（HTTP ${res.status}）`;
        throw new Error(msg);
      }
      const p = (payload ?? {}) as Partial<MapPdfResult>;
      return {
        classification: p.classification ?? {
          pdfType: 'Unknown',
          pageCount: 0,
          pagesNeedingOcr: [],
          ocrUsed: false,
          selectedPages: [],
        },
        window: Array.isArray(p.window) ? p.window : [],
        headings: Array.isArray(p.headings) ? p.headings : [],
        tocEntries: Array.isArray(p.tocEntries) ? p.tocEntries : [],
      };
    },
    onError: (e) => {
      logger.debug('[useMapPdfMutation] map failed', e);
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
