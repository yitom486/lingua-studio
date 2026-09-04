/**
 * WebSocket 双向通信标准事件类型枚举
 */
export const WsEventTypes = {
  // Client -> Gateway
  CLIENT_SESSION_INIT: 'client.session.init',
  CLIENT_TURN_SEND: 'client.turn.send',
  CLIENT_QUIZ_SUBMIT: 'client.quiz.submit',
  CLIENT_CARD_REVIEW: 'client.card.review',
  CLIENT_TOOL_RESULT: 'client.tool.result',
  CLIENT_APPROVAL_RESPOND: 'client.approval.respond',
  CLIENT_TURN_INTERRUPT: 'client.turn.interrupt',
  CLIENT_PING: 'client.ping',

  // Gateway -> Client
  AGENT_TURN_START: 'agent.turn.start',
  AGENT_TEXT_DELTA: 'agent.text.delta',
  AGENT_TOOL_CALL: 'agent.tool.call',
  AGENT_APPROVAL_REQUEST: 'agent.approval.request',
  AGENT_TURN_COMPLETED: 'agent.turn.completed',
  AGENT_ERROR: 'agent.error',
  LEARNER_PROFILE_UPDATED: 'learner.profile.updated',
  LEARNER_MISTAKE_ADDED: 'learner.mistake.added',
  GATEWAY_PONG: 'gateway.pong',
} as const;

export type WsEventType = typeof WsEventTypes[keyof typeof WsEventTypes];
