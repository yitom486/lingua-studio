import { describe, expect, test } from 'bun:test';
import { extractFollowUps } from '../followups.js';

describe('extractFollowUps', () => {
  test('抽 AI 回复里的真问题', () => {
    const reply =
      '「か」像"力"旁带一点。\n你分得清「か」和「き」吗？\n要不要我考你一道题？\n跟读时注意不要拖长音。';
    expect(extractFollowUps(reply)).toEqual(['你分得清「か」和「き」吗？', '要不要我考你一道题？']);
  });

  test('剥 markdown 噪声', () => {
    const reply = '## 讲解\n```\ncode?\n```\n[链接](https://x.com)里讲了吗？\n- **加粗**有用吗？';
    const out = extractFollowUps(reply);
    expect(out).not.toContainEqual(expect.stringContaining('```'));
    expect(out).not.toContainEqual(expect.stringContaining('https://'));
    expect(out).toContain('链接里讲了吗？');
  });

  test('过长过短与重复被滤掉', () => {
    const long = `${'啊'.repeat(40)}吗？`;
    expect(extractFollowUps(`${long}\n好吗？\n好吗？\nok？`)).toEqual(['好吗？', 'ok？']);
  });

  test('无问题返回空数组（调用方回退默认）', () => {
    expect(extractFollowUps('陈述句讲解。没有提问。')).toEqual([]);
    expect(extractFollowUps('')).toEqual([]);
  });
});
