import { describe, expect, it } from 'bun:test';
import { ResponsesAdapter } from '../index.js';

describe('ResponsesAdapter stub', () => {
  it('creates a session and yields a lightweight completed reply', async () => {
    const adapter = new ResponsesAdapter();
    const sessionRes = await adapter.createSession({
      sessionId: 's_resp_1',
      userId: 'u1',
    });
    expect(sessionRes.ok).toBe(true);
    if (!sessionRes.ok) return;

    const events = [];
    for await (const ev of sessionRes.value.send({ message: '「で」和「に」怎么区分？' })) {
      events.push(ev);
    }
    expect(events.some((e) => e.type === 'TEXT_DELTA')).toBe(true);
    expect(events.some((e) => e.type === 'COMPLETED')).toBe(true);
  });
});
