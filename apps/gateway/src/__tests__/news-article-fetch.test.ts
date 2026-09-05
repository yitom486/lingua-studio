import { describe, expect, it } from 'bun:test';
import {
  extractReadablePlainText,
  extractWithReadability,
} from '../modules/curriculum/infrastructure/news-article-fetch.js';
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
    // Readability 一级抽取优先（样板去除更干净）；启发式仅作二级兜底
    expect(out.strategy).toBe('readability');
    expect(out.text).toContain('Ed Miliband');
    expect(out.text).toContain('self-determination');
    expect(out.text).not.toMatch(/<\/?p>/i);
    expect(out.text.toLowerCase()).not.toContain('cookie policy');
  });

  it('falls back to heuristic when readability finds nothing', () => {
    // 无正文容器、无段落：两级皆失败 → rss-only
    const out = extractReadablePlainText('<html><body><p>Hi</p></body></html>');
    expect(out.fromFullText).toBe(false);
    expect(out.strategy).toBe('rss-only');
  });

  it('returns fromFullText false when content is too short', () => {
    const html = `<html><body><p>Hi</p></body></html>`;
    const out = extractReadablePlainText(html);
    expect(out.fromFullText).toBe(false);
  });

  it('extractWithReadability wins on div-soup pages without semantic tags', () => {
    const para = (n: number) =>
      `<div class="x${n}"><div>Substantial paragraph ${n} about the technology policy and its impact on learners across the region today.</div></div>`;
    const html = `<!doctype html><html><head><title>Tech</title></head><body>
<nav>Home Menu Subscribe Login Advertisement Cookie policy newsletter</nav>
<div id="main-content">${para(1)}${para(2)}${para(3)}${para(4)}</div>
<footer>Cookie policy newsletter sign in advertisement</footer>
</body></html>`;
    const direct = extractWithReadability(html);
    expect(direct).not.toBeNull();
    expect(direct?.strategy).toBe('readability');
    expect(direct?.fromFullText).toBe(true);
    expect(direct?.text).toContain('Substantial paragraph 1');
    expect(direct?.text.toLowerCase()).not.toContain('cookie policy');

    const out = extractReadablePlainText(html);
    expect(out.fromFullText).toBe(true);
    expect(out.strategy).toBe('readability');
  });

  it('extractWithReadability returns null when nothing substantial', () => {
    expect(extractWithReadability('<html><body><p>Hi</p></body></html>')).toBeNull();
    expect(extractWithReadability('')).toBeNull();
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
