/**
 * 跟读音高分析（纯函数，不碰 DOM/麦克风）。
 * 流程：录音 PCM → 自相关法逐窗估 f0 → 按拍取中值定 H/L → 与课程声调模板比对打分。
 * 无模型、无随机数：同样的录音永远得到同样的分数；无麦克风时调用方不得编分。
 */

export interface PitchContourPoint {
  timeSec: number;
  /** 基频 Hz；null = 该窗无 voicing（静音/清音）。 */
  freqHz: number | null;
}

export interface PitchAnalyzeOptions {
  windowSec?: number | undefined;
  hopSec?: number | undefined;
  minHz?: number | undefined;
  maxHz?: number | undefined;
  /** 归一化自相关的 voicing 门限（0-1）。 */
  clarityThreshold?: number | undefined;
}

export interface MoraPitchVerdict {
  moraIndex: number;
  expected: 'H' | 'L';
  observed: 'H' | 'L' | null;
  matched: boolean;
}

export interface PitchMatchResult {
  /** 0-100：拍位高低命中率。 */
  pitchMatch: number;
  /** 0-100：浊音窗占比（节奏连贯度代理）。 */
  fluency: number;
  perMora: MoraPitchVerdict[];
  voicedRatio: number;
}

/** 单窗归一化自相关基频估计；无 voicing 返回 null（不臆造频率）。 */
export function estimateWindowF0(
  frame: Float32Array,
  sampleRate: number,
  minHz = 60,
  maxHz = 400,
  clarityThreshold = 0.45
): number | null {
  const n = frame.length;
  if (n < 16 || sampleRate <= 0) return null;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const v = frame[i] ?? 0;
    energy += v * v;
  }
  if (energy < 1e-8) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / minHz));
  if (maxLag <= minLag) return null;

  let bestLag = -1;
  let bestCorr = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i + lag < n; i++) {
      corr += (frame[i] ?? 0) * (frame[i + lag] ?? 0);
    }
    const normalized = corr / energy;
    if (normalized > bestCorr) {
      bestCorr = normalized;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestCorr < clarityThreshold) return null;
  return sampleRate / bestLag;
}

/** 整段 PCM → f0 轮廓（逐窗 hop，无 voicing 记 null）。 */
export function estimatePitchContour(
  samples: Float32Array,
  sampleRate: number,
  options?: PitchAnalyzeOptions
): PitchContourPoint[] {
  const windowSec = options?.windowSec ?? 0.04;
  const hopSec = options?.hopSec ?? 0.02;
  const minHz = options?.minHz ?? 60;
  const maxHz = options?.maxHz ?? 400;
  const clarity = options?.clarityThreshold ?? 0.45;
  const windowSize = Math.max(16, Math.floor(sampleRate * windowSec));
  const hopSize = Math.max(8, Math.floor(sampleRate * hopSec));
  const out: PitchContourPoint[] = [];
  if (samples.length < windowSize || sampleRate <= 0) return out;
  for (let start = 0; start + windowSize <= samples.length; start += hopSize) {
    const frame = samples.slice(start, start + windowSize);
    out.push({
      timeSec: start / sampleRate,
      freqHz: estimateWindowF0(frame, sampleRate, minHz, maxHz, clarity),
    });
  }
  return out;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * 轮廓按拍三等分取中值，与模板 H/L 比对（相对判定：高于全段中值即 H，
 * 不依赖绝对音高，男女声通用）。无浊音拍记 mismatch，不送分。
 */
export function scorePitchMatch(
  contour: PitchContourPoint[],
  expected: Array<'H' | 'L'>
): PitchMatchResult {
  const moraCount = expected.length;
  const perMora: MoraPitchVerdict[] = [];
  if (moraCount === 0 || contour.length === 0) {
    return { pitchMatch: 0, fluency: 0, perMora, voicedRatio: 0 };
  }
  const voiced = contour.filter((p) => p.freqHz !== null);
  const voicedRatio = voiced.length / contour.length;
  const globalMedian = median(voiced.map((p) => p.freqHz as number));

  let matched = 0;
  for (let m = 0; m < moraCount; m++) {
    const start = Math.floor((m * contour.length) / moraCount);
    const end = Math.floor(((m + 1) * contour.length) / moraCount);
    const slice = contour.slice(start, Math.max(end, start + 1));
    const sliceVoiced = slice
      .map((p) => p.freqHz)
      .filter((f): f is number => f !== null);
    const sliceMedian = median(sliceVoiced);
    // 严格大于才判 H：50/50 对半时全局中值恰落低簇，>= 会把低音误判为 H
    const observed: 'H' | 'L' | null =
      sliceMedian === null || globalMedian === null
        ? null
        : sliceMedian > globalMedian
          ? 'H'
          : 'L';
    const ok = observed !== null && observed === expected[m];
    if (ok) matched++;
    perMora.push({
      moraIndex: m,
      expected: expected[m]!,
      observed,
      matched: ok,
    });
  }

  const pitchMatch = Math.round((matched / moraCount) * 100);
  const fluency = Math.round(voicedRatio * 100);
  return { pitchMatch, fluency, perMora, voicedRatio };
}

/** 综合分 = 拍位命中 70% + 浊音占比 30%（四舍五入；输入空轮廓得 0）。 */
export function overallPitchScore(result: PitchMatchResult): number {
  return Math.round(result.pitchMatch * 0.7 + result.fluency * 0.3);
}

/** 评语完全由实测数据派生（确定性；无随机、无模板套话之外的臆造）。 */
export function describePitchFeedback(
  result: PitchMatchResult,
  pitchTypeLabel: string
): string {
  const missed = result.perMora.filter((m) => !m.matched).map((m) => `第${m.moraIndex + 1}拍`);
  if (result.pitchMatch >= 90 && result.fluency >= 60) {
    return `极佳！声调走向完美契合${pitchTypeLabel}，高低起伏转折利落自然。`;
  }
  if (result.pitchMatch >= 70) {
    const where = missed.length > 0 ? `（${missed.join('、')}可再压准些）` : '';
    return `良好！整体音高走向正确${where}，注意拍内保持平稳，不要拖长尾音。`;
  }
  if (result.voicedRatio < 0.3) {
    return `这次有效发声太少（仅采到零星浊音），请靠近麦克风、放慢清晰地读一遍再测。`;
  }
  const where = missed.length > 0 ? `，尤其${missed.join('、')}的高低走反了` : '';
  return `还需加油${where}。建议先听两遍示范原音，逐拍跟读后再测一次。`;
}
