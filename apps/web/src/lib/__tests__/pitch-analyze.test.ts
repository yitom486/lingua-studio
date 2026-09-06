import { describe, expect, it } from 'bun:test';
import {
  describePitchFeedback,
  estimatePitchContour,
  estimateWindowF0,
  overallPitchScore,
  scorePitchMatch,
  type PitchContourPoint,
} from '../pitch-analyze.js';

/** 合成指定频率的正弦窗（测试用标准信号，杜绝随机）。 */
function sineWave(freqHz: number, sampleRate: number, seconds: number): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  }
  return out;
}

function concat(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

describe('estimateWindowF0', () => {
  it('detects sine pitch and rejects silence', () => {
    const wave = sineWave(220, 8000, 0.1);
    const f0 = estimateWindowF0(wave, 8000);
    expect(f0).not.toBeNull();
    // 自相关峰值落在最近整数 lag，容差半个 lag 步进
    expect(Math.abs((f0 ?? 0) - 220)).toBeLessThan(12);
    expect(estimateWindowF0(new Float32Array(800), 8000)).toBeNull();
  });
});

describe('scorePitchMatch', () => {
  it('scores a high-low contour against H-L template', () => {
    const sr = 8000;
    // 前半 300Hz、后半 180Hz：期望 H-L 全中
    const samples = concat([sineWave(300, sr, 0.4), sineWave(180, sr, 0.4)]);
    const contour = estimatePitchContour(samples, sr);
    expect(contour.length).toBeGreaterThan(0);
    const result = scorePitchMatch(contour, ['H', 'L']);
    expect(result.pitchMatch).toBe(100);
    expect(result.perMora.map((m) => m.observed)).toEqual(['H', 'L']);
    expect(overallPitchScore(result)).toBeGreaterThanOrEqual(90);
    expect(describePitchFeedback(result, '头高型')).toContain('极佳');
  });

  it('penalizes inverted contour without inventing pitch', () => {
    const sr = 8000;
    const samples = concat([sineWave(180, sr, 0.4), sineWave(300, sr, 0.4)]);
    const contour = estimatePitchContour(samples, sr);
    const result = scorePitchMatch(contour, ['H', 'L']);
    expect(result.pitchMatch).toBe(0);
    expect(result.perMora.every((m) => !m.matched)).toBe(true);
    expect(describePitchFeedback(result, '头高型')).toContain('走反');
  });

  it('returns zeros (never NaN) for empty or silent input', () => {
    const empty = scorePitchMatch([], ['H', 'L']);
    expect(empty.pitchMatch).toBe(0);
    expect(empty.fluency).toBe(0);
    expect(overallPitchScore(empty)).toBe(0);
    const silentContour: PitchContourPoint[] = [
      { timeSec: 0, freqHz: null },
      { timeSec: 0.02, freqHz: null },
    ];
    const silent = scorePitchMatch(silentContour, ['H', 'L']);
    expect(silent.pitchMatch).toBe(0);
    expect(describePitchFeedback(silent, '头高型')).toContain('有效发声太少');
  });
});
