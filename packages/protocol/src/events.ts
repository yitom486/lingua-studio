/**
 * WebSocket 双向通信标准事件类型枚举
 */
export const WsEventTypes = {
  // Client -> Gateway
  CLIENT_SESSION_INIT: 'client.session.init',
  CLIENT_TURN_SEND: 'client.turn.send',
  CLIENT_QUIZ_SUBMIT: 'client.quiz.submit',
  CLIENT_QUIZ_GENERATE: 'client.quiz.generate',
  CLIENT_QUIZ_GRADE_SUBJECTIVE: 'client.quiz.grade_subjective',
  CLIENT_CARD_REVIEW: 'client.card.review',
  CLIENT_TOOL_RESULT: 'client.tool.result',
  CLIENT_APPROVAL_RESPOND: 'client.approval.respond',
  CLIENT_TURN_INTERRUPT: 'client.turn.interrupt',
  CLIENT_TURN_STEER: 'client.turn.steer',
  /** 启动 thread 队列中的下一项并流式推送 */
  CLIENT_QUEUE_START: 'client.queue.start',
  CLIENT_PING: 'client.ping',
  CLIENT_PROFILE_GET: 'client.profile.get',
  CLIENT_PROFILE_UPDATE: 'client.profile.update',
  CLIENT_TASK_PROGRESS_GET: 'client.task_progress.get',
  CLIENT_TASK_ACTIVITY_RECORD: 'client.task_activity.record',

  // Gateway -> Client
  AGENT_TURN_START: 'agent.turn.start',
  AGENT_TEXT_DELTA: 'agent.text.delta',
  AGENT_REASONING_DELTA: 'agent.reasoning.delta',
  AGENT_TOOL_CALL: 'agent.tool.call',
  AGENT_APPROVAL_REQUEST: 'agent.approval.request',
  AGENT_APPROVAL_RESOLVED: 'agent.approval.resolved',
  AGENT_TURN_COMPLETED: 'agent.turn.completed',
  /** Codex thread/queue/changed 转发 */
  AGENT_QUEUE_CHANGED: 'agent.queue.changed',
  AGENT_ERROR: 'agent.error',
  LEARNER_PROFILE_UPDATED: 'learner.profile.updated',
  LEARNER_DAILY_TASK_UPDATED: 'learner.daily_task.updated',
  LEARNER_MISTAKE_ADDED: 'learner.mistake.added',
  GATEWAY_PONG: 'gateway.pong',
} as const;

export type WsEventType = typeof WsEventTypes[keyof typeof WsEventTypes];
