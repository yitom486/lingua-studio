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

/** 韩语轨道学习注记：新闻已接公开韩语 RSS；AI 篇目为 TOPIK 初中级模板正文 */
export const KOREAN_LEARNING_NOTES = `
Korean track news uses public Korean RSS (Yonhap / Donga) with article full-text extract when possible, else RSS summary.
AI passages are TOPIK 1–4 level template texts with main-idea / connector / register items; swap to model generation when wired.
`.trim();

/**
 * 韩语轨道 AI 篇目：TOPIK 初中级模板正文（日常话题 + 그래서/하지만 连接 + 平实语体）。
 * 接 LLM 时可将本函数返回值作为 system/user prompt 骨架。
 */
export function buildKoreanAiReadingPrompt(params: {
  topic: string;
  difficulty: number;
}): { title: string; body: string; sourceLabel: string } {
  const { topic, difficulty } = params;
  const band = difficulty <= 2 ? 'TOPIK 1–2급' : difficulty === 3 ? 'TOPIK 3–4급' : 'TOPIK 5–6급';
  return {
    title: `TOPIK 읽기: ${topic} (${band})`,
    sourceLabel: `AI 한국어 지문 · ${band} · 주제: ${topic}`,
    body: `오늘의 주제는 '${topic}'입니다. 이 주제는 우리의 일상생활과 가까운 내용입니다. 바쁜 하루 속에서도 잠깐 멈추어 주변을 살펴보면 새로운 것을 발견할 수 있습니다.

예를 들어 어제 있었던 일을 생각해 봅시다. 처음에는 별일 아닌 것 같아도 자세히 살펴보면 몰랐던 노력과 사람들의 따뜻함을 느낄 수 있습니다. 그래서 작은 발견을 소중히 여기는 마음이 중요합니다. 하지만 많은 사람들은 바쁘다는 이유로 이런 여유를 갖지 못합니다.

한국어를 공부하는 것도 같습니다. 매일 조금씩 새로운 표현을 쌓으면 읽기 실력과 표현력이 점점 좋아집니다. 앞으로도 호기심을 가지고 새로운 세계를 알아봅시다.`,
  };
}

/** 目标语种轨道（与前端 LearningShell / ContextSnapshot 对齐） */
export type TrackLanguage = 'ja' | 'en' | 'ko';

export function normalizeTrackLanguage(
  raw: string | undefined | null,
  fallback: TrackLanguage = 'en'
): TrackLanguage {
  const v = (raw || '').toLowerCase();
  if (v === 'ja' || v === 'jp') return 'ja';
  if (v === 'ko' || v === 'kr') return 'ko';
  if (v === 'en' || v === 'eng') return 'en';
  return fallback;
}

export function trackDisplayNameZh(track: TrackLanguage): string {
  return track === 'en' ? '英语' : track === 'ko' ? '韩语' : '日语';
}

export function trackLevelScheme(track: TrackLanguage): string {
  if (track === 'en') return 'CEFR / 考研分段';
  if (track === 'ko') return 'TOPIK';
  return 'JLPT 能力考';
}

/** 导师工具缺省 topic（避免韩/英语轨仍落到「格助词」） */
export function defaultCoachTopic(track: TrackLanguage): string {
  if (track === 'en') return '学术写作搭配与长难句';
  if (track === 'ko') return '조사 에/에서';
  return '助词与谓语动词搭配';
}

export function defaultExplainTopic(track: TrackLanguage): string {
  if (track === 'en') return '长难句主干与从句辨析';
  if (track === 'ko') return '조사·어미 핵심 변별';
  return '格助词辨析';
}

export function defaultQuizSkillId(track: TrackLanguage): string {
  if (track === 'en') return 'en.grammar.subjunctive';
  if (track === 'ko') return 'ko.grammar.particle_eseo';
  return 'jp.particle.ni_vs_de';
}

export function defaultLearnerLevelLabel(track: TrackLanguage): string {
  if (track === 'en') return 'B1';
  if (track === 'ko') return 'A1';
  return 'N3';
}

export function skillMatchesTrack(skillId: string, track: TrackLanguage): boolean {
  if (!skillId) return true;
  if (track === 'en') return skillId.startsWith('en.');
  if (track === 'ko') return skillId.startsWith('ko.');
  return !skillId.startsWith('en.') && !skillId.startsWith('ko.');
}

/**
 * 写入 ContextSnapshot.metadata，供后续 Adapter / 提示词骨架消费（Zero Provider Leak）。
 */
export function buildTrackCoachMetadata(track: TrackLanguage): Record<string, unknown> {
  const name = trackDisplayNameZh(track);
  const scheme = trackLevelScheme(track);
  return {
    coachTrack: track,
    coachTrackName: name,
    levelScheme: scheme,
    coachHints: [
      `界面母语为中文；学习目标语种为${name}（${scheme}）`,
      `讲解用中文，例句与术语使用${name}`,
      track === 'ja'
        ? '可引用助词/JLPT 考点；必要时提及假名注音'
        : track === 'en'
          ? '侧重长难句、搭配与考研/CET 陷阱，避免日语助词话术'
          : 'TOPIK interim：侧重조사/어미与敬体等级，勿串日语例句',
      '禁止假设学员正在学其他语种的种子题',
    ],
  };
}

/** Gateway 流式导师通用回复：按轨道偏置，不再写死「外语/日语」口吻 */
export function buildGenericCoachReply(params: {
  track: TrackLanguage;
  userPrompt: string;
  focusLabel?: string | undefined;
}): string {
  const { track, userPrompt } = params;
  const name = trackDisplayNameZh(track);
  const scheme = trackLevelScheme(track);
  const focusInfo = params.focusLabel
    ? `针对你正在学习的【${params.focusLabel}】`
    : `针对你的${name}学情进度`;
  const tip =
    track === 'en'
      ? '建议结合长难句切分与真比例句，需要时让我「讲透考点」或「给出例句」。'
      : track === 'ko'
        ? '建议对照조사/어미做最小对立体，需要时让我「讲透考点」或「给出例句」。'
        : '建议把孤立语法点放入完整语境体会，需要时让我「讲透考点」或「给出例句」。';

  return (
    `你好！我是你的${name}自适应学习专属导师（${scheme}）。${focusInfo}：\n\n` +
    `你刚刚提到：“${userPrompt}”。${tip}`
  );
}
