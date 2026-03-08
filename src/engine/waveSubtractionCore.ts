import { decorrelateResidual, orthogonalizeResidual } from './waveSubtractionDecorrelation';
import { buildHannWindow, clamp } from './waveSubtractionShared';

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
const MIN_LOCAL_CORRELATION = 0.08;
const TRANSIENT_MATCH_MULTIPLIER = 1.2;
const TRANSIENT_PRESERVE_BLEND = 0.4;
const MAX_RESIDUAL_FLOOR_BOOST = 3.0;

interface BlockStats {
  count: number;
  sumCP: number;
  sumPP: number;
  sumCC: number;
  corrAbs: number;
}

function computeBlockStats(
  current: Float32Array,
  previous: Float32Array,
  start: number,
  end: number,
  lag: number,
): BlockStats {
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
  if (count === 0) {
    return { count: 0, sumCP: 0, sumPP: 0, sumCC: 0, corrAbs: 0 };
  }

  const denom = Math.sqrt(sumCC * sumPP);
  const corr = denom > EPS ? clamp(sumCP / denom, -1, 1) : 0;
  return { count, sumCP, sumPP, sumCC, corrAbs: Math.abs(corr) };
}

function resolveSubtractionGain(
  stats: BlockStats,
  config: AdaptiveSubtractionConfig,
): number {
  if (!config.gainMatch || stats.sumPP <= EPS) return 1;
  const rawGain = Math.max(0, stats.sumCP / stats.sumPP);
  return clamp(rawGain, config.minGainCompensation, config.maxGainCompensation);
}

function resolveSubtractionAlpha(
  corrAbs: number,
  config: AdaptiveSubtractionConfig,
): number {
  const adaptiveBase = config.adaptiveAlpha
    ? config.adaptiveAlphaFloor + ((1 - config.adaptiveAlphaFloor) * corrAbs)
    : 1;
  let alpha = clamp(config.alpha * adaptiveBase, 0, 1.5);
  if (corrAbs < MIN_LOCAL_CORRELATION) {
    alpha *= corrAbs / MIN_LOCAL_CORRELATION;
  }
  return alpha;
}

function computeResidualFloorBoost(
  rmsCurrent: number,
  rmsResidual: number,
  corrAbs: number,
  config: AdaptiveSubtractionConfig,
): number {
  if (!config.bleedGate || corrAbs < config.bleedCorrelationThreshold) return 1;
  const targetFloor = rmsCurrent * clamp(config.bleedGateThreshold, 0.05, 0.8);
  if (rmsResidual >= targetFloor) return 1;
  return clamp(targetFloor / (rmsResidual + EPS), 1, MAX_RESIDUAL_FLOOR_BOOST);
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
    const stats = computeBlockStats(current, previous, start, end, lag);
    if (stats.count === 0) continue;
    const gain = resolveSubtractionGain(stats, config);
    const alpha = resolveSubtractionAlpha(stats.corrAbs, config);

    let sumRR = 0;
    for (let k = 0; k < localLength; k++) {
      const i = start + k;
      const j = i - lag;
      const p = j >= 0 && j < previous.length ? previous[j] : 0;
      const estimate = alpha * gain * p;
      const r = current[i] - estimate;
      residual[k] = r;
      sumRR += r * r;
    }

    const rmsCurrent = Math.sqrt(stats.sumCC / stats.count);
    const rmsResidual = Math.sqrt(sumRR / stats.count);
    const residualFloorBoost = computeResidualFloorBoost(
      rmsCurrent,
      rmsResidual,
      stats.corrAbs,
      config,
    );

    for (let k = 0; k < localLength; k++) {
      const i = start + k;
      const j = i - lag;
      const p = j >= 0 && j < previous.length ? previous[j] : 0;
      const c = current[i];
      let safeResidual = residual[k] * residualFloorBoost;
      const transientWeight = clamp(
        (Math.abs(c) - (Math.abs(p) * TRANSIENT_MATCH_MULTIPLIER)) / (Math.abs(c) + EPS),
        0,
        1,
      );
      if (transientWeight > 0) {
        const keepCurrent = transientWeight * TRANSIENT_PRESERVE_BLEND;
        safeResidual = (safeResidual * (1 - keepCurrent)) + (c * keepCurrent);
      }
      const w = window[k];
      sum[i] += safeResidual * w;
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
