import { describe, expect, test } from 'bun:test';
import { extractFollowUps, extractPredictedFollowUps } from '../followups.js';

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

  test('拓展追问返回的编号问句可直接变 chips', () => {
    const reply =
      '这 3 个问题值得深挖：\n1. 片假名カ和ひらがなか有什么关系？\n2. か行的其他假名怎么写？\n3. 濁点が和か怎么区分？';
    expect(extractFollowUps(reply)).toEqual([
      '片假名カ和ひらがなか有什么关系？',
      'か行的其他假名怎么写？',
      '濁点が和か怎么区分？',
    ]);
  });
});

describe('extractPredictedFollowUps', () => {
  test('末尾【追问】块被解析并从正文剥离', () => {
    const reply =
      '「か」像"力"旁带一点。\n\n【追问】\n1. 片假名カ和か有什么关系？\n2. か行的其他假名怎么写？\n3. が和か怎么区分？';
    const { chips, displayText } = extractPredictedFollowUps(reply);
    expect(chips).toEqual([
      '片假名カ和か有什么关系？',
      'か行的其他假名怎么写？',
      'が和か怎么区分？',
    ]);
    expect(displayText).toBe('「か」像"力"旁带一点。');
  });

  test('无标记/标记行不独立/块内无问句 → 原样返回', () => {
    expect(extractPredictedFollowUps('纯讲解。')).toEqual({ chips: [], displayText: '纯讲解。' });
    expect(
      extractPredictedFollowUps('提到【追问】这个词但不是块。')
    ).toEqual({ chips: [], displayText: '提到【追问】这个词但不是块。' });
    expect(extractPredictedFollowUps('正文\n【追问】\n今天天气不错')).toEqual({
      chips: [],
      displayText: '正文\n【追问】\n今天天气不错',
    });
  });
});
