import { describe, expect, it } from 'bun:test';
import { formatNewsBody } from '../services/news-reading.js';

describe('formatNewsBody', () => {
  it('keeps summary + date + tip but does not embed raw source URL', () => {
    const body = formatNewsBody(
      {
        title: 'Sample',
        link: 'https://www.theguardian.com/world/example',
        description: '<p>Lead sentence about the story.</p>',
        pubDate: 'Sat, 05 Sep 2026 00:00:00 GMT',
      },
      'EN'
    );
    expect(body).toContain('Lead sentence');
    expect(body).toContain('Published:');
    expect(body).toContain('Study tip:');
    expect(body).not.toContain('https://www.theguardian.com');
    expect(body).not.toMatch(/Source link/i);
  });

  it('uses Japanese tip without duplicating 原文リンク', () => {
    const body = formatNewsBody(
      {
        title: '見出し',
        link: 'https://news.example.jp/a',
        description: '第一文です。',
        pubDate: 'Fri, 04 Sep 2026 12:00:00 +0900',
      },
      'JA'
    );
    expect(body).toContain('第一文');
    expect(body).toContain('公開：');
    expect(body).toContain('学習ヒント');
    expect(body).not.toContain('原文リンク');
    expect(body).not.toContain('https://news.example.jp');
  });

  it('uses Korean tip and 게시 date line', () => {
    const body = formatNewsBody(
      {
        title: '제목',
        link: 'https://www.yna.co.kr/view/example',
        description: '첫 문장입니다.',
        pubDate: 'Sat, 05 Sep 2026 00:00:00 +0900',
      },
      'KO'
    );
    expect(body).toContain('첫 문장');
    expect(body).toContain('게시：');
    expect(body).toContain('학습 팁');
    expect(body).not.toContain('https://www.yna.co.kr');
  });
});
