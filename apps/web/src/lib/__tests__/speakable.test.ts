import { describe, expect, test } from 'bun:test';
import { toSpeakableText } from '../speakable.js';

describe('toSpeakableText', () => {
  test('只抽日语假名句，中文讲解不读', () => {
    const md = '这句话的意思是「去图书馆学习」。\n昨夜、友達と一緒に図書館で勉強しました。\n注意助词で表示场所。';
    expect(toSpeakableText(md, 'ja')).toBe(
      '昨夜、友達と一緒に図書館で勉強しました。'
    );
  });

  test('剥 markdown 噪声（代码围栏/链接/符号）', () => {
    const md = '## 例文\n```js\nconsole.log(1)\n```\n[原文](https://example.com)「[こんにちは](https://x)」\n- おはようございます！';
    const out = toSpeakableText(md, 'ja');
    expect(out).not.toContain('console.log');
    expect(out).not.toContain('https://');
    expect(out).not.toContain('```');
    expect(out).toContain('おはようございます');
  });

  test('韩语只抽谚文句', () => {
    const md = '助词……\n친구와 카페에서 한국어를 공부합니다.\n注意조사。';
    expect(toSpeakableText(md, 'ko')).toBe('친구와 카페에서 한국어를 공부합니다.');
  });

  test('英语只抽纯拉丁行，混中文行不抽', () => {
    const md = '虚拟语气考点：\nThe professor suggested that each student write an outline.\n注意 that each student write (should 省略)。';
    expect(toSpeakableText(md, 'en')).toBe(
      'The professor suggested that each student write an outline.'
    );
  });

  test('无目标语片段返回 null（调用方隐藏按钮）', () => {
    expect(toSpeakableText('纯中文讲解，没有假名。', 'ja')).toBeNull();
    expect(toSpeakableText('', 'ja')).toBeNull();
  });

  test('超长截断不抛', () => {
    const long = `${'あ'.repeat(1000)}です。`;
    const out = toSpeakableText(long, 'ja');
    expect(out).not.toBeNull();
    expect((out as string).length).toBeLessThanOrEqual(600);
  });
});
