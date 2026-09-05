import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client.js';
import { TEXTBOOK_BOOKS, type TextbookBook } from '../data/textbook-data.js';
import { DEFAULT_USER_ID, QUERY_KEYS } from './query-keys.js';

/** P1-2 拆分：教材 / 批注组（自 useLearnerQueries.ts 逐行平移，仅改 import）。 */

/**
 * 教材知识树查询 (支持 Hono RPC 动态获取持久化教材并与内置教材合流)
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
                    dynamicBooks.push(parsed as TextbookBook);
                  }
                } catch {
                  // ignore corrupt ast
                }
              }
            }
            if (dynamicBooks.length > 0) {
              return dynamicBooks;
            }
          }
        }
      } catch (e) {
        console.warn('[useTextbooksQuery] Hono RPC fallback to local textbook assets', e);
      }
      return TEXTBOOK_BOOKS;
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
        await apiClient.api.documents[':userId'].$post({
          param: { userId },
          json: {
            id: book.id,
            title: book.title,
            sourceKind: 'user_import',
            language: 'ja',
            content: (book as any).description || book.title,
            astJson: JSON.stringify(book),
            sourcePublisher: book.publisher || '用户自主导入',
          },
        });
      } catch (e) {
        console.warn('[useImportTextbookMutation] Hono RPC failed to save textbook to gateway', e);
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
        console.warn('[useAnnotationsQuery] Hono RPC failed to load annotations', e);
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
