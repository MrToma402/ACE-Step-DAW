import { decorrelateResidual, orthogonalizeResidual } from './waveSubtractionDecorrelation';

export interface AdaptiveSubtractionConfig {
  alpha: number;
  gainMatch: boolean;
  minGainCompensation: number;
  maxGainCompensation: number;
  adaptiveAlpha: boolean;
  adaptiveAlphaFloor: number;
  correlationSampleStride: number;
  bleedGate: boolean;
  bleedGateThreshold: number;
  bleedCorrelationThreshold: number;
  blockSize: number;
  blockHop: number;
  decorrelateResidual: boolean;
  decorrelationThreshold: number;
  maxDecorrelation: number;
  orthogonalizeResidual: boolean;
  orthogonalizeCap: number;
}

const EPS = 1e-8;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function estimateLag(
  current: Float32Array,
  previous: Float32Array,
  length: number,
  maxLagSamples: number,
  stride: number,
): number {
  const step = Math.max(1, stride);
  const lagLimit = Math.max(0, Math.min(maxLagSamples, Math.floor(length / 8)));
  if (length <= 0 || lagLimit === 0) return 0;

  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = -lagLimit; lag <= lagLimit; lag++) {
    let sumXY = 0;
    let sumXX = 0;
    let sumYY = 0;
    let count = 0;
    for (let i = 0; i < length; i += step) {
      const j = i - lag;
      if (j < 0 || j >= length) continue;
      const x = current[i];
      const y = previous[j];
      sumXY += x * y;
      sumXX += x * x;
      sumYY += y * y;
      count++;
    }
    if (count < 8) continue;
    const denom = Math.sqrt(sumXX * sumYY);
    if (denom <= EPS) continue;
    const score = sumXY / denom;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  return bestLag;
}

function buildHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  if (size <= 1) {
    window[0] = 1;
    return window;
  }
  const denom = size - 1;
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - (0.5 * Math.cos((2 * Math.PI * i) / denom));
  }
  return window;
}

function computeBlockParams(
  current: Float32Array,
  previous: Float32Array,
  start: number,
  end: number,
  lag: number,
  config: AdaptiveSubtractionConfig,
): { gain: number; alpha: number } {
  let sumCP = 0;
  let sumPP = 0;
  let sumCC = 0;
  let count = 0;
  for (let i = start; i < end; i++) {
    const j = i - lag;
    if (j < 0 || j >= previous.length) continue;
    const c = current[i];
    const p = previous[j];
    sumCP += c * p;
    sumPP += p * p;
    sumCC += c * c;
    count++;
  }
  if (count === 0) return { gain: 1, alpha: config.alpha };

  const gain = config.gainMatch && sumPP > EPS
    ? clamp(Math.max(0, sumCP / sumPP), config.minGainCompensation, config.maxGainCompensation)
    : 1;

  const denom = Math.sqrt(sumCC * sumPP);
  const corr = denom > EPS ? clamp(sumCP / denom, -1, 1) : 1;
  const corr01 = clamp(corr, 0, 1);
  const alpha = config.adaptiveAlpha
    ? clamp(config.alpha * (config.adaptiveAlphaFloor + ((1 - config.adaptiveAlphaFloor) * corr01)), 0, 1.5)
    : config.alpha;

  return { gain, alpha };
}

export function subtractChannelAdaptive(
  current: Float32Array,
  previous: Float32Array,
  lag: number,
  config: AdaptiveSubtractionConfig,
): Float32Array {
  const length = current.length;
  const blockSize = Math.max(128, config.blockSize);
  const hop = Math.max(32, Math.min(config.blockHop, blockSize));
  const window = buildHannWindow(blockSize);
  const sum = new Float32Array(length);
  const weights = new Float32Array(length);
  const residual = new Float32Array(blockSize);

  for (let start = 0; start < length; start += hop) {
    const end = Math.min(length, start + blockSize);
    const localLength = end - start;
    const { gain, alpha } = computeBlockParams(current, previous, start, end, lag, config);

    let sumRP = 0;
    let sumRR = 0;
    let sumEE = 0;
    for (let k = 0; k < localLength; k++) {
      const i = start + k;
      const j = i - lag;
      const p = j >= 0 && j < previous.length ? previous[j] : 0;
      const estimate = alpha * gain * p;
      const r = current[i] - estimate;
      residual[k] = r;
      sumRP += r * estimate;
      sumRR += r * r;
      sumEE += estimate * estimate;
    }

    let blockScale = 1;
    if (config.bleedGate && sumRR > EPS && sumEE > EPS) {
      const corr = Math.abs(sumRP) / Math.sqrt(sumRR * sumEE);
      const ratio = sumRR / (sumEE + EPS);
      if (corr > config.bleedCorrelationThreshold && ratio < config.bleedGateThreshold) {
        blockScale = clamp(ratio / config.bleedGateThreshold, 0.2, 1);
      }
    }

    for (let k = 0; k < localLength; k++) {
      const i = start + k;
      const w = window[k];
      sum[i] += residual[k] * blockScale * w;
      weights[i] += w;
    }
  }

  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = weights[i] > EPS ? sum[i] / weights[i] : current[i];
  }
  const decorrelated = config.decorrelateResidual
    ? decorrelateResidual(out, previous, lag, {
      blockSize: config.blockSize,
      blockHop: config.blockHop,
      decorrelationThreshold: config.decorrelationThreshold,
      maxDecorrelation: config.maxDecorrelation,
    })
    : out;
  if (!config.orthogonalizeResidual) return decorrelated;
  return orthogonalizeResidual(decorrelated, previous, lag, config.orthogonalizeCap);
}
