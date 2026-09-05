import { describe, expect, it } from 'bun:test';
import { extractReadablePlainText } from '../modules/curriculum/infrastructure/news-article-fetch.js';
import { formatNewsBody } from '../modules/curriculum/application/news-reading.js';

describe('extractReadablePlainText', () => {
  it('prefers article paragraphs over chrome', () => {
    const html = `<!doctype html><html><body>
<nav>Home Menu Subscribe</nav>
<article>
  <h1>Title</h1>
  <p>Ed Miliband says Britain's position remains unwavering on the Falkland Islands dispute with Argentina.</p>
  <p>The foreign secretary told parliament that sovereignty would not be negotiated under pressure from Buenos Aires.</p>
  <p>Officials also pointed to historical claims and the islanders' right to self-determination under international law.</p>
</article>
<footer>Cookie policy newsletter sign in</footer>
</body></html>`;
    const out = extractReadablePlainText(html);
    expect(out.fromFullText).toBe(true);
    expect(out.strategy).toBe('article-paragraphs');
    expect(out.text).toContain('Ed Miliband');
    expect(out.text).toContain('self-determination');
    expect(out.text).not.toMatch(/<\/?p>/i);
    expect(out.text.toLowerCase()).not.toContain('cookie policy');
  });

  it('returns fromFullText false when content is too short', () => {
    const html = `<html><body><p>Hi</p></body></html>`;
    const out = extractReadablePlainText(html);
    expect(out.fromFullText).toBe(false);
  });
});

describe('formatNewsBody with fullText', () => {
  it('uses fullText when substantially longer than RSS summary', () => {
    const summary = 'Short RSS blurb only.';
    const full = Array.from({ length: 8 }, (_, i) =>
      `Paragraph ${i + 1} expands the story with enough detail for learners to practice skimming authentic English news prose carefully.`
    ).join('\n\n');
    const body = formatNewsBody(
      {
        title: 'T',
        link: 'https://example.com/a',
        description: summary,
      },
      'EN',
      { fullText: full }
    );
    expect(body).toContain('Paragraph 1 expands');
    expect(body).not.toContain('Short RSS blurb only.');
  });
});
