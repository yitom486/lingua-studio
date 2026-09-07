import { describe, expect, it } from 'bun:test';
import {
  normalizeSelectionText,
  normalizeLookupLanguage,
  MAX_LOOKUP_SELECTION,
} from '../selection-text.js';
import {
  subscribeLookupPopup,
  openLookupPopup,
  closeLookupPopup,
  type LookupPopupRequest,
} from '../lookup-popup-bus.js';

describe('normalizeSelectionText', () => {
  it('压空白截断；空返回 null', () => {
    expect(normalizeSelectionText(null)).toBeNull();
    expect(normalizeSelectionText('   ')).toBeNull();
    expect(normalizeSelectionText('  食べる\n ご飯 ')).toBe('食べる ご飯');
    const long = normalizeSelectionText(`a${'b'.repeat(100)}`);
    expect(long?.length).toBeLessThanOrEqual(MAX_LOOKUP_SELECTION);
  });
});

describe('normalizeLookupLanguage', () => {
  it('ja/en/ko 大小写兼容；其他不猜', () => {
    expect(normalizeLookupLanguage('JA')).toBe('ja');
    expect(normalizeLookupLanguage('en')).toBe('en');
    expect(normalizeLookupLanguage(' Ko ')).toBe('ko');
    expect(normalizeLookupLanguage('fr')).toBeNull();
    expect(normalizeLookupLanguage(null)).toBeNull();
  });
});

describe('lookup-popup-bus', () => {
  it('发布订阅与关闭；异常订阅者不影响其他', () => {
    const seen: Array<LookupPopupRequest | null> = [];
    const bad = (r: LookupPopupRequest | null) => {
      seen.push(r);
      throw new Error('boom');
    };
    const good = (r: LookupPopupRequest | null) => {
      seen.push(r);
    };
    const offBad = subscribeLookupPopup(bad);
    const offGood = subscribeLookupPopup(good);
    openLookupPopup({ text: '食べる', language: 'ja', x: 10, y: 20 });
    // bad 推 bad、good 推原文：两者都收到且异常被隔离
    expect(seen.length).toBe(2);
    expect(seen.some((r) => r?.text === '食べる')).toBe(true);
    closeLookupPopup();
    expect(seen.filter((r) => r === null).length).toBe(2);
    offBad();
    offGood();
    openLookupPopup({ text: 'x', language: 'en', x: 0, y: 0 });
    expect(seen.some((r) => r?.text === 'x')).toBe(false);
  });
});
