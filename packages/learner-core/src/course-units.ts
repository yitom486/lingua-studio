import type { DailyPlanNavigateTarget, DailyPlanStepKind } from './daily-plan.js';

/**
 * 课程单元与解锁（教学路线图，而非每日打卡）。
 * - 大阶段展示（零基础/初学者/中级/高级），内部拆短小单元；
 * - 前置关系 + 掌握证据决定解锁；“看过/做过”只记活动，不算掌握；
 * - 已记录的掌握永不自动收回（保留阶段资格；遗忘走复习建议，不锁回）。
 * 静态课程资产（公开教学常识+本仓库题库/讲义/词包现状对齐），登记见 STATIC 清单；
 * 掌握阈值均为待验证的初始参数（见 codex 方案 §5），须按真实表现校准。
 */

export const COURSE_STAGES = [
  { stage: 0, name: '零基础' },
  { stage: 1, name: '初学者' },
  { stage: 2, name: '中级' },
  { stage: 3, name: '高级' },
] as const;

export type CourseUnitKind = 'kana' | 'words' | 'lesson' | 'quiz' | 'exam';

/** 掌握证据规则（网关按现有表组装证据，纯函数只做判定）。
 * 语义铁律：点击学完/收藏/浏览/活动次数不能直接产生 mastered；
 * “学过”只开解锁（讲义锁），“掌握”必须有对应作答证据。
 */
export type UnitEvidenceRule =
  /** 假名覆盖：kanaIds 中“干净且练过两次以上”（errors==0 且 reps≥2）的个数达标 */
  | { type: 'kana-coverage'; kanaIds: string[]; minOk: number }
  /** 专项做题：该技能累计尝试与正确率达标（无提示/有提示不区分，按题计） */
  | { type: 'quiz-skill'; skillId: string; minAttempts: number; minAccuracy: number }
  /** 讲义学透：先学完讲义（开练习），再在对应技能上做出尝试与正确率 */
  | { type: 'lesson-plus-quiz'; skillId: string; minAttempts: number; minAccuracy: number }
  /** 生词学透：指定词表分组（或显式词 id）中“复习过两次以上”的卡达标（光点学透不算） */
  | { type: 'words-studied'; group?: string | undefined; take?: number | undefined; entryIds?: string[] | undefined; minStudied: number }
  /** 阶段测评通过（定级考） */
  | { type: 'exam-pass'; targetLevel: string };

export interface UnitActivity {
  planKind: DailyPlanStepKind;
  navigateTo: DailyPlanNavigateTarget;
  skillId?: string | undefined;
  skillName?: string | undefined;
  targetCount?: number | undefined;
}

export interface CourseUnit {
  id: string;
  track: 'ja' | 'en' | 'ko';
  stage: 0 | 1 | 2 | 3;
  order: number;
  kind: CourseUnitKind;
  title: string;
  summary: string;
  requires: string[];
  evidence: UnitEvidenceRule;
  activity: UnitActivity;
}

/** 网关组装的证据（全部来自既有表，不新增证据表）。 */
export interface UnitEvidence {
  /** 有干净作答记录的假名 id（去重后集合） */
  kanaOk: string[];
  /** 按技能聚合的做题（尝试/答对） */
  quizBySkill: Record<string, { attempts: number; correct: number }>;
  /** 已学完的讲义技能 */
  lessonsDone: string[];
  /** 已学透的词条目 id */
  wordsStudied: string[];
  /** 已通过的测评目标档 */
  examsPassed: string[];
  /** 近期有错误的假名 id（复习信号，不降级） */
  kanaStale: string[];
  /** 近期连错的技能 id（复习信号，不降级） */
  staleSkills: string[];
}

export type UnitStatus = 'locked' | 'available' | 'mastered';

export interface UnitRouteItem {
  unit: CourseUnit;
  status: UnitStatus;
  /** 进度说明（如 3/5；掌握显示“已掌握/已达标”） */
  progress: string;
  /** 已掌握但近期有错误：资格保留，提示复习（与资格分开显示） */
  needsReview: boolean;
}

const V = ['kana_a', 'kana_i', 'kana_u', 'kana_e', 'kana_o'];
const KASA = ['kana_ka', 'kana_ki', 'kana_ku', 'kana_ke', 'kana_ko', 'kana_sa', 'kana_shi', 'kana_su', 'kana_se', 'kana_so'];
const TANA = ['kana_ta', 'kana_chi', 'kana_tsu', 'kana_te', 'kana_to', 'kana_na', 'kana_ni', 'kana_nu', 'kana_ne', 'kana_no'];
const HM = ['kana_ha', 'kana_hi', 'kana_fu', 'kana_he', 'kana_ho', 'kana_ma', 'kana_mi', 'kana_mu', 'kana_me', 'kana_mo'];
const RYW = ['kana_ra', 'kana_ri', 'kana_ru', 'kana_re', 'kana_ro', 'kana_ya', 'kana_yu', 'kana_yo', 'kana_wa', 'kana_wo', 'kana_n'];
const DAKUTEN = [
  'kana_ga', 'kana_gi', 'kana_gu', 'kana_ge', 'kana_go',
  'kana_za', 'kana_ji', 'kana_zu', 'kana_ze', 'kana_zo',
  'kana_da', 'kana_dji', 'kana_dzu', 'kana_de', 'kana_do',
  'kana_ba', 'kana_bi', 'kana_bu', 'kana_be', 'kana_bo',
  'kana_pa', 'kana_pi', 'kana_pu', 'kana_pe', 'kana_po',
];
const YOON = [
  'kana_kya', 'kana_kyu', 'kana_kyo', 'kana_sha', 'kana_shu', 'kana_sho',
  'kana_cha', 'kana_chu', 'kana_cho', 'kana_nya', 'kana_nyu', 'kana_nyo',
  'kana_hya', 'kana_hyu', 'kana_hyo', 'kana_mya', 'kana_myu', 'kana_myo',
  'kana_rya', 'kana_ryu', 'kana_ryo', 'kana_gya', 'kana_gyu', 'kana_gyo',
  'kana_ja', 'kana_ju', 'kana_jo', 'kana_bya', 'kana_byu', 'kana_byo',
  'kana_pya', 'kana_pyu', 'kana_pyo',
];

const GREET_WORDS = ['starter_ja_ohayou', 'n5_ja_arigatou', 'n5_ja_sumimasen', 'n5_ja_onegaishimasu'];

export const COURSE_UNITS: CourseUnit[] = [
  {
    id: 'ja-u-vowels', track: 'ja', stage: 0, order: 10, kind: 'kana',
    title: '元音入门：あいうえお', summary: '听音认形 5 个元音假名，能听辨、能跟读。',
    requires: [],
    evidence: { type: 'kana-coverage', kanaIds: V, minOk: 5 },
    activity: { planKind: 'ALPHABET', navigateTo: 'KANA', targetCount: 5 },
  },
  {
    id: 'ja-u-kasa', track: 'ja', stage: 0, order: 20, kind: 'kana',
    title: 'K 行与 S 行', summary: 'かきくけこ・さしすせそ，认形 + 听辨。',
    requires: ['ja-u-vowels'],
    evidence: { type: 'kana-coverage', kanaIds: KASA, minOk: 8 },
    activity: { planKind: 'ALPHABET', navigateTo: 'KANA', targetCount: 5 },
  },
  {
    id: 'ja-u-tana', track: 'ja', stage: 0, order: 30, kind: 'kana',
    title: 'T 行与 N 行', summary: 'たちつてと・なにぬねの，注意 ち/つ/し 的听辨。',
    requires: ['ja-u-kasa'],
    evidence: { type: 'kana-coverage', kanaIds: TANA, minOk: 8 },
    activity: { planKind: 'ALPHABET', navigateTo: 'KANA', targetCount: 5 },
  },
  {
    id: 'ja-u-hm', track: 'ja', stage: 0, order: 40, kind: 'kana',
    title: 'H 行与 M 行', summary: 'はひふへほ・まみむめも，ふ 只有唇音不要读成 hu。',
    requires: ['ja-u-tana'],
    evidence: { type: 'kana-coverage', kanaIds: HM, minOk: 8 },
    activity: { planKind: 'ALPHABET', navigateTo: 'KANA', targetCount: 5 },
  },
  {
    id: 'ja-u-ryw', track: 'ja', stage: 0, order: 50, kind: 'kana',
    title: 'R·Y·W 行与ん', summary: 'らりるれろ・やゆよ・わをん，清音收官。',
    requires: ['ja-u-hm'],
    evidence: { type: 'kana-coverage', kanaIds: RYW, minOk: 9 },
    activity: { planKind: 'ALPHABET', navigateTo: 'KANA', targetCount: 5 },
  },
  {
    id: 'ja-u-dakuten', track: 'ja', stage: 0, order: 60, kind: 'kana',
    title: '浊音与半浊音', summary: 'がざだばぱ五行，听辨清浊对立。',
    requires: ['ja-u-ryw'],
    evidence: { type: 'kana-coverage', kanaIds: DAKUTEN, minOk: 20 },
    activity: { planKind: 'ALPHABET', navigateTo: 'KANA', targetCount: 5 },
  },
  {
    id: 'ja-u-yoon', track: 'ja', stage: 0, order: 70, kind: 'kana',
    title: '拗音', summary: 'きゃきゅきょ等小字拼读，认读即可，不阻塞出阶段。',
    requires: ['ja-u-dakuten'],
    evidence: { type: 'kana-coverage', kanaIds: YOON, minOk: 25 },
    activity: { planKind: 'ALPHABET', navigateTo: 'KANA', targetCount: 5 },
  },
  {
    id: 'ja-u-greet', track: 'ja', stage: 0, order: 15, kind: 'words',
    title: '第一句日语：问候', summary: 'おはよう/ありがとう/すみません/お願いします，听懂会说。',
    requires: ['ja-u-vowels'],
    evidence: { type: 'words-studied', entryIds: GREET_WORDS, minStudied: 3 },
    activity: { planKind: 'NEW_WORDS', navigateTo: 'CARDS', targetCount: 3 },
  },
  {
    id: 'ja-u-words1', track: 'ja', stage: 0, order: 25, kind: 'words',
    title: 'N5 前 20 词', summary: '人称与生活高频词，学透 10 个。',
    requires: ['ja-u-greet'],
    evidence: { type: 'words-studied', group: 'ja-n5-core', take: 20, minStudied: 10 },
    activity: { planKind: 'NEW_WORDS', navigateTo: 'CARDS', targetCount: 3 },
  },
  {
    id: 'ja-u-lesson-nide', track: 'ja', stage: 0, order: 35, kind: 'lesson',
    title: '讲义：で・に', summary: '学完“场所助词”讲义，再做出 3 道相关题，解锁后续。',
    requires: ['ja-u-words1'],
    evidence: { type: 'lesson-plus-quiz', skillId: 'jp.particle.ni_vs_de', minAttempts: 3, minAccuracy: 0.6 },
    activity: { planKind: 'GRAMMAR', navigateTo: 'QUIZ', skillId: 'jp.particle.ni_vs_de', skillName: '场所助词で・に', targetCount: 1 },
  },
  {
    id: 'ja-u-words2', track: 'ja', stage: 0, order: 45, kind: 'words',
    title: 'N5 词扩到 25 个', summary: '继续收词，累计学透 25 个 N5 核心词。',
    requires: ['ja-u-lesson-nide'],
    evidence: { type: 'words-studied', group: 'ja-n5-core', minStudied: 25 },
    activity: { planKind: 'NEW_WORDS', navigateTo: 'CARDS', targetCount: 3 },
  },
  {
    id: 'ja-u-exam0', track: 'ja', stage: 0, order: 80, kind: 'exam',
    title: '零基础测评：升初学者', summary: '定级考过初学者档，覆盖已学假名与基础考点。',
    requires: ['ja-u-dakuten', 'ja-u-words2', 'ja-u-lesson-nide'],
    evidence: { type: 'exam-pass', targetLevel: 'BEGINNER' },
    activity: { planKind: 'QUIZ', navigateTo: 'RADAR', targetCount: 1 },
  },
  {
    id: 'ja-u-lesson-tara', track: 'ja', stage: 1, order: 10, kind: 'lesson',
    title: '讲义：たら条件形', summary: 'N4 第一个条件形：学完讲义再做出变形题。',
    requires: ['ja-u-exam0'],
    evidence: { type: 'lesson-plus-quiz', skillId: 'jp.grammar.conditional_tara', minAttempts: 3, minAccuracy: 0.6 },
    activity: { planKind: 'GRAMMAR', navigateTo: 'QUIZ', skillId: 'jp.grammar.conditional_tara', skillName: '假定条件たら', targetCount: 1 },
  },
  {
    id: 'ja-u-lesson-kara', track: 'ja', stage: 1, order: 20, kind: 'lesson',
    title: '讲义：原因から', summary: '“因为…所以…”：学完讲义再做出相关题。',
    requires: ['ja-u-exam0'],
    evidence: { type: 'lesson-plus-quiz', skillId: 'jp.grammar.reason_kara', minAttempts: 3, minAccuracy: 0.6 },
    activity: { planKind: 'GRAMMAR', navigateTo: 'QUIZ', skillId: 'jp.grammar.reason_kara', skillName: '原因から', targetCount: 1 },
  },
  {
    id: 'ja-u-keigo', track: 'ja', stage: 1, order: 30, kind: 'lesson',
    title: '讲义：自我介绍', summary: '三句话介绍自己：学完讲义再做出相关题。',
    requires: ['ja-u-exam0'],
    evidence: { type: 'lesson-plus-quiz', skillId: 'jp.keigo.self_introduction', minAttempts: 3, minAccuracy: 0.6 },
    activity: { planKind: 'GRAMMAR', navigateTo: 'QUIZ', skillId: 'jp.keigo.self_introduction', skillName: '自我介绍', targetCount: 1 },
  },
  {
    id: 'ja-u-textbook1', track: 'ja', stage: 1, order: 40, kind: 'quiz',
    title: '教材第一课测验', summary: '用自己教材的第一课组题，做 3 道句子理解。',
    requires: ['ja-u-exam0'],
    evidence: { type: 'quiz-skill', skillId: 'jp.sentence.review', minAttempts: 3, minAccuracy: 0.6 },
    activity: { planKind: 'QUIZ', navigateTo: 'TEXTBOOK', targetCount: 3 },
  },
  {
    id: 'ko-u-starter', track: 'ko', stage: 0, order: 10, kind: 'words',
    title: '韩语入门 24 词', summary: '问候与生活高频词，学透 10 个。',
    requires: [],
    evidence: { type: 'words-studied', group: 'ko-starter', minStudied: 10 },
    activity: { planKind: 'NEW_WORDS', navigateTo: 'CARDS', targetCount: 3 },
  },
  {
    id: 'en-u-starter', track: 'en', stage: 0, order: 10, kind: 'words',
    title: '英语入门 24 词', summary: '具体名词与基础动词，学透 10 个。',
    requires: [],
    evidence: { type: 'words-studied', group: 'en-starter', minStudied: 10 },
    activity: { planKind: 'NEW_WORDS', navigateTo: 'CARDS', targetCount: 3 },
  },
];

export function unitsForTrack(track: 'ja' | 'en' | 'ko'): CourseUnit[] {
  return COURSE_UNITS.filter((u) => u.track === track).sort((a, b) =>
    a.stage !== b.stage ? a.stage - b.stage : a.order - b.order
  );
}

function ruleProgress(
  rule: UnitEvidenceRule,
  evidence: UnitEvidence,
  wordPool?: string[]
): { done: boolean; text: string } {
  switch (rule.type) {
    case 'kana-coverage': {
      const okSet = new Set(evidence.kanaOk);
      const n = rule.kanaIds.filter((k) => okSet.has(k)).length;
      return { done: n >= rule.minOk, text: `${Math.min(n, rule.minOk)}/${rule.minOk}` };
    }
    case 'quiz-skill': {
      const s = evidence.quizBySkill[rule.skillId];
      const attempts = s?.attempts ?? 0;
      const acc = attempts > 0 ? (s?.correct ?? 0) / attempts : 0;
      const done = attempts >= rule.minAttempts && acc >= rule.minAccuracy;
      return { done, text: `${attempts} 题${attempts > 0 ? ` · ${Math.round(acc * 100)}%` : ''}` };
    }
    case 'lesson-plus-quiz': {
      if (!evidence.lessonsDone.includes(rule.skillId)) {
        return { done: false, text: '讲义未学' };
      }
      const s = evidence.quizBySkill[rule.skillId];
      const attempts = s?.attempts ?? 0;
      const acc = attempts > 0 ? (s?.correct ?? 0) / attempts : 0;
      const done = attempts >= rule.minAttempts && acc >= rule.minAccuracy;
      return { done, text: done ? '已学透' : `已学·测验 ${attempts}/${rule.minAttempts} 题` };
    }
    case 'words-studied': {
      const pool = rule.entryIds ?? wordPool ?? [];
      const n = pool.filter((id) => evidence.wordsStudied.includes(id)).length;
      return { done: n >= rule.minStudied, text: `${Math.min(n, rule.minStudied)}/${rule.minStudied}` };
    }
    case 'exam-pass': {
      const done = evidence.examsPassed.includes(rule.targetLevel);
      return { done, text: done ? '已通过' : '未通过' };
    }
  }
}

/**
 * 路线求值（纯函数，内部不动点迭代：本轮证据达标的掌握可解锁同轮后续单元）。
 * 已记录掌握 → mastered；前置未齐 → locked；
 * 前置齐且证据达标 → mastered（调用方负责把新增写档，本函数不写库）；
 * 前置齐但证据未达标 → available。
 * words-studied 的候选集由网关传入（resolvedWords），纯函数不查词表。
 */
export function resolveCourseRoute(
  track: 'ja' | 'en' | 'ko',
  evidence: UnitEvidence,
  mastered: Set<string>,
  resolvedWords?: Record<string, string[]>
): UnitRouteItem[] {
  const units = unitsForTrack(track);
  const masteredNow = new Set(mastered);
  // 先按证据把能掌握的全部收敛（链式前置同轮级联，最多 units.length 轮）。
  for (let round = 0; round < units.length; round++) {
    let changed = false;
    for (const unit of units) {
      if (masteredNow.has(unit.id)) continue;
      if (!unit.requires.every((r) => masteredNow.has(r))) continue;
      if (unitEvidenceMet(unit, evidence, resolvedWords)) {
        masteredNow.add(unit.id);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return units.map((unit) => {
    if (masteredNow.has(unit.id)) {
      return {
        unit,
        status: 'mastered' as const,
        progress: mastered.has(unit.id) ? '已掌握' : '已达标',
        needsReview: unitNeedsReview(unit, evidence),
      };
    }
    const missing = unit.requires.filter((r) => !masteredNow.has(r)).length;
    if (missing > 0) {
      return { unit, status: 'locked' as const, progress: `前置 ${unit.requires.length - missing}/${unit.requires.length}`, needsReview: false };
    }
    return { unit, status: 'available' as const, progress: unitProgressText(unit, evidence, resolvedWords), needsReview: false };
  });
}

/** 复习信号（资格保留，只提示复习）：本单元覆盖的假名/技能近期有错误。 */
function unitNeedsReview(unit: CourseUnit, evidence: UnitEvidence): boolean {
  if (unit.evidence.type === 'kana-coverage') {
    return unit.evidence.kanaIds.some((k) => evidence.kanaStale.includes(k));
  }
  if (unit.evidence.type === 'quiz-skill' || unit.evidence.type === 'lesson-plus-quiz') {
    return evidence.staleSkills.includes(unit.evidence.skillId);
  }
  return false;
}

function resolveWordPool(
  rule: Extract<UnitEvidenceRule, { type: 'words-studied' }>,
  resolvedWords?: Record<string, string[]>
): string[] {
  return rule.entryIds
    ?? (rule.group && resolvedWords
      ? resolvedWords[rule.group]?.slice(0, rule.take ?? 100000) ?? []
      : []);
}

function unitEvidenceMet(
  unit: CourseUnit,
  evidence: UnitEvidence,
  resolvedWords?: Record<string, string[]>
): boolean {
  if (unit.evidence.type === 'words-studied') {
    return ruleProgress(unit.evidence, evidence, resolveWordPool(unit.evidence, resolvedWords)).done;
  }
  return ruleProgress(unit.evidence, evidence).done;
}

function unitProgressText(
  unit: CourseUnit,
  evidence: UnitEvidence,
  resolvedWords?: Record<string, string[]>
): string {
  if (unit.evidence.type === 'words-studied') {
    return ruleProgress(unit.evidence, evidence, resolveWordPool(unit.evidence, resolvedWords)).text;
  }
  return ruleProgress(unit.evidence, evidence).text;
}

/** 下一步：首个可学（available）的单元；全掌握返回 null。 */
export function nextUnit(route: UnitRouteItem[]): UnitRouteItem | null {
  return route.find((r) => r.status === 'available') ?? null;
}

/** 路线快照（网关求值 + 写档后返回；前端渲染阶段/解锁链）。 */
export interface CourseRouteSnapshot {
  units: UnitRouteItem[];
  nextUpId: string | null;
}
