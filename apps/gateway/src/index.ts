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
  listNewsTopics,
} from '@study-studio/protocol';
import { isOk, generateId, BusinessError } from '@study-studio/shared';
import { formatBusinessErrorResponse } from './errors/http-error-handler.js';
import { generateNewsPassage } from './services/generate-news-passage.js';
import {
  buildEnglishAiReadingPrompt,
  buildKoreanAiReadingPrompt,
  normalizeContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
} from './services/learning-language-policy.js';

export * from './server.js';
export * from './session/session-manager.js';
export * from './context/context-builder.js';
export * from './router/tool-router.js';
export * from './db/index.js';
export * from './repository/drizzle-learner-repository.js';
export * from './repository/sqlite-learner-repository.js';
export * from './errors/http-error-handler.js';

// 持久化存储实例：在生产/开发环境下持久化到本地 study-studio.db，或使用环境变量；测试环境下自动隔离使用 :memory: 避免污染真实数据
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';
const defaultDbPath = isTestEnv ? ':memory:' : 'study-studio.db';
const dbPath = process.env.STUDY_STUDIO_DB || defaultDbPath;
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
  // 2.5 历史足迹热力图 (查询最近 N 天真实 SQLite 打卡记录)
  .get('/api/task/history/:userId', async (c) => {
    const userId = c.req.param('userId');
    const days = Number(c.req.query('days')) || 28;
    const lang = c.req.query('lang');
    const res = await drizzleRepo.getActivityHistory(userId, days, lang);
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
    validator('json', (value) => value as Record<string, unknown> | Record<string, unknown>[]),
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
  // 5. AI 自适应靶向弱项出题与题库持久化
  .get('/api/questions/:userId', async (c) => {
    const userId = c.req.param('userId');
    // 优先从 SQLite quiz_questions 获取持久化的题目列表
    const existingRes = await drizzleRepo.getQuestions(userId);
    if (isOk(existingRes) && existingRes.value.length > 0) {
      return c.json(existingRes.value);
    }
    // C5：优先 learning.content；旧 quiz.generateAdaptive 仅兼容回退
    const contentTool = gatewayServer.toolRegistry.get('learning.content');
    if (contentTool) {
      const toolRes = await contentTool.execute(
        { action: 'generate_quiz', count: 6, language: 'ja', collect: true },
        { userId, sessionId: 'http_req' }
      );
      if (isOk(toolRes)) {
        const generated = ((toolRes.value as { questions?: unknown[] }).questions ?? []) as any[];
        await drizzleRepo.saveQuestions(generated);
        return c.json(generated);
      }
      return formatBusinessErrorResponse(c, toolRes.error);
    }
    const tool = gatewayServer.toolRegistry.get('quiz.generateAdaptive');
    if (tool) {
      const toolRes = await tool.execute(
        { targetLanguage: 'ja', count: 6 },
        { userId, sessionId: 'http_req' }
      );
      if (isOk(toolRes)) {
        const generated = ((toolRes.value as any).questions ?? []) as any[];
        await drizzleRepo.saveQuestions(generated);
        return c.json(generated);
      }
      return formatBusinessErrorResponse(c, toolRes.error);
    }
    return c.json([]);
  })
  .post(
    '/api/questions/:userId',
    validator('json', (value) => value as Record<string, unknown> | Record<string, unknown>[]),
    async (c) => {
      try {
        const body = c.req.valid('json');
        const questionsToSave = Array.isArray(body) ? body : [body];
        const res = await drizzleRepo.saveQuestions(questionsToSave);
        if (isOk(res)) return c.json({ success: true, count: questionsToSave.length });
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'saveQuestions');
      }
    }
  )
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
          pageNumber: body.pageNumber ? Number(body.pageNumber) : undefined,
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
  )
  // 9. 阅读理解工作室 (Reading Comprehension)
  .get(
    '/api/reading/sets/:userId',
    validator('query', (value) => value as { origin?: string; lang?: string }),
    async (c) => {
      const userId = c.req.param('userId');
      const origin = c.req.query('origin') as any;
      const lang = c.req.query('lang') as any;
      const res = await drizzleRepo.listReadingSets(userId, origin, lang);
      if (isOk(res)) return c.json(res.value);
      return formatBusinessErrorResponse(c, res.error);
    }
  )
  .get('/api/reading/news-topics', (c) => c.json(listNewsTopics()))
  .get('/api/curriculum/pitch', async (c) => {
    const q = c.req.query('q') || '';
    const tool = gatewayServer.toolRegistry.get('learning.curriculum');
    if (!tool) {
      return formatBusinessErrorResponse(
        c,
        new BusinessError('E_TOOL_MISSING', 'learning.curriculum 未注册', 'TOOL_EXECUTION')
      );
    }
    const res = await tool.execute(
      {
        action: q ? 'lookup_pitch' : 'list_pitch_benchmarks',
        filters: q ? { query: q } : undefined,
      },
      { userId: 'system', sessionId: 'http_pitch' }
    );
    if (isOk(res)) return c.json(res.value);
    return formatBusinessErrorResponse(c, res.error);
  })
  .post(
    '/api/reading/generate/:userId',
    validator('json', (value) => value as Record<string, unknown>),
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const body = c.req.valid('json') as any;
        const origin = (body.origin || 'ai') as 'ai' | 'news';
        const difficulty = (Number(body.difficulty) || 2) as 1 | 2 | 3 | 4 | 5;
        // 产品初期：默认英语；显式 JA/KO 才切换
        const language = normalizeContentLanguage(
          body.language,
          DEFAULT_CONTENT_LANGUAGE
        );
        const topic = String(
          body.topic ||
            (language === 'JA' ? '日常生活' : language === 'KO' ? '시사·생활' : 'education and media literacy')
        );

        const newSetId = generateId('read_' + origin);
        const isJa = language === 'JA';
        const isKo = language === 'KO';
        // 协议已支持 JA|EN|KO；KO 可持久化真实语种码
        const persistLanguage: 'JA' | 'EN' | 'KO' =
          language === 'JA' ? 'JA' : language === 'KO' ? 'KO' : 'EN';

        let title = '';
        let bodyText = '';
        let sourceLabel = '';
        let questions: any[] = [];

        let sourceUrl: string | undefined;
        if (origin === 'news') {
          const news = await generateNewsPassage({
            setId: newSetId,
            topic,
            language,
          });
          title = news.title;
          bodyText = news.body;
          sourceLabel = news.sourceLabel;
          sourceUrl = news.sourceUrl;
          questions = news.questions;
        } else if (isJa) {
          sourceLabel = `AI 自适应生成 · 难度 Lv.${difficulty} / 主题: ${topic}`;
          title = `${topic}に関する日々の観察と学び`;
          bodyText = `私たちの生活において、${topic}は常に身近で重要な役割を果たしています。毎日の慌ただしい時間の中でも、少し立ち止まって周囲を見渡すと、新しい気づきや発見がたくさんあります。

例えば、昨日出会った出来事について考えてみましょう。最初は些細なことのように見えても、注意深く観察してみると、これまで知らなかった工夫や人々の温かさに気づくことができます。

言葉を学ぶことも、まさにこれと同じです。日々の小さな発見を大切に積み重ねていくことで、表現力や理解力は少しずつ深まっていきます。これからも好奇心を持って、新しい世界を探求していきたいものです。`;
          questions = [
            {
              id: `${newSetId}_q1`,
              prompt: `筆者は${topic}についてどのように述べていますか。`,
              options: [
                { key: 'A', text: '些細に見えることの中にも新しい気づきや工夫がある' },
                { key: 'B', text: '忙しいときは一切周囲を観察してはならない' },
                { key: 'C', text: '日常生活には何の学びも存在しない' },
                { key: 'D', text: '過去の経験はすべて忘れるべきである' },
              ],
              correctAnswer: 'A',
              explanation:
                '第1・第2段落で些細なことの中にある新しい気づきや工夫について述べられている。',
            },
            {
              id: `${newSetId}_q2`,
              prompt: `筆者は言葉の学びを何にたとえていますか。`,
              options: [
                { key: 'A', text: '一度きりの大勝負' },
                { key: 'B', text: '日々の小さな発見と積み重ね' },
                { key: 'C', text: '他者との終わりのない激しい競争' },
                { key: 'D', text: '完全に自動化された機械の動作' },
              ],
              correctAnswer: 'B',
              explanation: '第3段落「日々の小さな発見を大切に積み重ねていくこと」と合致。',
            },
          ];
        } else if (isKo) {
          const koPrompt = buildKoreanAiReadingPrompt({ topic, difficulty });
          title = koPrompt.title;
          bodyText = koPrompt.body;
          sourceLabel = koPrompt.sourceLabel;
          questions = [
            {
              id: `${newSetId}_q1`,
              prompt: 'What reading strategies will the Korean track emphasize once authentic content lands?',
              options: [
                {
                  key: 'A',
                  text: 'Main idea, connector words, and honorific/formal register awareness',
                },
                { key: 'B', text: 'Only memorizing hangul stroke order without meaning' },
                { key: 'C', text: 'Ignoring discourse markers entirely' },
                { key: 'D', text: 'Translating every sentence into Japanese first' },
              ],
              correctAnswer: 'A',
              explanation:
                'The interim scaffold and KOREAN_LEARNING_NOTES highlight TOPIK-style main idea, connectors, and register.',
            },
            {
              id: `${newSetId}_q2`,
              prompt: `Why is this interim passage still useful while studying “${topic}”?`,
              options: [
                {
                  key: 'A',
                  text: 'It keeps the KO track wired end-to-end before Korean RSS replaces the scaffold',
                },
                { key: 'B', text: 'It permanently replaces authentic Korean news' },
                { key: 'C', text: 'It teaches only English spelling rules' },
                { key: 'D', text: 'It disables skill metrics for reading practice' },
              ],
              correctAnswer: 'A',
              explanation:
                'KO language code is persisted; content can later swap to Korean media without rewiring the client.',
            },
          ];
        } else {
          // EN：CET / 考研向精读骨架
          const enPrompt = buildEnglishAiReadingPrompt({ topic, difficulty });
          title = enPrompt.title;
          bodyText = enPrompt.body;
          sourceLabel = enPrompt.sourceLabel;
          questions = [
            {
              id: `${newSetId}_q1`,
              prompt: `What writing habit does the passage urge Chinese learners to avoid when discussing ${topic}?`,
              options: [
                {
                  key: 'A',
                  text: 'Translating Chinese word order directly instead of natural SVO patterns',
                },
                { key: 'B', text: 'Using discourse markers such as however and therefore' },
                { key: 'C', text: 'Stating a clear claim in the opening paragraph' },
                { key: 'D', text: 'Checking articles (a/an/the) before finishing' },
              ],
              correctAnswer: 'A',
              explanation:
                'The first body paragraph warns against Chinglish word order and prefers subject–verb–object.',
            },
            {
              id: `${newSetId}_q2`,
              prompt: 'Which sentence pattern is recommended for contrasting two viewpoints?',
              options: [
                { key: 'A', text: '“people think… people also think…”' },
                { key: 'B', text: '“While some argue that…, others contend that…”' },
                { key: 'C', text: 'Listing events without a main idea' },
                { key: 'D', text: 'Avoiding concrete examples entirely' },
              ],
              correctAnswer: 'B',
              explanation:
                'Paragraph 2 highlights the CET/Kaoyan-friendly contrast frame with While some… others…',
            },
          ];
        }

        const newSet = {
          id: newSetId,
          origin,
          title,
          topic,
          difficulty,
          language: persistLanguage,
          sourceLabel,
          sourceUrl,
          body: bodyText,
          questions,
          createdAt: new Date().toISOString(),
        };

        const res = await drizzleRepo.saveReadingSet(userId, newSet);
        if (isOk(res)) return c.json(res.value);
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'generateReadingSet');
      }
    }
  )
  .post(
    '/api/reading/practice/:userId',
    validator('json', (value) => value as Record<string, unknown>),
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const body = c.req.valid('json') as any;
        const setId = String(body.setId || '');
        const score = Number(body.score) || 0;
        const totalQuestions = Number(body.totalQuestions) || 1;
        const language =
          body.language === 'JA' ? 'JA' : body.language === 'KO' ? 'KO' : ('EN' as const);

        const res = await drizzleRepo.recordReadingPractice(userId, {
          setId,
          score,
          totalQuestions,
          language,
        });
        if (isOk(res)) return c.json({ success: true, ...res.value });
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'recordReadingPractice');
      }
    }
  )
  // 10. 参数化学习内容引擎 (learning.content)
  .post(
    '/api/learning/content/:userId',
    validator('json', (value) => value as Record<string, unknown>),
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const body = c.req.valid('json') as Record<string, unknown>;
        const tool = gatewayServer.toolRegistry.get('learning.content');
        if (!tool) {
          return formatBusinessErrorResponse(
            c,
            new BusinessError('E_TOOL_MISSING', 'learning.content 未注册', 'TOOL_EXECUTION')
          );
        }
        const res = await tool.execute(body, { userId, sessionId: 'http_content' });
        if (isOk(res)) return c.json(res.value);
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'learningContent');
      }
    }
  )
  .post(
    '/api/learning/assess/:userId',
    validator('json', (value) => value as Record<string, unknown>),
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const body = c.req.valid('json') as Record<string, unknown>;
        const tool = gatewayServer.toolRegistry.get('learning.assess');
        if (!tool) {
          return formatBusinessErrorResponse(
            c,
            new BusinessError('E_TOOL_MISSING', 'learning.assess 未注册', 'TOOL_EXECUTION')
          );
        }
        const res = await tool.execute(body, { userId, sessionId: 'http_assess' });
        if (isOk(res)) return c.json(res.value);
        return formatBusinessErrorResponse(c, res.error);
      } catch (e: any) {
        return formatBusinessErrorResponse(c, e, 'learningAssess');
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

          const isTurnSend = envelope.type === WsEventTypes.CLIENT_TURN_SEND;
          const res = await gatewayServer.handleClientMessage(envelope, (outEnv) => {
            ws.send(JSON.stringify(outEnv));
          });
          if (isOk(res)) {
            if (!isTurnSend) {
              ws.send(JSON.stringify(res.value));
            }
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
