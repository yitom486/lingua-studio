import { z } from 'zod';
import { WsEventTypes, type WsEventType } from './events.js';

export const WsErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type WsErrorPayload = z.infer<typeof WsErrorPayloadSchema>;

export const WsEnvelopeSchema = z.object({
  version: z.literal('1.0'),
  id: z.string(),
  sessionId: z.string(),
  turnId: z.string().optional(),
  type: z.enum([
    WsEventTypes.CLIENT_SESSION_INIT,
    WsEventTypes.CLIENT_TURN_SEND,
    WsEventTypes.CLIENT_QUIZ_SUBMIT,
    WsEventTypes.CLIENT_CARD_REVIEW,
    WsEventTypes.CLIENT_TOOL_RESULT,
    WsEventTypes.CLIENT_APPROVAL_RESPOND,
    WsEventTypes.CLIENT_TURN_INTERRUPT,
    WsEventTypes.CLIENT_PING,
    WsEventTypes.AGENT_TURN_START,
    WsEventTypes.AGENT_TEXT_DELTA,
    WsEventTypes.AGENT_TOOL_CALL,
    WsEventTypes.AGENT_APPROVAL_REQUEST,
    WsEventTypes.AGENT_TURN_COMPLETED,
    WsEventTypes.AGENT_ERROR,
    WsEventTypes.LEARNER_PROFILE_UPDATED,
    WsEventTypes.LEARNER_MISTAKE_ADDED,
    WsEventTypes.GATEWAY_PONG,
  ]),
  payload: z.unknown(),
  timestamp: z.number(),
  error: WsErrorPayloadSchema.optional(),
});

export type WsEnvelope<T = unknown> = Omit<z.infer<typeof WsEnvelopeSchema>, 'payload'> & {
  payload: T;
};
