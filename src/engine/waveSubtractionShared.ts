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

export function buildHannWindow(size: number): Float32Array {
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
