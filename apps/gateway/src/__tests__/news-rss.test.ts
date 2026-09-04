import { describe, expect, it } from 'bun:test';
import { parseRssItems, resolveNewsFeed, pickLeadSentence } from '../services/news-rss.js';
import { generateNewsPassage } from '../services/generate-news-passage.js';
import { DEFAULT_CONTENT_LANGUAGE } from '../services/learning-language-policy.js';

describe('news RSS integration', () => {
  it('defaults product language policy to English', () => {
    expect(DEFAULT_CONTENT_LANGUAGE).toBe('EN');
  });

  it('maps EN topics across BBC / Guardian / NPR', () => {
    expect(resolveNewsFeed('technology', 'EN').publisher).toBe('BBC News');
    expect(resolveNewsFeed('technology', 'EN').url).toContain('technology');

    const world = resolveNewsFeed('world', 'EN');
    expect(world.publisher).toBe('The Guardian');
    expect(world.url).toContain('theguardian.com');

    const culture = resolveNewsFeed('culture', 'EN');
    expect(culture.publisher).toBe('NPR');
    expect(culture.url).toContain('npr.org');
  });

  it('maps JA topics to NHK ONE and keeps KO on interim EN feeds', () => {
    const ja = resolveNewsFeed('world', 'JA');
    expect(ja.publisher).toBe('NHK ONE');
    expect(ja.url).toContain('cat6.xml');

    const ko = resolveNewsFeed('world', 'KO');
    expect(ko.language).toBe('KO');
    expect(ko.publisher).toContain('interim EN');
  });

  it('builds Korean interim AI prompt scaffold', async () => {
    const { buildKoreanAiReadingPrompt } = await import(
      '../services/learning-language-policy.js'
    );
    const p = buildKoreanAiReadingPrompt({ topic: '시사', difficulty: 2 });
    expect(p.sourceLabel).toContain('Korean track');
    expect(p.body).toContain('TOPIK');
  });

  it('parses NHK-like RSS XML items', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
  <title><![CDATA[テスト見出し]]></title>
  <link>https://example.com/a</link>
  <description><![CDATA[第一文です。第二文です。]]></description>
  <pubDate>Fri, 04 Sep 2026 12:00:00 +0900</pubDate>
</item>
</channel></rss>`;
    const items = parseRssItems(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe('テスト見出し');
    expect(items[0]!.description).toContain('第一文');
    expect(pickLeadSentence(items[0]!.description)).toBe('第一文です');
  });

  it(
    'fetches a live English media feed when network allows',
    async () => {
      const news = await generateNewsPassage({
        setId: 'read_news_live_en',
        topic: 'technology',
        language: 'EN',
      });
      expect(news.title.length).toBeGreaterThan(0);
      expect(news.questions.length).toBe(3);
      if (news.fromRss) {
        expect(news.publisher).toBe('BBC News');
        expect(news.sourceUrl).toBeTruthy();
        expect(news.sourceLabel).toContain('RSS');
      } else {
        expect(news.sourceLabel).toContain('template');
      }
    },
    { timeout: 20_000 }
  );

  it(
    'fetches a live NHK feed when network allows',
    async () => {
      const news = await generateNewsPassage({
        setId: 'read_news_live_ja',
        topic: 'world',
        language: 'JA',
      });
      expect(news.title.length).toBeGreaterThan(0);
      expect(news.questions.length).toBe(3);
      if (news.fromRss) {
        expect(news.publisher).toBe('NHK ONE');
        expect(news.sourceUrl).toBeTruthy();
        expect(news.sourceLabel).toContain('RSS');
      } else {
        expect(news.sourceLabel).toContain('模板');
      }
    },
    { timeout: 20_000 }
  );
});
