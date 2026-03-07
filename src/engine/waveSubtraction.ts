/**
 * Isolate a single track's audio by subtracting the previous cumulative mix.
 *
 * currentMix = layers 1..N combined (lego output)
 * previousMix = layers 1..N-1 combined (previous lego output), null for first track
 * Result = isolated track N audio
 */
export interface WaveSubtractionOptions {
  /**
   * Subtraction strength. 1.0 = full subtraction, lower = softer subtraction.
   */
  alpha?: number;
  /**
   * Automatically match previous mix gain to current mix before subtraction.
   */
  gainMatch?: boolean;
  /**
   * Lower clamp for automatic gain compensation.
   */
  minGainCompensation?: number;
  /**
   * Upper clamp for automatic gain compensation.
   */
  maxGainCompensation?: number;
  /**
   * Adapt subtraction strength from signal similarity.
   * High similarity -> stronger subtraction, low similarity -> softer subtraction.
   */
  adaptiveAlpha?: boolean;
  /**
   * Lowest scale applied to alpha when similarity is very low.
   */
  adaptiveAlphaFloor?: number;
  /**
   * Sample stride used for correlation estimation (higher = faster, less precise).
   */
  correlationSampleStride?: number;
}

const DEFAULT_SUBTRACTION_OPTIONS: Required<WaveSubtractionOptions> = {
  alpha: 0.95,
  gainMatch: true,
  minGainCompensation: 0.5,
  maxGainCompensation: 2.0,
  adaptiveAlpha: true,
  adaptiveAlphaFloor: 0.85,
  correlationSampleStride: 4,
};

const RMS_EPSILON = 1e-8;

function computeRms(data: Float32Array, length: number): number {
  if (length <= 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < length; i++) {
    const sample = data[i];
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / length);
}

function resolveGain(
  current: Float32Array,
  previous: Float32Array,
  options: Required<WaveSubtractionOptions>,
): number {
  if (!options.gainMatch) return 1;
  const overlap = Math.min(current.length, previous.length);
  if (overlap <= 0) return 1;

  const currentRms = computeRms(current, overlap);
  const previousRms = computeRms(previous, overlap);
  if (previousRms <= RMS_EPSILON) return 1;

  const rawGain = currentRms / previousRms;
  return Math.max(
    options.minGainCompensation,
    Math.min(options.maxGainCompensation, rawGain),
  );
}

function computeCorrelation(
  current: Float32Array,
  previous: Float32Array,
  length: number,
  stride: number,
): number {
  if (length <= 0) return 1;
  const step = Math.max(1, stride);
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;
  for (let i = 0; i < length; i += step) {
    const x = current[i];
    const y = previous[i];
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  }
  const denom = Math.sqrt(sumXX * sumYY);
  if (denom <= RMS_EPSILON) return 1;
  return Math.max(-1, Math.min(1, sumXY / denom));
}

function resolveAlpha(
  baseAlpha: number,
  correlation: number,
  options: Required<WaveSubtractionOptions>,
): number {
  if (!options.adaptiveAlpha) return Math.max(0, Math.min(1.5, baseAlpha));
  const floor = Math.max(0, Math.min(1, options.adaptiveAlphaFloor));
  const normalizedCorrelation = Math.max(0, Math.min(1, correlation));
  const scale = floor + (1 - floor) * normalizedCorrelation;
  return Math.max(0, Math.min(1.5, baseAlpha * scale));
}

export function isolateTrackAudio(
  ctx: BaseAudioContext,
  currentMix: AudioBuffer,
  previousMix: AudioBuffer | null,
  options: WaveSubtractionOptions = {},
): AudioBuffer {
  if (!previousMix) return currentMix;
  const resolvedOptions: Required<WaveSubtractionOptions> = {
    ...DEFAULT_SUBTRACTION_OPTIONS,
    ...options,
  };
  const baseAlpha = Math.max(0, Math.min(1.5, resolvedOptions.alpha));

  const isolated = ctx.createBuffer(
    currentMix.numberOfChannels,
    currentMix.length,
    currentMix.sampleRate,
  );

  for (let ch = 0; ch < currentMix.numberOfChannels; ch++) {
    const curr = currentMix.getChannelData(ch);
    // If previous mix has fewer channels, treat missing channels as silence
    const prev = ch < previousMix.numberOfChannels
      ? previousMix.getChannelData(ch)
      : null;
    const out = isolated.getChannelData(ch);
    const gain = prev ? resolveGain(curr, prev, resolvedOptions) : 1;
    const overlap = prev ? Math.min(curr.length, prev.length) : 0;
    const correlation = prev
      ? computeCorrelation(curr, prev, overlap, resolvedOptions.correlationSampleStride)
      : 1;
    const alpha = resolveAlpha(baseAlpha, correlation, resolvedOptions);

    for (let i = 0; i < curr.length; i++) {
      const previousSample = prev && i < prev.length ? prev[i] * gain : 0;
      out[i] = curr[i] - (alpha * previousSample);
    }
  }

  return isolated;
}
