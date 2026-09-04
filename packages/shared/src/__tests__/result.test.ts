import { describe, expect, it } from 'bun:test';
import {
  ok,
  err,
  isOk,
  isErr,
  unwrapOr,
  mapResult,
  mapErr,
  BusinessError,
  translateToBusinessError,
} from '../index.js';

describe('Result<T, E> & Error Translation Chain', () => {
  it('should handle Ok path correctly', () => {
    const res = ok({ score: 100 });
    expect(isOk(res)).toBe(true);
    expect(isErr(res)).toBe(false);
    if (isOk(res)) {
      expect(res.value.score).toBe(100);
    }
  });

  it('should handle Err path correctly', () => {
    const error = new BusinessError('E_SAMPLE', 'Sample error message', 'VALIDATION');
    const res = err(error);
    expect(isOk(res)).toBe(false);
    expect(isErr(res)).toBe(true);
    if (isErr(res)) {
      expect(res.error.code).toBe('E_SAMPLE');
      expect(res.error.userMessage).toBe('Sample error message');
    }
  });

  it('should support unwrapOr and mapping', () => {
    const success = ok(10);
    const mapped = mapResult(success, (v) => v * 2);
    expect(unwrapOr(mapped, 0)).toBe(20);

    const failure = err('bad');
    const mappedErr = mapErr(failure, (msg) => `very ${msg}`);
    if (isErr(mappedErr)) {
      expect(mappedErr.error).toBe('very bad');
    }
  });

  it('should translate ECONNREFUSED to friendly user message', () => {
    const raw = new Error('connect ECONNREFUSED 127.0.0.1:8080');
    const bizErr = translateToBusinessError(raw, 'NET_TEST');

    expect(bizErr.code).toBe('E_NETWORK_DISCONNECTED');
    expect(bizErr.userMessage).toContain('无法连接到学习助手服务');
    expect(bizErr.retryable).toBe(true);
  });

  it('should translate timeout to friendly message', () => {
    const raw = new Error('Gateway timeout after 5000ms');
    const bizErr = translateToBusinessError(raw, 'AI_TURN');

    expect(bizErr.code).toBe('E_REQUEST_TIMEOUT');
    expect(bizErr.userMessage).toContain('响应超时');
  });

  it('should translate SQLite database errors to friendly user message', () => {
    const raw = new Error('SQLite error: database is locked (SQLITE_BUSY)');
    const bizErr = translateToBusinessError(raw, 'DB_OPS');

    expect(bizErr.code).toBe('E_DATABASE_ERROR');
    expect(bizErr.category).toBe('DATABASE');
    expect(bizErr.userMessage).toContain('本地学习数据库存储遇到临时冲突或锁定');
    expect(bizErr.retryable).toBe(true);
  });

  it('should translate SQLite unique constraint violations', () => {
    const raw = new Error('UNIQUE constraint failed: flashcards.id');
    const bizErr = translateToBusinessError(raw, 'DB_INSERT');

    expect(bizErr.code).toBe('E_DATABASE_CONSTRAINT');
    expect(bizErr.category).toBe('DATABASE');
    expect(bizErr.userMessage).toContain('无法重复写入');
    expect(bizErr.retryable).toBe(false);
  });

  it('should translate tool execution errors', () => {
    const raw = new Error('TOOL_EXECUTION: dictionary lookup failed');
    const bizErr = translateToBusinessError(raw, 'TOOL_ROUTER');

    expect(bizErr.code).toBe('E_TOOL_EXECUTION_FAILED');
    expect(bizErr.category).toBe('TOOL_EXECUTION');
    expect(bizErr.retryable).toBe(true);
  });

  it('should preserve existing BusinessError without re-wrapping', () => {
    const original = new BusinessError('E_CUSTOM', '自定义错误', 'SECURITY');
    const result = translateToBusinessError(original);

    expect(result).toBe(original);
  });
});
