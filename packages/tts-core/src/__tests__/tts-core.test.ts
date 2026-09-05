import { describe, expect, it } from 'bun:test';
import {
  __resetTtsEnginesForTest,
  bcp47ForTrack,
  getActiveTtsEngine,
  listTtsEngines,
  normalizeTtsTrackLanguage,
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
