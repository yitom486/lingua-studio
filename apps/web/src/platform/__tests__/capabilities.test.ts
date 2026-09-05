import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import {
  detectTauri,
  resolvePlatformCapabilities,
  __resetPlatformForTest,
} from '../capabilities.js';
import { WebPlatformCapabilities } from '../web-capabilities.js';

describe('platform capability detection', () => {
  afterEach(() => __resetPlatformForTest());

  it('detects non-Tauri environment by default', () => {
    // bun:test 默认无 __TAURI_INTERNALS__
    expect(detectTauri()).toBe(false);
  });

  it('detects Tauri when __TAURI_INTERNALS__ is injected', () => {
    const w = globalThis as { window?: unknown; __TAURI_INTERNALS__?: unknown };
    w.window = { __TAURI_INTERNALS__: {} };
    try {
      expect(detectTauri()).toBe(true);
    } finally {
      delete w.__TAURI_INTERNALS__;
      w.window = undefined;
    }
  });

  it('resolves to WebPlatformCapabilities outside Tauri', () => {
    const caps = resolvePlatformCapabilities();
    expect(caps.environment).toBe('web');
    expect(caps.isDesktop()).toBe(false);
  });
});

describe('WebPlatformCapabilities', () => {
  // bun:test 无完整 DOM，这里用 globalThis 注入最小桩并测后还原。
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
  const originalCreateObjectURL = (globalThis as { URL?: { createObjectURL?: unknown } }).URL;
  let clickSpy: { click: () => void };

  beforeEach(() => {
    clickSpy = { click: () => {} };
    (globalThis as { window?: unknown }).window = {
      open: () => null,
      location: { href: '' },
    };
    (globalThis as { document?: unknown }).document = {
      createElement: () => clickSpy,
    };
    (globalThis as { navigator?: unknown }).navigator = {
      clipboard: { writeText: async () => {} },
      userAgent: 'TestAgent/1.0',
    };
    // 保留 URL 上除 createObjectURL 外的现有实现
    const urlCtor = originalCreateObjectURL ?? (globalThis as { URL?: object }).URL;
    (globalThis as { URL?: object }).URL = Object.assign(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (urlCtor as any) ?? function () {},
      {
        createObjectURL: () => 'blob:test',
        revokeObjectURL: () => {},
      }
    );
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { document?: unknown }).document = originalDocument;
    (globalThis as { navigator?: unknown }).navigator = originalNavigator;
    (globalThis as { URL?: object }).URL = originalCreateObjectURL as object;
    __resetPlatformForTest();
  });

  it('reports web environment and user agent', () => {
    const caps = new WebPlatformCapabilities();
    expect(caps.environment).toBe('web');
    expect(caps.isDesktop()).toBe(false);
    expect(caps.getUserAgent()).toBe('TestAgent/1.0');
  });

  it('downloadFile creates an anchor and triggers a click', async () => {
    const caps = new WebPlatformCapabilities();
    let clicked = false;
    clickSpy.click = () => {
      clicked = true;
    };
    await caps.downloadFile({
      filename: 'hello.txt',
      content: 'hi',
      mimeType: 'text/plain',
    });
    expect(clicked).toBe(true);
  });

  it('openExternalUrl falls back to location when window.open blocked', async () => {
    const caps = new WebPlatformCapabilities();
    let navigated = '';
    (globalThis as { window: { open: () => null; location: { href: string } } }).window = {
      open: () => null,
      location: { set href(v: string) { navigated = v; }, get href() { return navigated; } },
    };
    await caps.openExternalUrl('https://example.com');
    expect(navigated).toBe('https://example.com');
  });

  it('clipboardWriteText delegates to navigator.clipboard', async () => {
    const caps = new WebPlatformCapabilities();
    let written = '';
    (globalThis as { navigator: { clipboard: { writeText: (t: string) => Promise<void> } } }).navigator = {
      clipboard: { writeText: async (t: string) => { written = t; } },
    };
    await caps.clipboardWriteText('copied');
    expect(written).toBe('copied');
  });

  it('getPlatform returns a stable singleton', async () => {
    const { getPlatform } = await import('../capabilities.js');
    const a = getPlatform();
    const b = getPlatform();
    expect(a).toBe(b);
    expect(a.environment).toBe('web');
  });
});
