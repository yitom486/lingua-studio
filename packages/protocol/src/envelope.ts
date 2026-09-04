import { z } from 'zod';
import { WsEventTypes, type WsEventType } from './events.js';

export const WsErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type WsErrorPayload = z.infer<typeof WsErrorPayloadSchema>;

const allEventTypes = Object.values(WsEventTypes) as [WsEventType, ...WsEventType[]];

export const WsEnvelopeSchema = z.object({
  version: z.literal('1.0'),
  id: z.string(),
  sessionId: z.string(),
  turnId: z.string().optional(),
  type: z.enum(allEventTypes),
  payload: z.unknown(),
  timestamp: z.number(),
  error: WsErrorPayloadSchema.optional(),
});

export type WsEnvelope<T = unknown> = Omit<z.infer<typeof WsEnvelopeSchema>, 'payload'> & {
  payload: T;
};
