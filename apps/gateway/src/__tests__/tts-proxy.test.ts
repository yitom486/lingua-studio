import { describe, expect, it } from 'bun:test';
import { isOk } from '@study-studio/shared';
import {
  listProxyVoices,
  synthesizeViaProxy,
  validateProxyCredentials,
  type FetchImpl,
} from '../modules/tts/application/tts-proxy.js';

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>
): FetchImpl {
  return (async (url: unknown, init?: unknown) =>
    handler(String(url), init as RequestInit | undefined)) as FetchImpl;
}

const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04]);

function okAudio(contentType = 'audio/mpeg'): Response {
  return new Response(audioBytes, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

describe('tts proxy (openai-compatible)', () => {
  it('synthesizes audio and reports voice/bytes', async () => {
    let seenUrl = '';
    let seenBody = '';
    const fetchImpl = stubFetch(async (url, init) => {
      seenUrl = url;
      seenBody = String(init?.body ?? '');
      return okAudio();
    });
    const res = await synthesizeViaProxy(
      {
        provider: 'openai-compatible',
        text: 'こんにちは',
        trackLanguage: 'ja',
        baseUrl: 'https://api.openai.com/v1/audio/speech',
        apiKey: 'sk-test',
        rate: 0.75,
      },
      fetchImpl
    );
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(seenUrl).toBe('https://api.openai.com/v1/audio/speech');
    expect(seenBody).toContain('こんにちは');
    expect(seenBody).toContain('0.75');
    expect(res.value.bytes).toBe(audioBytes.length);
    expect(res.value.contentType).toBe('audio/mpeg');
    expect(res.value.voice).toBe('alloy');
  });

  it('maps 401 to a friendly auth error without leaking the key', async () => {
    const fetchImpl = stubFetch(async () => new Response('bad key', { status: 401 }));
    const res = await synthesizeViaProxy(
      {
        provider: 'openai-compatible',
        text: 'hi',
        baseUrl: 'https://api.openai.com/v1/audio/speech',
        apiKey: 'sk-wrong',
      },
      fetchImpl
    );
    expect(isOk(res)).toBe(false);
    if (isOk(res)) return;
    expect(res.error.code).toBe('E_TTS_AUTH');
    expect(JSON.stringify(res.error)).not.toContain('sk-wrong');
  });

  it('rejects non-http endpoints without calling fetch', async () => {
    let called = false;
    const fetchImpl = stubFetch(async () => {
      called = true;
      return okAudio();
    });
    const res = await synthesizeViaProxy(
      { provider: 'openai-compatible', text: 'hi', baseUrl: 'file:///etc/passwd' },
      fetchImpl
    );
    expect(isOk(res)).toBe(false);
    expect(called).toBe(false);
    if (isOk(res)) return;
    expect(res.error.code).toBe('E_INVALID_INPUT');
  });

  it('requires a key for public endpoints but not for localhost', async () => {
    const fetchImpl = stubFetch(async () => okAudio());
    const missing = await synthesizeViaProxy(
      {
        provider: 'openai-compatible',
        text: 'hi',
        baseUrl: 'https://example.com/v1/audio/speech',
      },
      fetchImpl
    );
    expect(isOk(missing)).toBe(false);

    const local = await synthesizeViaProxy(
      {
        provider: 'openai-compatible',
        text: 'hi',
        baseUrl: 'http://127.0.0.1:8880/v1/audio/speech',
      },
      fetchImpl
    );
    expect(isOk(local)).toBe(true);
  });

  it('rejects overlong text before any network call', async () => {
    let called = false;
    const fetchImpl = stubFetch(async () => {
      called = true;
      return okAudio();
    });
    const res = await synthesizeViaProxy(
      {
        provider: 'openai-compatible',
        text: 'あ'.repeat(1001),
        baseUrl: 'http://127.0.0.1:8880/v1/audio/speech',
      },
      fetchImpl
    );
    expect(isOk(res)).toBe(false);
    expect(called).toBe(false);
  });
});

describe('tts proxy (azure-speech)', () => {
  it('posts SSML to the regional endpoint with subscription key', async () => {
    let seenUrl = '';
    let seenHeaders: Record<string, string> = {};
    let seenBody = '';
    const fetchImpl = stubFetch(async (url, init) => {
      seenUrl = url;
      seenHeaders = (init?.headers ?? {}) as Record<string, string>;
      seenBody = String(init?.body ?? '');
      return okAudio();
    });
    const res = await synthesizeViaProxy(
      {
        provider: 'azure-speech',
        text: '안녕 & <하세요>',
        trackLanguage: 'ko',
        region: 'koreacentral',
        apiKey: 'azure-key',
        rate: 0.75,
      },
      fetchImpl
    );
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(seenUrl).toBe('https://koreacentral.tts.speech.microsoft.com/cognitiveservices/v1');
    expect(seenHeaders['Ocp-Apim-Subscription-Key']).toBe('azure-key');
    expect(seenBody).toContain('ko-KR-SunHiNeural');
    expect(seenBody).toContain('rate="-25%"');
    expect(seenBody).toContain('안녕 &amp; &lt;하세요&gt;');
    expect(res.value.voice).toBe('ko-KR-SunHiNeural');
  });

  it('requires region and key', async () => {
    const fetchImpl = stubFetch(async () => okAudio());
    const noRegion = await synthesizeViaProxy(
      { provider: 'azure-speech', text: 'hi', apiKey: 'k' },
      fetchImpl
    );
    expect(isOk(noRegion)).toBe(false);
    const noKey = await synthesizeViaProxy(
      { provider: 'azure-speech', text: 'hi', region: 'japaneast' },
      fetchImpl
    );
    expect(isOk(noKey)).toBe(false);
  });

  it('routes male auto voice to Keita (top gender reaches the cloud)', async () => {
    let seenBody = '';
    const fetchImpl = stubFetch(async (_url, init) => {
      seenBody = String(init?.body ?? '');
      return okAudio();
    });
    const res = await synthesizeViaProxy(
      {
        provider: 'azure-speech',
        text: 'おはよう',
        trackLanguage: 'ja',
        region: 'japaneast',
        apiKey: 'azure-key',
        gender: 'MALE',
      },
      fetchImpl
    );
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(seenBody).toContain('ja-JP-KeitaNeural');
    expect(res.value.voice).toBe('ja-JP-KeitaNeural');
  });

  it('maps Azure empty-body 400 to invalid input (live behavior for bad SSML)', async () => {
    // 2026-09-06 japaneast 实测：坏 SSML 回 400 且 body 为空
    const fetchImpl = stubFetch(async () => new Response('', { status: 400 }));
    const res = await synthesizeViaProxy(
      {
        provider: 'azure-speech',
        text: 'hi',
        region: 'japaneast',
        apiKey: 'azure-key',
      },
      fetchImpl
    );
    expect(isOk(res)).toBe(false);
    if (isOk(res)) return;
    expect(res.error.code).toBe('E_INVALID_INPUT');
  });
});

describe('tts proxy validate', () => {
  it('probes the full chain and returns metadata only', async () => {
    const fetchImpl = stubFetch(async () => okAudio());
    const res = await validateProxyCredentials(
      {
        provider: 'openai-compatible',
        text: '',
        baseUrl: 'http://127.0.0.1:8880/v1/audio/speech',
      },
      fetchImpl
    );
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.ok).toBe(true);
    expect(res.value.bytes).toBe(audioBytes.length);
    expect(res.value.provider).toBe('openai-compatible');
  });

  it('sends the per-track probe text for azure validation', async () => {
    let seenBody = '';
    const fetchImpl = stubFetch(async (_url, init) => {
      seenBody = String(init?.body ?? '');
      return okAudio();
    });
    const res = await validateProxyCredentials(
      { provider: 'azure-speech', text: '', trackLanguage: 'ja', region: 'japaneast', apiKey: 'k' },
      fetchImpl
    );
    expect(isOk(res)).toBe(true);
    // 日语探针即线上验证通过的那句
    expect(seenBody).toContain('こんにちは');
    expect(seenBody).toContain('ja-JP-NanamiNeural');
  });

  it('rejects unknown providers', async () => {
    const fetchImpl = stubFetch(async () => okAudio());
    const res = await validateProxyCredentials(
      { provider: 'volcano-direct', text: '' },
      fetchImpl
    );
    expect(isOk(res)).toBe(false);
    if (isOk(res)) return;
    expect(res.error.code).toBe('E_INVALID_INPUT');
  });
});

describe('tts proxy voices', () => {
  const voiceListPayload = [
    {
      Name: 'Microsoft Server Speech Text to Speech Voice (ja-JP, NanamiNeural)',
      ShortName: 'ja-JP-NanamiNeural',
      Gender: 'Female',
      Locale: 'ja-JP',
      VoiceType: 'Neural',
      StyleList: ['chat', 'cheerful'],
    },
    {
      ShortName: 'ja-JP-KeitaNeural',
      Gender: 'Male',
      Locale: 'ja-JP',
      VoiceType: 'Neural',
    },
  ];

  it('lists azure voices filtered by track', async () => {
    let seenUrl = '';
    const fetchImpl = stubFetch(async (url) => {
      seenUrl = url;
      return new Response(JSON.stringify(voiceListPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const res = await listProxyVoices(
      { provider: 'azure-speech', region: 'japaneast', apiKey: 'k', trackLanguage: 'ja' },
      fetchImpl
    );
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(seenUrl).toBe(
      'https://japaneast.tts.speech.microsoft.com/cognitiveservices/voices/list'
    );
    expect(res.value.provider).toBe('azure-speech');
    expect(res.value.voices.map((v) => v.id)).toEqual([
      'ja-JP-KeitaNeural',
      'ja-JP-NanamiNeural',
    ]);
    expect(res.value.voices[1]?.styles).toEqual(['chat', 'cheerful']);
  });

  it('rejects non-azure providers and missing credentials without fetch', async () => {
    let called = false;
    const fetchImpl = stubFetch(async () => {
      called = true;
      return okAudio();
    });
    const nonAzure = await listProxyVoices({ provider: 'openai-compatible' }, fetchImpl);
    expect(isOk(nonAzure)).toBe(false);
    const noKey = await listProxyVoices(
      { provider: 'azure-speech', region: 'japaneast' },
      fetchImpl
    );
    expect(isOk(noKey)).toBe(false);
    expect(called).toBe(false);
  });
});
