/**
 * 阅读理解工作室演示数据（AI 生成篇 / 模拟新闻篇 + 配题）
 * 登记：.studio-internal/STATIC-DATA-INVENTORY.md
 */
import type { NewsTopic } from '@study-studio/protocol';
import { NEWS_TOPICS } from '@study-studio/protocol';

export type PassageOrigin = 'ai' | 'news';

export interface ReadingQuestion {
  id: string;
  prompt: string;
  options: Array<{ key: string; text: string }>;
  correctAnswer: string;
  explanation: string;
}

export interface ReadingPassageSet {
  id: string;
  origin: PassageOrigin;
  title: string;
  topic: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  language: 'JA' | 'EN' | 'KO';
  sourceLabel: string;
  sourceUrl?: string;
  body: string;
  questions: ReadingQuestion[];
}

export const DEMO_READING_SETS: ReadingPassageSet[] = [
  {
    id: 'read_ai_cafe',
    origin: 'ai',
    title: '静かなカフェで日本語を勉強する',
    topic: '日常生活',
    difficulty: 2,
    language: 'JA',
    sourceLabel: 'AI 生成 · 难度 2 / N4–N5',
    body: `先週の土曜日、私は友達の田中さんと一緒に駅前のカフェへ行きました。店の中は静かで、窓の外には桜の木が見えました。

私たちはコーヒーを注文してから、テーブルで日本語の教科書を開きました。田中さんは「助詞の『で』と『に』がまだ難しい」と言いました。私はノートに例文を書いて説明しました。

二時間ほど勉強したあと、私たちは短い散歩をしました。夕方の風は少し冷たかったですが、とても気持ちよかったです。来週もまた同じカフェで会う約束をしました。`,
    questions: [
      {
        id: 'q_ai_1',
        prompt: '二人はどこで勉強しましたか。',
        options: [
          { key: 'A', text: '図書館' },
          { key: 'B', text: '駅前のカフェ' },
          { key: 'C', text: '学校の教室' },
          { key: 'D', text: '公園のベンチ' },
        ],
        correctAnswer: 'B',
        explanation: '文中「駅前のカフェへ行きました」「テーブルで日本語の教科書を開きました」とある。',
      },
      {
        id: 'q_ai_2',
        prompt: '田中さんが難しいと言ったのは何ですか。',
        options: [
          { key: 'A', text: '漢字の読み方' },
          { key: 'B', text: '敬語' },
          { key: 'C', text: '助詞の「で」と「に」' },
          { key: 'D', text: '過去形の作り方' },
        ],
        correctAnswer: 'C',
        explanation: '「助詞の『で』と『に』がまだ難しい」と明記されている。',
      },
      {
        id: 'q_ai_3',
        prompt: '勉強のあと、二人はどうしましたか。',
        options: [
          { key: 'A', text: '映画を見た' },
          { key: 'B', text: '短い散歩をした' },
          { key: 'C', text: 'すぐに帰宅した' },
          { key: 'D', text: '食事を注文した' },
        ],
        correctAnswer: 'B',
        explanation: '「二時間ほど勉強したあと、私たちは短い散歩をしました。」',
      },
    ],
  },
  {
    id: 'read_news_tech',
    origin: 'news',
    title: 'Cities trial quieter evening delivery routes',
    topic: 'technology',
    difficulty: 3,
    language: 'EN',
    sourceLabel: '模拟新闻源 · Tech / 今日精选（演示缓存）',
    sourceUrl: 'https://example.com/news/quiet-delivery',
    body: `Several major cities are testing new evening delivery corridors that keep heavy vans off residential streets after 8 p.m. Officials say the pilot aims to cut noise complaints without slowing online shopping.

Logistics firms will share real-time route data with traffic centers. In return, they receive priority access to designated loading bays near subway hubs. Early results from a two-week trial show a 18% drop in late-night noise reports, though some shop owners worry about longer waits for restocking.

Advocates argue the model could expand to weekend mornings. Critics want clearer rules for electric vans and e-bike couriers before a citywide rollout.`,
    questions: [
      {
        id: 'q_news_1',
        prompt: 'What is the main goal of the pilot?',
        options: [
          { key: 'A', text: 'Increase highway speed limits' },
          { key: 'B', text: 'Reduce evening noise in residential areas' },
          { key: 'C', text: 'Ban all online shopping vans' },
          { key: 'D', text: 'Replace subways with delivery hubs' },
        ],
        correctAnswer: 'B',
        explanation: 'The pilot aims to cut noise complaints after 8 p.m. without slowing shopping.',
      },
      {
        id: 'q_news_2',
        prompt: 'What do logistics firms receive in return for sharing data?',
        options: [
          { key: 'A', text: 'Tax refunds' },
          { key: 'B', text: 'Free advertising' },
          { key: 'C', text: 'Priority access to loading bays' },
          { key: 'D', text: 'Unlimited highway lanes' },
        ],
        correctAnswer: 'C',
        explanation: 'They receive priority access to designated loading bays near subway hubs.',
      },
      {
        id: 'q_news_3',
        prompt: 'What concern do some shop owners raise?',
        options: [
          { key: 'A', text: 'Longer waits for restocking' },
          { key: 'B', text: 'Higher subway fares' },
          { key: 'C', text: 'Fewer electric vans' },
          { key: 'D', text: 'Closed loading bays at noon' },
        ],
        correctAnswer: 'A',
        explanation: 'Some shop owners worry about longer waits for restocking.',
      },
    ],
  },
];

/** 离线兜底；运行时优先 useNewsTopicsQuery */
export const NEWS_TOPIC_OPTIONS: readonly NewsTopic[] = NEWS_TOPICS;
