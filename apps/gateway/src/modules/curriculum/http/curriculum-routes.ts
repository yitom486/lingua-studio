import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { isOk, BusinessError, generateId } from '@study-studio/shared';
import { listNewsTopics, type ReadingPassageSet } from '@study-studio/protocol';
import { formatBusinessErrorResponse } from '../../../errors/http-error-handler.js';
import { generateNewsPassage } from '../../../services/generate-news-passage.js';
import {
  buildEnglishAiReadingPrompt,
  buildKoreanAiReadingPrompt,
  normalizeContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
} from '../../../services/learning-language-policy.js';
import type { GatewayDeps } from '../../../transport/http/gateway-deps.js';

/** 课程域路由：假名、阅读、发音（G2 迁移，行为不变）。 */
export function createCurriculumRoutes(deps: GatewayDeps) {
  return new Hono()
  // 8. 五十音与假名课程底座 (Curriculum Kana)
  .get('/api/curriculum/kana', async (c) => {
    const type = c.req.query('type');
    const res = await deps.repo.getCurriculumKana(type);
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
        const res = await deps.repo.recordKanaPractice(userId, kanaId, isCorrect, scriptType);
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
      const res = await deps.repo.listReadingSets(userId, origin, lang);
      if (isOk(res)) return c.json(res.value);
      return formatBusinessErrorResponse(c, res.error);
    }
  )
  .get('/api/reading/news-topics', (c) => c.json(listNewsTopics()))
  .get('/api/curriculum/pitch', async (c) => {
    const q = c.req.query('q') || '';
    const tool = deps.server.toolRegistry.get('learning.curriculum');
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
        // P3-B 版权与可观测性：结构化来源元数据
        let sourceKind: ReadingPassageSet['sourceKind'] = undefined;
        let fetchStatus: ReadingPassageSet['fetchStatus'] = undefined;
        let newsPublisher: string | undefined;
        // 当前会话返回给客户端的正文（可能含原文摘录）；与持久化正文分离
        let displayBody = '';
        if (origin === 'news') {
          const news = await generateNewsPassage({
            setId: newSetId,
            topic,
            language,
          });
          title = news.title;
          // 版权收口：DB 只存公开 RSS 摘要（persistBody），不长期保存无授权的第三方整篇正文
          bodyText = news.persistBody;
          displayBody = news.body;
          sourceLabel = news.sourceLabel;
          sourceUrl = news.sourceUrl;
          questions = news.questions;
          sourceKind = news.sourceKind;
          fetchStatus = news.fetchStatus;
          newsPublisher = news.publisher;
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

        const newSet: ReadingPassageSet = {
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
          // P3-B 结构化来源元数据；AI 分支显式标记为 ai
          sourceKind: sourceKind ?? (origin === 'ai' ? 'ai' : undefined),
          ...(fetchStatus ? { fetchStatus } : {}),
          ...(newsPublisher ? { publisher: newsPublisher } : {}),
        };

        const res = await deps.repo.saveReadingSet(userId, newSet);
        if (isOk(res)) {
          // 版权收口：DB 已存 RSS 摘要；当前会话仍把原文摘录正文返回给客户端即时阅读
          if (origin === 'news' && displayBody && displayBody !== bodyText) {
            return c.json({ ...res.value, body: displayBody });
          }
          return c.json(res.value);
        }
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

        const res = await deps.repo.recordReadingPractice(userId, {
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
;
}
