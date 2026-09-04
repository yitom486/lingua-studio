import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { validator } from 'hono/validator';
import { GatewayServer } from './server.js';
import { DrizzleLearnerRepository } from './repository/drizzle-learner-repository.js';
import { SqliteLearnerRepository } from './repository/sqlite-learner-repository.js';
import {
  type WsEnvelope,
  type LearnerProfile,
  WsEventTypes,
} from '@study-studio/protocol';
import { isOk, generateId, BusinessError } from '@study-studio/shared';
import { formatBusinessErrorResponse } from './errors/http-error-handler.js';

export * from './server.js';
export * from './session/session-manager.js';
export * from './context/context-builder.js';
export * from './router/tool-router.js';
export * from './db/index.js';
export * from './repository/drizzle-learner-repository.js';
export * from './repository/sqlite-learner-repository.js';
export * from './errors/http-error-handler.js';

// 持久化存储实例：在生产/开发环境下持久化到本地 study-studio.db，或使用环境变量
const dbPath = process.env.STUDY_STUDIO_DB || 'study-studio.db';
export const drizzleRepo = new DrizzleLearnerRepository(dbPath);
export const sqliteRepo = drizzleRepo; // 保持向前兼容别名
export const gatewayServer = new GatewayServer(drizzleRepo);

const PORT = Number(process.env.GATEWAY_PORT || 8080);

/**
 * Hono API 路由定义 (提供全栈 RPC 类型安全契约 GatewayAppType 与统一错误拦截闭环)
 */
export const app = new Hono()
  .use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  )
  // 全局异常拦截兜底过滤器
  .onError((err, c) => {
    console.error('[Gateway Hono onError]', err);
    return formatBusinessErrorResponse(c, err, 'HONO_UNCAUGHT');
  })
  // 404 资源未找到统一友好响应
  .notFound((c) => {
    return formatBusinessErrorResponse(
      c,
      new BusinessError('E_NOT_FOUND', '请求的 API 资源不存在或已被迁移。', 'LEARNER_STATE'),
      'HONO_NOT_FOUND'
    );
  })
  .get('/health', (c) =>
    c.json({
      status: 'ok',
      service: 'Study Studio Agent Gateway',
      port: PORT,
      timestamp: Date.now(),
    })
  )
  .get('/api/health', (c) =>
    c.json({
      status: 'ok',
      service: 'Study Studio Agent Gateway',
      port: PORT,
      timestamp: Date.now(),
    })
  )
  // 1. 学习者全景画像与打卡进度
  .get('/api/profile/:userId', async (c) => {
    const userId = c.req.param('userId');
    const res = await drizzleRepo.getProfileSnapshot(userId);
    if (isOk(res)) return c.json(res.value);
    return formatBusinessErrorResponse(c, res.error);
  })
  .post(
    '/api/profile/:userId',
    validator('json', (value) => value as Partial<LearnerProfile>),
    async (c) => {
      const userId = c.req.param('userId');
      try {
        const body = c.req.valid('json');
        const res = await drizzleRepo.updateLearnerProfile(userId, body);
        if (isOk(res)) return c.json(res.value);
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'updateLearnerProfile');
      }
    }
  )
  // 2. 每日打卡与足迹进度
  .get('/api/task/progress/:userId', async (c) => {
    const userId = c.req.param('userId');
    const date = c.req.query('date') || undefined;
    const res = await drizzleRepo.getDailyTaskProgress(userId, date);
    if (isOk(res)) return c.json(res.value);
    return formatBusinessErrorResponse(c, res.error);
  })
  .post(
    '/api/task/activity/:userId',
    validator('json', (value) => value as {
      quizzes?: number;
      cards?: number;
      listeningMinutes?: number;
      mistakesResolved?: number;
      date?: string;
    }),
    async (c) => {
      const userId = c.req.param('userId');
      try {
        const body = c.req.valid('json');
        const res = await drizzleRepo.recordDailyActivity(userId, body);
        if (isOk(res)) return c.json(res.value);
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'recordDailyActivity');
      }
    }
  )
  // 3. FSRS 闪卡存取
  .get('/api/cards/:userId', async (c) => {
    const userId = c.req.param('userId');
    const res = await drizzleRepo.getDueCards(userId);
    if (isOk(res)) return c.json(res.value);
    return formatBusinessErrorResponse(c, res.error);
  })
  .post(
    '/api/cards/:userId',
    validator('json', (value) => value as Record<string, unknown>[]),
    async (c) => {
      try {
        const body = c.req.valid('json');
        const cardsToSave = Array.isArray(body) ? body : [body];
        for (const card of cardsToSave) {
          await drizzleRepo.saveCard(card as any);
        }
        return c.json({ success: true, count: cardsToSave.length });
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'saveCards');
      }
    }
  )
  // 4. 错题本存取与消除
  .get('/api/mistakes/:userId', async (c) => {
    const userId = c.req.param('userId');
    const res = await drizzleRepo.getMistakes(userId);
    if (isOk(res)) return c.json(res.value);
    return formatBusinessErrorResponse(c, res.error);
  })
  .post(
    '/api/mistakes/:userId',
    validator('json', (value) => value as Record<string, unknown>),
    async (c) => {
      try {
        const body = c.req.valid('json');
        const res = await drizzleRepo.saveMistake(body as any);
        if (isOk(res)) return c.json({ success: true });
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'saveMistake');
      }
    }
  )
  .post('/api/mistakes/:userId/resolve/:mistakeId', async (c) => {
    const mistakeId = c.req.param('mistakeId');
    const res = await drizzleRepo.resolveMistake(mistakeId);
    if (isOk(res)) return c.json({ success: true, mistakeId });
    return formatBusinessErrorResponse(c, res.error);
  })
  // 5. AI 自适应靶向弱项出题
  .get('/api/questions/:userId', async (c) => {
    const userId = c.req.param('userId');
    const tool = gatewayServer.toolRegistry.get('quiz.generateAdaptive');
    if (tool) {
      const toolRes = await tool.execute(
        { targetLanguage: 'ja', count: 6 },
        { userId, sessionId: 'http_req' }
      );
      if (isOk(toolRes)) {
        return c.json(((toolRes.value as any).questions ?? []) as any[]);
      }
      return formatBusinessErrorResponse(c, toolRes.error);
    }
    return c.json([]);
  })
  // 6. 文档与教材 (Documents)
  .get('/api/documents/:userId', async (c) => {
    const userId = c.req.param('userId');
    const sourceKind = c.req.query('sourceKind');
    const res = await drizzleRepo.listDocuments(userId, sourceKind);
    if (isOk(res)) return c.json(res.value);
    return formatBusinessErrorResponse(c, res.error);
  })
  .get('/api/documents/:userId/:documentId', async (c) => {
    const documentId = c.req.param('documentId');
    const res = await drizzleRepo.getDocumentById(documentId);
    if (isOk(res)) {
      if (!res.value) {
        return formatBusinessErrorResponse(
          c,
          new BusinessError('E_NOT_FOUND', '未找到指定的教材或文档', 'LEARNER_STATE')
        );
      }
      return c.json(res.value);
    }
    return formatBusinessErrorResponse(c, res.error);
  })
  .post(
    '/api/documents/:userId',
    validator('json', (value) => value as Record<string, unknown>),
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const body = c.req.valid('json') as any;
        const now = new Date().toISOString();
        const docItem = {
          id: body.id || generateId('doc'),
          userId,
          title: String(body.title || '未命名教材/文档'),
          sourceKind: body.sourceKind || 'user_import',
          language: body.language || 'ja',
          content: body.content || '',
          astJson: body.astJson
            ? typeof body.astJson === 'string'
              ? body.astJson
              : JSON.stringify(body.astJson)
            : undefined,
          topic: body.topic,
          difficulty: body.difficulty ? Number(body.difficulty) : undefined,
          sourceUrl: body.sourceUrl,
          sourcePublisher: body.sourcePublisher,
          examTag: body.examTag,
          createdAt: body.createdAt || now,
          updatedAt: now,
        };
        const res = await drizzleRepo.saveDocument(docItem);
        if (isOk(res)) return c.json(res.value);
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'saveDocument');
      }
    }
  )
  .delete('/api/documents/:userId/:documentId', async (c) => {
    const userId = c.req.param('userId');
    const documentId = c.req.param('documentId');
    const res = await drizzleRepo.deleteDocument(documentId, userId);
    if (isOk(res)) return c.json({ success: true, documentId });
    return formatBusinessErrorResponse(c, res.error);
  })
  // 7. 课文批注与重点 (Annotations)
  .get('/api/annotations/:userId/:documentId', async (c) => {
    const userId = c.req.param('userId');
    const documentId = c.req.param('documentId');
    const res = await drizzleRepo.listAnnotations(documentId, userId);
    if (isOk(res)) return c.json(res.value);
    return formatBusinessErrorResponse(c, res.error);
  })
  .post(
    '/api/annotations/:userId',
    validator('json', (value) => value as Record<string, unknown>),
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const body = c.req.valid('json') as any;
        if (!body.documentId || !body.quote) {
          return formatBusinessErrorResponse(
            c,
            new BusinessError('E_INVALID_INPUT', '批注必须包含所属文档与划线摘录', 'VALIDATION')
          );
        }
        const annItem = {
          id: body.id || generateId('ann'),
          documentId: String(body.documentId),
          userId,
          kind: body.kind || 'KEY_POINT',
          quote: String(body.quote),
          note: body.note ? String(body.note) : undefined,
          startOffset: Number(body.startOffset || 0),
          endOffset: Number(body.endOffset || 0),
          createdBy: body.createdBy || 'USER',
          flashcardId: body.flashcardId,
          createdAt: body.createdAt || new Date().toISOString(),
        };
        const res = await drizzleRepo.saveAnnotation(annItem as any);
        if (isOk(res)) return c.json(res.value);
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'saveAnnotation');
      }
    }
  )
  .delete('/api/annotations/:userId/:annotationId', async (c) => {
    const userId = c.req.param('userId');
    const annotationId = c.req.param('annotationId');
    const res = await drizzleRepo.deleteAnnotation(annotationId, userId);
    if (isOk(res)) return c.json({ success: true, annotationId });
    return formatBusinessErrorResponse(c, res.error);
  })
  .post(
    '/api/annotations/:userId/:annotationId/to-card',
    validator('json', (value) => value as Record<string, unknown>),
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const annotationId = c.req.param('annotationId');
        const body = c.req.valid('json') as any;
        if (!body.front || !body.back) {
          return formatBusinessErrorResponse(
            c,
            new BusinessError('E_INVALID_INPUT', '转为生词卡必须提供正面词句与背面释义', 'VALIDATION')
          );
        }
        const res = await drizzleRepo.convertAnnotationToCard(annotationId, userId, {
          front: String(body.front),
          back: String(body.back),
          tag: body.tag ? String(body.tag) : '课文批注',
          pos: body.pos ? String(body.pos) : '重点词句',
          phonetic: body.phonetic ? String(body.phonetic) : undefined,
        });
        if (isOk(res)) return c.json(res.value);
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'convertAnnotationToCard');
      }
    }
  )
  // 8. 五十音与假名课程底座 (Curriculum Kana)
  .get('/api/curriculum/kana', async (c) => {
    const type = c.req.query('type');
    const res = await drizzleRepo.getCurriculumKana(type);
    if (isOk(res)) return c.json(res.value);
    return formatBusinessErrorResponse(c, res.error);
  })
  .post(
    '/api/curriculum/kana/practice/:userId',
    validator('json', (value) => value as Record<string, unknown>),
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const body = c.req.valid('json') as any;
        const kanaId = String(body.kanaId || '');
        const isCorrect = Boolean(body.isCorrect);
        const scriptType = (body.scriptType || 'HIRAGANA') as 'HIRAGANA' | 'KATAKANA' | 'ROMAJI';
        const res = await drizzleRepo.recordKanaPractice(userId, kanaId, isCorrect, scriptType);
        if (isOk(res)) return c.json({ success: true, ...res.value });
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'recordKanaPractice');
      }
    }
  );

export type GatewayAppType = typeof app;


export function startGatewayServer(port = PORT) {
  const server = Bun.serve<{ sessionId?: string | undefined }>({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);

      // 1. WebSocket 升级路由 /ws
      if (url.pathname === '/ws') {
        const upgraded = server.upgrade(req, {
          data: { sessionId: undefined },
        });
        if (upgraded) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      // 2. HTTP REST 交由 Hono 驱动
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        console.log(`[Gateway WS] Client connected`);
      },
      async message(ws, message) {
        try {
          const raw = typeof message === 'string' ? message : message.toString();
          const envelope = JSON.parse(raw) as WsEnvelope;

          const res = await gatewayServer.handleClientMessage(envelope);
          if (isOk(res)) {
            ws.send(JSON.stringify(res.value));
          } else {
            const errorEnvelope: WsEnvelope = {
              version: '1.0',
              id: generateId('err'),
              sessionId: envelope.sessionId,
              type: WsEventTypes.AGENT_ERROR,
              payload: {
                error: {
                  code: res.error.code,
                  userMessage: res.error.userMessage,
                  category: res.error.category,
                  retryable: res.error.retryable,
                },
              },
              timestamp: Date.now(),
            };
            ws.send(JSON.stringify(errorEnvelope));
          }
        } catch (e) {
          console.error('[Gateway WS] Failed to process message:', e);
          const errorEnvelope: WsEnvelope = {
            version: '1.0',
            id: generateId('err'),
            sessionId: 'ws_err',
            type: WsEventTypes.AGENT_ERROR,
            payload: {
              error: {
                code: 'E_WS_INTERNAL',
                userMessage: '系统通信遇到了微小波动，正在自动恢复…',
                category: 'NETWORK',
                retryable: true,
              },
            },
            timestamp: Date.now(),
          };
          ws.send(JSON.stringify(errorEnvelope));
        }
      },
      close(ws) {
        console.log(`[Gateway WS] Client disconnected`);
      },
    },
  });

  console.log(`🚀 Study Studio Agent Gateway (Hono + Bun WS) listening on http://localhost:${server.port}`);
  return server;
}

// 如果作为主入口直接运行，则启动服务器
if (import.meta.main) {
  startGatewayServer();
}
