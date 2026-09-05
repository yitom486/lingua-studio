import { describe, expect, it } from 'bun:test';
import {
  ensureTtsEngines,
  getActiveTtsEngine,
  setActiveTtsEngine,
  webSpeechEngine,
} from '../tts-engines.js';

describe('tts engine registration', () => {
  it('registers webspeech as the default real engine (idempotent)', () => {
    ensureTtsEngines();
    ensureTtsEngines();
    expect(getActiveTtsEngine()?.id).toBe('webspeech');
    expect(webSpeechEngine.id).toBe('webspeech');
    expect(setActiveTtsEngine('missing-engine')).toBe(false);
    expect(setActiveTtsEngine('webspeech')).toBe(true);
  });
});
