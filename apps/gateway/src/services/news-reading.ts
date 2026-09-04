import type { RssItem } from './news-rss.js';
import { pickLeadSentence, sanitizeRssText } from './news-rss.js';
import {
  type StudyContentLanguage,
  ENGLISH_NEWS_QUIZ_GUIDANCE,
} from './learning-language-policy.js';

/** 英文新闻配题共用尾注：对齐 CET/考研向约束（接 LLM 时可整段注入） */
const EN_QUIZ_TAIL = ENGLISH_NEWS_QUIZ_GUIDANCE.split('\n')[1] ?? ENGLISH_NEWS_QUIZ_GUIDANCE;

export function buildReadingQuestionsFromNews(params: {
  setId: string;
  language: StudyContentLanguage;
  topic: string;
  article: RssItem;
  publisher: string;
}): Array<{
  id: string;
  prompt: string;
  options: Array<{ key: string; text: string }>;
  correctAnswer: string;
  explanation: string;
}> {
  const { setId, language, topic, article, publisher } = params;
  if (language === 'EN' || language === 'KO') {
    return buildEnglishLearnerNewsQuestions(params);
  }
  return buildJapaneseNewsQuestions(setId, topic, article, publisher);
}

/** 英语（及韩语轨道暂用英文稿）学习者向：主旨 / 语境词义 / 推断 */
function buildEnglishLearnerNewsQuestions(params: {
  setId: string;
  topic: string;
  article: RssItem;
  publisher: string;
}) {
  const { setId, topic, article, publisher } = params;
  const lead = pickLeadSentence(article.description, 90);
  const titleShort = pickLeadSentence(article.title, 72);
  const keyword = topic.replace(/_/g, ' ');

  return [
    {
      id: `${setId}_q1`,
      prompt: 'What is the best main idea of this news item?',
      options: [
        { key: 'A', text: titleShort },
        {
          key: 'B',
          text: `All ${keyword} research worldwide has been permanently cancelled`,
        },
        {
          key: 'C',
          text: 'The article is only an advertisement with no factual claim',
        },
        {
          key: 'D',
          text: 'Readers are told to ignore international developments entirely',
        },
      ],
      correctAnswer: 'A',
      explanation: `Match the headline: “${article.title}”. ${EN_QUIZ_TAIL}`,
    },
    {
      id: `${setId}_q2`,
      prompt:
        'According to the summary, which statement is closest to the reported facts?',
      options: [
        { key: 'A', text: lead || titleShort },
        {
          key: 'B',
          text: 'Officials said the issue was already fully solved with no remaining risk',
        },
        {
          key: 'C',
          text: 'The piece states that no reporting or investigation took place',
        },
        {
          key: 'D',
          text: 'The only topic mentioned is a minor spelling correction',
        },
      ],
      correctAnswer: 'A',
      explanation:
        'Use the lead of the RSS summary. Avoid over-generalizing — a common trap in English reading exams.',
    },
    {
      id: `${setId}_q3`,
      prompt:
        'Which skill focus does this authentic English media item best support for Chinese learners?',
      options: [
        {
          key: 'A',
          text: 'Skimming for main idea + checking a reliable English source link',
        },
        {
          key: 'B',
          text: 'Memorizing every proper noun without understanding the claim',
        },
        {
          key: 'C',
          text: 'Translating word-by-word into Chinese before reading the sentence',
        },
        {
          key: 'D',
          text: 'Ignoring discourse markers like however / therefore / while',
        },
      ],
      correctAnswer: 'A',
      explanation: `Source: ${publisher}. Prefer main-idea skimming and natural collocations over word-by-word Chinglish translation.`,
    },
  ];
}

function buildJapaneseNewsQuestions(
  setId: string,
  topic: string,
  article: RssItem,
  publisher: string
) {
  const lead = pickLeadSentence(article.description, 48);
  const titleShort = pickLeadSentence(article.title, 36);
  return [
    {
      id: `${setId}_q1`,
      prompt: 'このニュースの主題として最も適切なものはどれか。',
      options: [
        { key: 'A', text: titleShort },
        { key: 'B', text: `${topic}分野の公式統計が全面停止した` },
        { key: 'C', text: '気象庁が全国の警報をすべて解除した' },
        { key: 'D', text: '該当分野の報道が全面禁止された' },
      ],
      correctAnswer: 'A',
      explanation: `見出し「${article.title}」が主題を示す。`,
    },
    {
      id: `${setId}_q2`,
      prompt: '本文（要約）で述べられている内容に最も近いものはどれか。',
      options: [
        { key: 'A', text: lead || titleShort },
        { key: 'B', text: '記事は価格改定のみを扱っており他の情報はない' },
        { key: 'C', text: '関係者は「問題は既に完全解決した」とのみ述べた' },
        { key: 'D', text: '海外からの取材は一切行われていないと明記された' },
      ],
      correctAnswer: 'A',
      explanation: '要約の先頭文が主要な事実を伝える。',
    },
    {
      id: `${setId}_q3`,
      prompt: 'この記事の情報源・出典として正しいものはどれか。',
      options: [
        { key: 'A', text: `${publisher} 公開 RSS（個人学習用キャッシュ）` },
        { key: 'B', text: '匿名掲示板の転載のみ' },
        { key: 'C', text: '未検証の個人ブログ' },
        { key: 'D', text: '広告メールの件名一覧' },
      ],
      correctAnswer: 'A',
      explanation: `本アプリは ${publisher} 等の公開 RSS を個人学習用途で取得し、原文リンク付きで提示する。`,
    },
  ];
}

export function formatNewsBody(
  article: RssItem,
  language: StudyContentLanguage
): string {
  const isJa = language === 'JA';
  const dateLine = article.pubDate
    ? isJa
      ? `公開：${article.pubDate}`
      : `Published: ${article.pubDate}`
    : '';
  // 原文 URL 由 ReadingPassageSet.sourceUrl + 阅读台「查看原文」按钮承载，避免正文里再贴一长串链接
  const tip =
    language === 'EN' || language === 'KO'
      ? 'Study tip: Read the headline first, then the lead sentence — then check unknown collocations in context.'
      : language === 'JA'
        ? '学習ヒント：見出し→リード文の順で読み、わからない語は文脈で推測してから辞書を開きましょう。'
        : '';
  return [sanitizeRssText(article.description), '', dateLine, tip].filter(Boolean).join('\n');
}
