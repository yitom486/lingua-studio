import { describe, it, expect } from 'bun:test';
import { pickClassifyEffort } from './classify-effort.js';

describe('pickClassifyEffort（分类任务选低思考档）', () => {
  it('支持列表里取最低档', () => {
    expect(pickClassifyEffort(['high', 'low', 'medium'], 'medium')).toBe('low');
    expect(pickClassifyEffort(['minimal', 'low'], undefined)).toBe('minimal');
  });

  it('列表未知时沿用模型缺省，不硬塞', () => {
    expect(pickClassifyEffort(undefined, 'medium')).toBe('medium');
    expect(pickClassifyEffort([], undefined)).toBeUndefined();
  });
});
