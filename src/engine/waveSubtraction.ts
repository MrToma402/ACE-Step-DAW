import {
  clamp,
  estimateLag,
  subtractChannelAdaptive,
  type AdaptiveSubtractionConfig,
} from './waveSubtractionCore';

export interface WaveSubtractionOptions {
  alpha?: number;
  gainMatch?: boolean;
  minGainCompensation?: number;
  maxGainCompensation?: number;
  adaptiveAlpha?: boolean;
  adaptiveAlphaFloor?: number;
  correlationSampleStride?: number;
  lagCompensation?: boolean;
  maxLagSamples?: number;
  bleedGate?: boolean;
  bleedGateThreshold?: number;
  bleedCorrelationThreshold?: number;
  blockSize?: number;
  blockHop?: number;
  decorrelateResidual?: boolean;
  decorrelationThreshold?: number;
  maxDecorrelation?: number;
  orthogonalizeResidual?: boolean;
  orthogonalizeCap?: number;
}

const DEFAULT_OPTIONS: Required<WaveSubtractionOptions> = {
  alpha: 1.0,
  gainMatch: true,
  minGainCompensation: 0.5,
  maxGainCompensation: 2.0,
  adaptiveAlpha: true,
  adaptiveAlphaFloor: 0.9,
  correlationSampleStride: 4,
  lagCompensation: true,
  maxLagSamples: 96,
  bleedGate: true,
  bleedGateThreshold: 0.28,
  bleedCorrelationThreshold: 0.55,
  blockSize: 2048,
  blockHop: 1024,
  decorrelateResidual: true,
  decorrelationThreshold: 0.65,
  maxDecorrelation: 0.3,
  orthogonalizeResidual: true,
  orthogonalizeCap: 0.18,
};

export function isolateTrackAudio(
  ctx: BaseAudioContext,
  currentMix: AudioBuffer,
  previousMix: AudioBuffer | null,
  options: WaveSubtractionOptions = {},
): AudioBuffer {
  if (!previousMix) return currentMix;
  const resolved: Required<WaveSubtractionOptions> = { ...DEFAULT_OPTIONS, ...options };
  const config: AdaptiveSubtractionConfig = {
    alpha: clamp(resolved.alpha, 0, 1.5),
    gainMatch: resolved.gainMatch,
    minGainCompensation: resolved.minGainCompensation,
    maxGainCompensation: resolved.maxGainCompensation,
    adaptiveAlpha: resolved.adaptiveAlpha,
    adaptiveAlphaFloor: clamp(resolved.adaptiveAlphaFloor, 0, 1),
    correlationSampleStride: resolved.correlationSampleStride,
    bleedGate: resolved.bleedGate,
    bleedGateThreshold: Math.max(0.01, resolved.bleedGateThreshold),
    bleedCorrelationThreshold: clamp(resolved.bleedCorrelationThreshold, 0, 1),
    blockSize: resolved.blockSize,
    blockHop: resolved.blockHop,
    decorrelateResidual: resolved.decorrelateResidual,
    decorrelationThreshold: clamp(resolved.decorrelationThreshold, 0, 1),
    maxDecorrelation: clamp(resolved.maxDecorrelation, 0, 1),
    orthogonalizeResidual: resolved.orthogonalizeResidual,
    orthogonalizeCap: clamp(resolved.orthogonalizeCap, 0, 1),
  };

  const isolated = ctx.createBuffer(currentMix.numberOfChannels, currentMix.length, currentMix.sampleRate);
  for (let ch = 0; ch < currentMix.numberOfChannels; ch++) {
    const current = currentMix.getChannelData(ch);
    const previous = ch < previousMix.numberOfChannels ? previousMix.getChannelData(ch) : null;
    const out = isolated.getChannelData(ch);
    if (!previous) {
      out.set(current);
      continue;
    }
    const overlap = Math.min(current.length, previous.length);
    const lag = resolved.lagCompensation
      ? estimateLag(current, previous, overlap, resolved.maxLagSamples, resolved.correlationSampleStride)
      : 0;
    out.set(subtractChannelAdaptive(current, previous, lag, config));
  }

  return isolated;
}
