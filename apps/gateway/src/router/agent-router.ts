/**
 * Agent 引擎选型（旁路）
 * - learning-loop：学习闭环主通路（工具出题/讲解/通用导师）
 * - responses-lite：低复杂度快问快答（发音/助词/五十音等课程资产或 stub）
 *
 * 正式 Codex 会话编排仍可挂在 learning-loop；本路由器不引入厂商 SDK。
 */

export type AgentRouteId = 'learning-loop' | 'responses-lite';

export interface AgentRouteInput {
  userPrompt: string;
  intent?: string | undefined;
  targetLanguage?: string | undefined;
}

export interface AgentRouteDecision {
  route: AgentRouteId;
  reason: string;
}

const CONTENT_TOOL_HINT =
  /例句|造句|讲透|辨析|区分|考点|出题|考我|练一练|为什么|制定.*计划|复盘计划|一周/;

const LITE_HINT_JA =
  /读音|怎么读|発音|发音|声调|pitch|假名|五十音|平假名|片假名|助词|に\s*vs\s*で|で\s*vs\s*に|格助词/;

const LITE_HINT_KO = /발음|어떻게\s*읽|조사|에서|은\/는|이\/가|假名|发音|助词/;

const LITE_HINT_EN =
  /how\s+do\s+you\s+pronounce|pronunciation|ipa|stress|preposition|collocation|怎么读|发音|介词/;

const SHORT_Q = /[?？]|吗|呢|怎么|什么|为何|哪个|무엇|어떻게|what|how|why/;

/**
 * 纯函数选型：可单测、可日志；不持有 adapter 实例。
 */
export function selectAgentRoute(input: AgentRouteInput): AgentRouteDecision {
  const prompt = (input.userPrompt || '').trim();
  const intent = input.intent || '';
  const track = normalizeTrack(input.targetLanguage);

  if (
    intent === 'GENERATE_QUIZ' ||
    intent === 'GRADE' ||
    intent === 'REVIEW_MISTAKES' ||
    CONTENT_TOOL_HINT.test(prompt)
  ) {
    return { route: 'learning-loop', reason: 'content_or_quiz_intent' };
  }

  if (intent === 'DRILL_KANA' || intent === 'EXPLAIN') {
    // 短讲解/五十音演练优先 lite；长 EXPLAIN 仍可能被 CONTENT 规则盖住
    if (intent === 'DRILL_KANA' || prompt.length <= 64) {
      return {
        route: 'responses-lite',
        reason: intent === 'DRILL_KANA' ? 'drill_kana_intent' : 'short_explain_intent',
      };
    }
  }

  if (matchesLiteHint(prompt, track)) {
    return { route: 'responses-lite', reason: 'pronunciation_or_particle_lite' };
  }

  if (prompt.length > 0 && prompt.length <= 48 && SHORT_Q.test(prompt)) {
    return { route: 'responses-lite', reason: 'short_factual_question' };
  }

  return { route: 'learning-loop', reason: 'default_learning_coach' };
}

function normalizeTrack(raw?: string): 'ja' | 'en' | 'ko' {
  const v = (raw || '').toLowerCase();
  if (v === 'en' || v === 'eng') return 'en';
  if (v === 'ko' || v === 'kr') return 'ko';
  return 'ja';
}

function matchesLiteHint(prompt: string, track: 'ja' | 'en' | 'ko'): boolean {
  if (track === 'en') return LITE_HINT_EN.test(prompt);
  if (track === 'ko') return LITE_HINT_KO.test(prompt) || LITE_HINT_JA.test(prompt);
  // ja：避免单独「に」字误伤长文；依赖更具体的 lite 模式
  if (LITE_HINT_JA.test(prompt)) return true;
  // 短句里明确问单个助词
  if (prompt.length <= 24 && /[にでをがは]/.test(prompt) && /助词|区别|用法|怎么用/.test(prompt)) {
    return true;
  }
  return false;
}
