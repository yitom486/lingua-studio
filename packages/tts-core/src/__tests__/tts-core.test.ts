import { describe, expect, it } from 'bun:test';
import {
  __resetTtsEnginesForTest,
  AZURE_DEFAULT_VOICES,
  azureTtsEndpoint,
  azureTtsHeaders,
  bcp47ForTrack,
  buildAzureSsml,
  buildOpenAiSpeechPayload,
  getActiveTtsEngine,
  isHttpEndpoint,
  listTtsEngines,
  normalizeTtsTrackLanguage,
  openAiSpeechHeaders,
  registerTtsEngine,
  resolveTtsSpeakRequest,
  scoreVoiceName,
  setActiveTtsEngine,
  StubTtsEngine,
  voiceNameHints,
  TTS_STYLE_PROMPTS,
} from '../index.js';

describe('tts track + request builder', () => {
  it('normalizes track variants and falls back to en', () => {
    expect(normalizeTtsTrackLanguage('ja')).toBe('ja');
    expect(normalizeTtsTrackLanguage('JP')).toBe('ja');
    expect(normalizeTtsTrackLanguage('kor')).toBe('ko');
    expect(normalizeTtsTrackLanguage('ENG')).toBe('en');
    expect(normalizeTtsTrackLanguage('xx')).toBe('en');
    expect(normalizeTtsTrackLanguage(undefined)).toBe('en');
    expect(bcp47ForTrack('ja')).toBe('ja-JP');
    expect(bcp47ForTrack('ko')).toBe('ko-KR');
    expect(bcp47ForTrack('en')).toBe('en-US');
  });

  it('resolves per-language prompt context with purpose-adjusted rate', () => {
    const ja = resolveTtsSpeakRequest({
      text: 'こんにちは',
      trackLanguage: 'ja',
      purpose: 'dictation',
      prefs: { gender: 'FEMALE', personaName: '七海' },
    });
    expect(ja.bcp47).toBe('ja-JP');
    expect(ja.rate).toBe(0.75);
    expect(ja.pitch).toBe(1.08);
    expect(ja.voiceMatchNames[0]).toBe('七海');
    expect(ja.voiceMatchNames).toContain('nanami');
    expect(ja.personaName).toBe('七海');
    expect(ja.neural.stylePrompt).toBe(TTS_STYLE_PROMPTS.ja);
    expect(ja.context).toEqual({ trackLanguage: 'ja', purpose: 'dictation', gender: 'FEMALE' });

    const ko = resolveTtsSpeakRequest({
      text: '안녕',
      trackLanguage: 'ko',
      prefs: { gender: 'MALE', rate: 2.5 },
    });
    expect(ko.rate).toBe(1.5);
    expect(ko.pitch).toBe(0.88);
    expect(ko.voiceMatchNames).toContain('injoon');

    const en = resolveTtsSpeakRequest({ text: 'hi', trackLanguage: 'en' });
    expect(en.context.gender).toBe('FEMALE');
    expect(en.rate).toBe(0.9);
  });

  it('honours explicit prefs and neural overrides', () => {
    const req = resolveTtsSpeakRequest({
      text: 'hi',
      trackLanguage: 'en',
      prefs: { gender: 'MALE', rate: 1.1, pitch: 0.9, preferredVoiceURI: 'uri-1', personaName: 'Guy' },
      neural: { voiceId: 'v-1', stylePrompt: 'custom' },
    });
    expect(req.rate).toBe(1.1);
    expect(req.pitch).toBe(0.9);
    expect(req.preferredVoiceURI).toBe('uri-1');
    expect(req.neural.voiceId).toBe('v-1');
    expect(req.neural.stylePrompt).toBe('custom');
  });
});

describe('voice matching', () => {
  it('ranks persona voices first per language and gender', () => {
    const jaFemale = [
      { name: 'Google US English', lang: 'en-US', localService: false },
      { name: 'Microsoft Nanami - Japanese', lang: 'ja-JP', localService: true },
    ];
    expect(voiceNameHints('ja', 'FEMALE')).toContain('nanami');
    const scored = jaFemale
      .map((v) => ({ v, s: scoreVoiceName(v, 'ja', 'FEMALE') }))
      .sort((a, b) => b.s - a.s);
    expect(scored[0]?.v.name).toContain('Nanami');
  });

  it('penalizes cloud default female names for male requests', () => {
    const jenny = scoreVoiceName({ name: 'Microsoft Jenny', localService: false }, 'en', 'MALE');
    const david = scoreVoiceName({ name: 'Microsoft David', localService: true }, 'en', 'MALE');
    expect(david).toBeGreaterThan(jenny);
  });
});

describe('engine registry + stub', () => {
  it('registers engines, selects active, rejects unknown', () => {
    __resetTtsEnginesForTest();
    try {
      const stub = new StubTtsEngine();
      registerTtsEngine(stub);
      expect(getActiveTtsEngine()?.id).toBe('stub');
      expect(listTtsEngines().map((e) => e.id)).toEqual(['stub']);
      expect(setActiveTtsEngine('missing')).toBe(false);
      expect(setActiveTtsEngine('stub')).toBe(true);
    } finally {
      __resetTtsEnginesForTest();
    }
  });

  it('stub records calls and resolves without speaking', async () => {
    __resetTtsEnginesForTest();
    try {
      const stub = new StubTtsEngine();
      registerTtsEngine(stub);
      const req = resolveTtsSpeakRequest({ text: 'hi', trackLanguage: 'en' });
      const res = await stub.speak(req);
      expect(stub.calls.length).toBe(1);
      expect(stub.calls[0]?.utteranceText).toBe('hi');
      if (res.ok) {
        await res.value.finished;
        res.value.stop();
        expect(stub.stoppedCount).toBe(1);
      } else {
        throw new Error('stub speak should not fail');
      }
    } finally {
      __resetTtsEnginesForTest();
    }
  });
});

describe('openai-compatible plugin endpoint', () => {
  it('builds speech payload with gender-default voice and bcp47', () => {
    const p = buildOpenAiSpeechPayload('あ', { bcp47: 'ja-JP', gender: 'FEMALE' });
    expect(p.input).toBe('あ');
    expect(p.model).toBe('tts-1');
    expect(p.voice).toBe('alloy');
    expect(p.language).toBe('ja-JP');
    const male = buildOpenAiSpeechPayload('あ', { gender: 'MALE', voice: 'onyx' });
    expect(male.voice).toBe('onyx');
    expect(male.language).toBeUndefined();
  });

  it('clamps speed into the OpenAI range', () => {
    expect(buildOpenAiSpeechPayload('hi', { speed: 99 }).speed).toBe(4);
    expect(buildOpenAiSpeechPayload('hi', { speed: -1 }).speed).toBe(0.25);
    expect(buildOpenAiSpeechPayload('hi').speed).toBeUndefined();
  });

  it('sends Authorization only when a key is set', () => {
    expect(openAiSpeechHeaders(' sk-123 ').Authorization).toBe('Bearer sk-123');
    expect(openAiSpeechHeaders('')).toEqual({ 'Content-Type': 'application/json' });
    expect(openAiSpeechHeaders()).toEqual({ 'Content-Type': 'application/json' });
  });

  it('only allows http/https endpoints', () => {
    expect(isHttpEndpoint('http://127.0.0.1:8880/v1/audio/speech')).toBe(true);
    expect(isHttpEndpoint('https://api.openai.com/v1/audio/speech')).toBe(true);
    expect(isHttpEndpoint('file:///etc/passwd')).toBe(false);
    expect(isHttpEndpoint('javascript:alert(1)')).toBe(false);
    expect(isHttpEndpoint('')).toBe(false);
  });
});

describe('azure speech helpers', () => {
  it('exposes per-track default neural voices', () => {
    expect(AZURE_DEFAULT_VOICES.ja).toBe('ja-JP-NanamiNeural');
    expect(AZURE_DEFAULT_VOICES.ko).toBe('ko-KR-SunHiNeural');
    expect(AZURE_DEFAULT_VOICES.en).toBe('en-US-JennyNeural');
  });

  it('builds the regional REST endpoint', () => {
    expect(azureTtsEndpoint('japaneast')).toBe(
      'https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1'
    );
    expect(azureTtsHeaders(' key123 ')['Ocp-Apim-Subscription-Key']).toBe('key123');
    expect(azureTtsHeaders('key123')['Content-Type']).toBe('application/ssml+xml');
  });

  it('builds SSML with escaped text and percent prosody', () => {
    const ssml = buildAzureSsml('あ & <お>', { trackLanguage: 'ja', rate: 0.75 });
    expect(ssml).toContain('ja-JP-NanamiNeural');
    expect(ssml).toContain('rate="75%"');
    expect(ssml).toContain('あ &amp; &lt;お&gt;');
    expect(ssml).not.toContain('<お>');
    const custom = buildAzureSsml('hi', { voice: 'en-US-GuyNeural' });
    expect(custom).toContain('en-US-GuyNeural');
    expect(custom).not.toContain('rate=');
  });
});
