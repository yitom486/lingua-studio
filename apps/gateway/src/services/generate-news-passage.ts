import { isOk } from '@study-studio/shared';
import {
  fetchRssItems,
  resolveNewsFeed,
  type RssItem,
} from './news-rss.js';
import { buildReadingQuestionsFromNews, formatNewsBody } from './news-reading.js';
import {
  type StudyContentLanguage,
  normalizeContentLanguage,
} from './learning-language-policy.js';

export interface GeneratedNewsPassage {
  title: string;
  body: string;
  sourceLabel: string;
  sourceUrl?: string | undefined;
  questions: Array<{
    id: string;
    prompt: string;
    options: Array<{ key: string; text: string }>;
    correctAnswer: string;
    explanation: string;
  }>;
  fromRss: boolean;
  publisher: string;
}

export async function generateNewsPassage(params: {
  setId: string;
  topic: string;
  language: StudyContentLanguage | string;
}): Promise<GeneratedNewsPassage> {
  const { setId, topic } = params;
  const language = normalizeContentLanguage(params.language);
  const isJa = language === 'JA';
  const feed = resolveNewsFeed(topic, language);
  const rssRes = await fetchRssItems(feed.url, { limit: 10 });

  if (isOk(rssRes) && rssRes.value.length > 0) {
    const article: RssItem =
      rssRes.value[Math.floor(Math.random() * rssRes.value.length)] ?? rssRes.value[0]!;
    return {
      title: article.title,
      body: formatNewsBody(article, language),
      sourceLabel: `${feed.publisher} RSS · ${topic}`,
      ...(article.link ? { sourceUrl: article.link } : {}),
      questions: buildReadingQuestionsFromNews({
        setId,
        language,
        topic,
        article,
        publisher: feed.publisher,
      }),
      fromRss: true,
      publisher: feed.publisher,
    };
  }

  if (!isJa) {
    return {
      title: `English Media Briefing: ${topic}`,
      body: `Authentic English news on ${topic} is temporarily unavailable, so this curated briefing keeps your reading practice going.

First, identify the writer's claim in the opening lines. Next, notice discourse markers (however, meanwhile, according to) that signal contrast or evidence — these matter more than translating every noun into Chinese.

Finally, check whether the summary supports a clear main idea about ${topic}, or merely lists events. That distinction is central to CET and Kaoyan reading items.`,
      sourceLabel: `English study template · ${topic} (RSS unavailable: ${feed.publisher})`,
      questions: buildTemplateNewsQuestions(setId, language, topic),
      fromRss: false,
      publisher: feed.publisher,
    };
  }

  return {
    title: `【快讯】关于${topic}领域的最新发展与社会影响`,
    body: `近年のグローバルな技術革新と社会の変化に伴い、${topic}分野における新たな取り組みが急速に注目を集めている。国内外の専門機関が発表した最新データによれば、関連する市場規模は過去2年間で約30%拡大したという。

市場の成長とともに、ユーザーの利便性向上や業務効率化が実現される一方で、プライバシーの保護や安全性基準の整備といった制度的課題も指摘されている。

関係者は「持続可能な発展を遂げるためには、技術の進化だけでなく、社会全体の倫理規範との調和が不可欠である」と強調している。今後の法整備や官民連携の行方が注目される。`,
    sourceLabel: `合规模板稿 · ${topic}（RSS 暂不可用：${feed.publisher}）`,
    questions: buildTemplateNewsQuestions(setId, language, topic),
    fromRss: false,
    publisher: feed.publisher,
  };
}

function buildTemplateNewsQuestions(
  setId: string,
  language: StudyContentLanguage,
  topic: string
) {
  if (language !== 'JA') {
    return [
      {
        id: `${setId}_q1`,
        prompt: `What is the primary reading goal for this English briefing on ${topic}?`,
        options: [
          {
            key: 'A',
            text: 'Find the main claim and how evidence is signalled in the paragraph',
          },
          {
            key: 'B',
            text: 'Translate every word into Chinese before understanding the sentence',
          },
          {
            key: 'C',
            text: 'Ignore discourse markers and focus only on rare proper nouns',
          },
          {
            key: 'D',
            text: 'Assume the summary has no factual content at all',
          },
        ],
        correctAnswer: 'A',
        explanation:
          'English-exam reading rewards main-idea + discourse structure over word-by-word Chinglish translation.',
      },
      {
        id: `${setId}_q2`,
        prompt: 'Which habit best reduces Chinglish interference while reading news?',
        options: [
          {
            key: 'A',
            text: 'Track collocations and connectors in context before translating',
          },
          {
            key: 'B',
            text: 'Force Chinese word order onto every English sentence',
          },
          {
            key: 'C',
            text: 'Skip the headline and jump randomly into the middle',
          },
          {
            key: 'D',
            text: 'Memorize publisher names instead of the claim',
          },
        ],
        correctAnswer: 'A',
        explanation:
          'Collocations and connectors (however / according to / while) carry logic that CET/Kaoyan items often test.',
      },
      {
        id: `${setId}_q3`,
        prompt: 'When live RSS returns, which source type should learners prefer?',
        options: [
          {
            key: 'A',
            text: 'Reputable English media feeds (BBC / NPR / Guardian) with a source link',
          },
          {
            key: 'B',
            text: 'Anonymous forum reposts without a citation',
          },
          {
            key: 'C',
            text: 'Unverified marketing emails',
          },
          {
            key: 'D',
            text: 'Machine-translated social captions only',
          },
        ],
        correctAnswer: 'A',
        explanation:
          'Study Studio defaults to public English media RSS for authentic input; Korean tracks can swap publishers later.',
      },
    ];
  }

  return [
    {
      id: `${setId}_q1`,
      prompt: `本文で言及されている主な動向として適切なものはどれか。`,
      options: [
        {
          key: 'A',
          text: '関連分野の取り組みが急速に注目され市場が拡大している',
        },
        {
          key: 'B',
          text: '政府が当該分野への投資を全面的に禁止した',
        },
        {
          key: 'C',
          text: '技術の進化が完全に停滞し需要が消滅した',
        },
        {
          key: 'D',
          text: 'すべての規制や基準が撤廃された',
        },
      ],
      correctAnswer: 'A',
      explanation: '第1段落で市場規模の拡大と急速な注目の高まりが述べられている。',
    },
    {
      id: `${setId}_q2`,
      prompt: `本文で指摘されている課題は何か。`,
      options: [
        { key: 'A', text: '原料の物理的枯渇' },
        {
          key: 'B',
          text: '安全性基準の整備やプライバシーの保護',
        },
        { key: 'C', text: '従事者の完全な不足' },
        { key: 'D', text: '交通インフラの機能停止' },
      ],
      correctAnswer: 'B',
      explanation: '第2段落「プライバシーの保護や安全性基準の整備といった制度的課題」と合致。',
    },
    {
      id: `${setId}_q3`,
      prompt: `今後の持続可能な発展に必要な条件として関係者が挙げたものは何か。`,
      options: [
        {
          key: 'A',
          text: '技術の進化と社会全体の倫理規範・透明性との調和',
        },
        {
          key: 'B',
          text: '競争相手の排除と独占体制の確立',
        },
        { key: 'C', text: 'すべての法整備の中止' },
        {
          key: 'D',
          text: '海外市場からの即時撤退',
        },
      ],
      correctAnswer: 'A',
      explanation: '第3段落「技術の進化だけでなく、社会全体の倫理規範との調和が不可欠」と対応。',
    },
  ];
}
