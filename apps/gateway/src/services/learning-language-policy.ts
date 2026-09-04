/**
 * 学习目标语言策略：初期英语优先，日语并存，韩语预留扩展。
 * RSS / 阅读生成 / UI 默认均应对齐此文件，避免各处硬编码 ja。
 */
export type StudyContentLanguage = 'EN' | 'JA' | 'KO';

/** 产品初期默认学习内容语言（阅读/新闻生成） */
export const DEFAULT_CONTENT_LANGUAGE: StudyContentLanguage = 'EN';

export function normalizeContentLanguage(
  raw: string | undefined | null,
  fallback: StudyContentLanguage = DEFAULT_CONTENT_LANGUAGE
): StudyContentLanguage {
  const v = (raw || '').toUpperCase();
  if (v === 'JA' || v === 'JP') return 'JA';
  if (v === 'KO' || v === 'KR') return 'KO';
  if (v === 'EN' || v === 'ENG') return 'EN';
  return fallback;
}

export function languageDisplayName(lang: StudyContentLanguage, locale: 'zh' | 'en' = 'zh'): string {
  if (locale === 'en') {
    return lang === 'EN' ? 'English' : lang === 'JA' ? 'Japanese' : 'Korean';
  }
  return lang === 'EN' ? '英语' : lang === 'JA' ? '日语' : '韩语';
}

/**
 * 英文自适应阅读篇目：面向 CET / 考研 / 日常精读，强调中式英语规避与语篇结构。
 * 当前为离线模板正文；接 LLM 时可将本函数返回值作为 system/user prompt 骨架。
 */
export function buildEnglishAiReadingPrompt(params: {
  topic: string;
  difficulty: number;
}): { title: string; body: string; sourceLabel: string } {
  const { topic, difficulty } = params;
  const cefr =
    difficulty <= 2 ? 'A2–B1' : difficulty === 3 ? 'B1–B2' : difficulty === 4 ? 'B2–C1' : 'C1';
  return {
    title: `Reading Focus: ${topic} (CEFR ${cefr})`,
    sourceLabel: `AI English Passage · Lv.${difficulty} · CEFR ${cefr} · Topic: ${topic}`,
    body: `For many Chinese learners of English, ${topic} is not only a content theme but also a chance to practice clear paragraph structure and natural collocations.

In the opening paragraph, a strong English essay usually states a clear claim, then supports it with one concrete example. Avoid translating Chinese word order directly; prefer “subject + verb + object” and signal logic with words such as however, therefore, and for instance.

A second paragraph can contrast two viewpoints. Instead of writing “people think… people also think…”, try “While some argue that…, others contend that…”. This pattern is common in CET and postgraduate entrance exam reading.

Finally, end with a concise takeaway: what the reader should notice next time they meet ${topic} in authentic media. Keep sentences medium-length, prefer precise verbs over vague nouns, and check articles (a/an/the) before you finish.`,
  };
}

/** 英文新闻阅读配题说明（给组题器 / 未来 LLM 的约束） */
export const ENGLISH_NEWS_QUIZ_GUIDANCE = `
You are building comprehension items for Chinese learners of English (CET-4/6, Kaoyan, or general B1–B2).
Prefer: main idea, vocabulary-in-context, inference — not trivia about the publisher.
Wrong options should be plausible Chinglish traps or over-generalizations.
Keep option length similar; one clearly best answer.
`.trim();

/** 韩语扩展占位：正式接入时替换为真实 RSS 与 TOPIK 向提示词 */
export const KOREAN_LEARNING_NOTES = `
Korean track is reserved. When enabled: map content language KO to public Korean/English-Korea news RSS,
and align prompts with TOPIK reading strategies (main idea, connector words, honorific register awareness).
`.trim();

/**
 * 韩语轨道 AI 篇目脚手架（正文暂为英文说明 + TOPIK 提示占位）。
 * 正式接入时替换为韩语正文与 TOPIK 配题。
 */
export function buildKoreanAiReadingPrompt(params: {
  topic: string;
  difficulty: number;
}): { title: string; body: string; sourceLabel: string } {
  const { topic, difficulty } = params;
  return {
    title: `TOPIK Reading Prep (interim): ${topic}`,
    sourceLabel: `AI Korean track · interim EN scaffold · Lv.${difficulty} · Topic: ${topic}`,
    body: `This passage is a temporary English scaffold for the Korean learning track while authentic Korean media RSS and TOPIK-aligned generation are wired up.

Focus theme: ${topic}. When Korean content lands, practice: (1) finding the main idea in the first two sentences, (2) tracking connector words (그래서, 하지만, 그러나), and (3) noticing honorific or formal register in news-style writing.

${KOREAN_LEARNING_NOTES}`,
  };
}
