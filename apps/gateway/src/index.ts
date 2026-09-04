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
  .post(
    '/api/reading/generate/:userId',
    validator('json', (value) => value as Record<string, unknown>),
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const body = c.req.valid('json') as any;
        const origin = (body.origin || 'ai') as 'ai' | 'news';
        const difficulty = (Number(body.difficulty) || 2) as 1 | 2 | 3 | 4 | 5;
        const language = (body.language === 'EN' ? 'EN' : 'JA') as 'JA' | 'EN';
        const topic = String(body.topic || (language === 'JA' ? '日常生活' : 'technology'));

        const newSetId = generateId('read_' + origin);
        const isJa = language === 'JA';

        let title = '';
        let bodyText = '';
        let sourceLabel = '';
        let questions: any[] = [];

        if (origin === 'news') {
          sourceLabel = isJa
            ? `合规真实精选 · ${topic} 领域最新动态`
            : `Verified News Feed · ${topic} Weekly Digest`;
          title = isJa
            ? `【快讯】关于${topic}领域的最新发展与社会影响`
            : `Latest Developments and Industry Trends in ${topic}`;
          bodyText = isJa
            ? `近年のグローバルな技術革新と社会の変化に伴い、${topic}分野における新たな取り組みが急速に注目を集めている。国内外の専門機関が発表した最新データによれば、関連する市場規模は過去2年間で約30%拡大したという。

市場の成長とともに、ユーザーの利便性向上や業務効率化が実現される一方で、プライバシーの保護や安全性基準の整備といった制度的課題も指摘されている。

関係者は「持続可能な発展を遂げるためには、技術の進化だけでなく、社会全体の倫理規範との調和が不可欠である」と強調している。今後の法整備や官民連携の行方が注目される。`
            : `Rapid innovation in the field of ${topic} has captured international attention over recent quarters. According to newly published market assessments from industry observers, investment in core research has risen significantly across leading research clusters.

While early adopters praise the enhanced productivity and seamless workflow integration, regulatory authorities caution that robust safeguards regarding data integrity and security must keep pace with deployment.

Industry leaders emphasized at a recent summit that long-term sustainability depends on maintaining transparent standards while cultivating public trust. Pilot programs scheduled for the upcoming quarter will test these governance frameworks under live operational conditions.`;

          questions = [
            {
              id: `${newSetId}_q1`,
              prompt: isJa
                ? `本文で言及されている主な動向として適切なものはどれか。`
                : `What is the primary trend highlighted in the passage regarding ${topic}?`,
              options: [
                {
                  key: 'A',
                  text: isJa
                    ? '関連分野の取り組みが急速に注目され市場が拡大している'
                    : 'Market investment and interest have expanded significantly',
                },
                {
                  key: 'B',
                  text: isJa
                    ? '政府が当該分野への投資を全面的に禁止した'
                    : 'Governments completely banned all related development',
                },
                {
                  key: 'C',
                  text: isJa
                    ? '技術の進化が完全に停滞し需要が消滅した'
                    : 'Innovation halted entirely due to a total lack of consumer interest',
                },
                {
                  key: 'D',
                  text: isJa
                    ? 'すべての規制や基準が撤廃された'
                    : 'All regulatory standards were permanently discarded',
                },
              ],
              correctAnswer: 'A',
              explanation: isJa
                ? '第1段落で市場規模の拡大と急速な注目の高まりが述べられている。'
                : 'Paragraph 1 notes significant rise in attention and market investment.',
            },
            {
              id: `${newSetId}_q2`,
              prompt: isJa
                ? `本文で指摘されている課題は何か。`
                : `What key concern or challenge was raised in the report?`,
              options: [
                {
                  key: 'A',
                  text: isJa ? '原料の物理的枯渇' : 'Immediate physical resource depletion',
                },
                {
                  key: 'B',
                  text: isJa
                    ? '安全性基準の整備やプライバシーの保護'
                    : 'Security safeguards, data integrity, and regulatory standards',
                },
                {
                  key: 'C',
                  text: isJa
                    ? '従事者の完全な不足'
                    : 'A total absence of qualified technicians',
                },
                {
                  key: 'D',
                  text: isJa
                    ? '交通インフラの機能停止'
                    : 'Urban transit infrastructure collapse',
                },
              ],
              correctAnswer: 'B',
              explanation: isJa
                ? '第2段落「プライバシーの保護や安全性基準の整備といった制度的課題」と合致。'
                : 'Paragraph 2 highlights safeguards regarding data integrity, security, and standards.',
            },
            {
              id: `${newSetId}_q3`,
              prompt: isJa
                ? `今後の持続可能な発展に必要な条件として関係者が挙げたものは何か。`
                : `According to industry stakeholders, what is indispensable for long-term sustainability?`,
              options: [
                {
                  key: 'A',
                  text: isJa
                    ? '技術の進化と社会全体の倫理規範・透明性との調和'
                    : 'Balancing technological innovation with ethical standards and public trust',
                },
                {
                  key: 'B',
                  text: isJa
                    ? '競争相手の排除と独占体制の確立'
                    : 'Eliminating competition to establish complete monopoly',
                },
                {
                  key: 'C',
                  text: isJa
                    ? 'すべての法整備の中止'
                    : 'Halting all future legislative governance',
                },
                {
                  key: 'D',
                  text: isJa
                    ? '海外市場からの即時撤退'
                    : 'Immediate withdrawal from all international markets',
                },
              ],
              correctAnswer: 'A',
              explanation: isJa
                ? '第3段落「技術の進化だけでなく、社会全体の倫理規範との調和が不可欠」と対応。'
                : 'Paragraph 3 emphasizes that sustainability depends on transparent standards and public trust.',
            },
          ];
        } else {
          sourceLabel = isJa
            ? `AI 自适应生成 · 难度 Lv.${difficulty} / 主题: ${topic}`
            : `AI Adaptive Generator · Lv.${difficulty} / Topic: ${topic}`;
          title = isJa
            ? `${topic}に関する日々の観察と学び`
            : `Perspectives and Insights on ${topic}`;
          bodyText = isJa
            ? `私たちの生活において、${topic}は常に身近で重要な役割を果たしています。毎日の慌ただしい時間の中でも、少し立ち止まって周囲を見渡すと、新しい気づきや発見がたくさんあります。

例えば、昨日出会った出来事について考えてみましょう。最初は些細なことのように見えても、注意深く観察してみると、これまで知らなかった工夫や人々の温かさに気づくことができます。

言葉を学ぶことも、まさにこれと同じです。日々の小さな発見を大切に積み重ねていくことで、表現力や理解力は少しずつ深まっていきます。これからも好奇心を持って、新しい世界を探求していきたいものです。`
            : `In our everyday lives, ${topic} often plays a far more meaningful role than we initially realize. Amid the rush of daily commitments, taking a moment to observe our surroundings frequently reveals fresh perspectives.

Consider small interactions that seem ordinary at first glance. Upon closer reflection, we often uncover subtle craftsmanship and thoughtful intentionality behind how people navigate daily challenges.

Language acquisition follows much the same cadence. By celebrating steady, incremental insights, learners cultivate nuanced expression and deeper comprehension over time.`;

          questions = [
            {
              id: `${newSetId}_q1`,
              prompt: isJa
                ? `筆者は${topic}についてどのように述べていますか。`
                : `What does the author suggest about everyday observations regarding ${topic}?`,
              options: [
                {
                  key: 'A',
                  text: isJa
                    ? '些細に見えることの中にも新しい気づきや工夫がある'
                    : 'Even seemingly ordinary moments reveal meaningful insights and intentionality',
                },
                {
                  key: 'B',
                  text: isJa
                    ? '忙しいときは一切周囲を観察してはならない'
                    : 'Busy people should strictly avoid paying attention to surroundings',
                },
                {
                  key: 'C',
                  text: isJa
                    ? '日常生活には何の学びも存在しない'
                    : 'Daily routines offer no valuable lessons whatsoever',
                },
                {
                  key: 'D',
                  text: isJa
                    ? '過去の経験はすべて忘れるべきである'
                    : 'Past observations should be disregarded completely',
                },
              ],
              correctAnswer: 'A',
              explanation: isJa
                ? '第1・第2段落で些細なことの中にある新しい気づきや工夫について述べられている。'
                : 'Paragraphs 1 and 2 emphasize finding fresh insights in subtle, ordinary moments.',
            },
            {
              id: `${newSetId}_q2`,
              prompt: isJa
                ? `筆者は言葉の学びを何にたとえていますか。`
                : `What comparison does the author draw with language learning?`,
              options: [
                {
                  key: 'A',
                  text: isJa ? '一度きりの大勝負' : 'A one-time high-stakes gamble',
                },
                {
                  key: 'B',
                  text: isJa
                    ? '日々の小さな発見と積み重ね'
                    : 'Accumulating steady, incremental everyday insights',
                },
                {
                  key: 'C',
                  text: isJa
                    ? '他者との終わりのない激しい競争'
                    : 'Relentless competition against peer learners',
                },
                {
                  key: 'D',
                  text: isJa
                    ? '完全に自動化された機械の動作'
                    : 'An entirely mechanized, hands-off routine',
                },
              ],
              correctAnswer: 'B',
              explanation: isJa
                ? '第3段落「日々の小さな発見を大切に積み重ねていくこと」と合致。'
                : 'Paragraph 3 directly compares language learning to steady, incremental insights.',
            },
          ];
        }

        const newSet = {
          id: newSetId,
          origin,
          title,
          topic,
          difficulty,
          language,
          sourceLabel,
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
        const language = (body.language === 'EN' ? 'EN' : 'JA') as 'JA' | 'EN';

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
