import { describe, it, expect } from 'bun:test';
import { humanizeCollectionTitle } from './collection-titles.js';

describe('humanizeCollectionTitle（集合名去技术味）', () => {
  it('网关自动标题只留意图中文 + 日期', () => {
    expect(humanizeCollectionTitle('练习 ? generate_writing_prompt ? 2026-09-07')).toBe(
      '写作题干 · 09-07'
    );
    expect(humanizeCollectionTitle('练习运行 abc123 · QUIZ')).toBe('练习运行 abc123 · QUIZ');
  });

  it('用户/教材起的有意义标题原样保留', () => {
    expect(humanizeCollectionTitle('《标日初上》第 3 課专属测评')).toBe('《标日初上》第 3 課专属测评');
    expect(humanizeCollectionTitle('我的错题回炉')).toBe('我的错题回炉');
  });
});
