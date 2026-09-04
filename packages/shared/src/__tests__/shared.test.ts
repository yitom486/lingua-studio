import { describe, expect, it } from 'bun:test';
import { generateId, nowIso, addDays, BusinessError } from '../index.js';

describe('Shared Package Utilities', () => {
  it('should generate unique ids with prefixes', () => {
    const id1 = generateId('card');
    const id2 = generateId('card');
    expect(id1.startsWith('card_')).toBe(true);
    expect(id2.startsWith('card_')).toBe(true);
    expect(id1).not.toBe(id2);
  });

  it('should calculate dates correctly', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const future = addDays(now, 5);
    expect(future.toISOString()).toBe('2026-01-06T00:00:00.000Z');
  });

  it('should format valid ISO strings', () => {
    const iso = nowIso();
    expect(typeof iso).toBe('string');
    expect(iso.length).toBeGreaterThan(10);
  });

  it('should create typed business errors', () => {
    const err = new BusinessError('E_TEST', '测试友好错误描述', 'VALIDATION', true, { foo: 'bar' });
    expect(err.code).toBe('E_TEST');
    expect(err.userMessage).toBe('测试友好错误描述');
    expect(err.category).toBe('VALIDATION');
    expect(err.retryable).toBe(true);
    expect(err.internalDetails).toEqual({ foo: 'bar' });
  });
});
