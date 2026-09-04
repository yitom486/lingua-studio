/**
 * Agent 引擎选型（旁路骨架）
 * - learning-loop：学习闭环主通路（工具出题/讲解/通用导师）
 * - responses-lite：低复杂度快问快答（发音/助词提示等 stub）
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
  /例句|造句|讲透|辨析|区分|考点|出题|考我|练一练|为什么/;

const LITE_HINT =
  /读音|怎么读|発音|发音|声调|pitch|假名|五十音|助词|に\b|で\b|を\b|が\b/;

const SHORT_Q = /[?？]|吗|呢|怎么|什么|为何|哪个/;

/**
 * 纯函数选型：可单测、可日志；不持有 adapter 实例。
 */
export function selectAgentRoute(input: AgentRouteInput): AgentRouteDecision {
  const prompt = (input.userPrompt || '').trim();
  const intent = input.intent || '';

  if (
    intent === 'GENERATE_QUIZ' ||
    intent === 'GRADE' ||
    intent === 'REVIEW_MISTAKES' ||
    CONTENT_TOOL_HINT.test(prompt)
  ) {
    return { route: 'learning-loop', reason: 'content_or_quiz_intent' };
  }

  if (intent === 'DRILL_KANA' || LITE_HINT.test(prompt)) {
    return { route: 'responses-lite', reason: 'pronunciation_or_particle_lite' };
  }

  if (prompt.length > 0 && prompt.length <= 48 && SHORT_Q.test(prompt)) {
    return { route: 'responses-lite', reason: 'short_factual_question' };
  }

  return { route: 'learning-loop', reason: 'default_learning_coach' };
}
