interface DecorrelationConfig {
  blockSize: number;
  blockHop: number;
  decorrelationThreshold: number;
  maxDecorrelation: number;
}

const EPS = 1e-8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

export function decorrelateResidual(
  residual: Float32Array,
  previous: Float32Array,
  lag: number,
  config: DecorrelationConfig,
): Float32Array {
  const length = residual.length;
  const blockSize = Math.max(128, config.blockSize);
  const hop = Math.max(32, Math.min(config.blockHop, blockSize));
  const window = buildHannWindow(blockSize);
  const sum = new Float32Array(length);
  const weights = new Float32Array(length);

  for (let start = 0; start < length; start += hop) {
    const end = Math.min(length, start + blockSize);
    let sumRP = 0;
    let sumRR = 0;
    let sumPP = 0;
    for (let i = start; i < end; i++) {
      const j = i - lag;
      const p = j >= 0 && j < previous.length ? previous[j] : 0;
      const r = residual[i];
      sumRP += r * p;
      sumRR += r * r;
      sumPP += p * p;
    }
    const denom = Math.sqrt(sumRR * sumPP);
    const corr = denom > EPS ? Math.abs(sumRP / denom) : 0;
    const beta = corr >= config.decorrelationThreshold && sumPP > EPS
      ? clamp(sumRP / sumPP, -config.maxDecorrelation, config.maxDecorrelation)
      : 0;

    for (let i = start; i < end; i++) {
      const j = i - lag;
      const p = j >= 0 && j < previous.length ? previous[j] : 0;
      const w = window[i - start];
      sum[i] += (residual[i] - (beta * p)) * w;
      weights[i] += w;
    }
  }

  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = weights[i] > EPS ? sum[i] / weights[i] : residual[i];
  }
  return out;
}

export function orthogonalizeResidual(
  residual: Float32Array,
  previous: Float32Array,
  lag: number,
  maxCoefficient: number,
): Float32Array {
  let sumRP = 0;
  let sumPP = 0;
  for (let i = 0; i < residual.length; i++) {
    const j = i - lag;
    if (j < 0 || j >= previous.length) continue;
    const p = previous[j];
    sumRP += residual[i] * p;
    sumPP += p * p;
  }
  if (sumPP <= EPS) return residual;
  const beta = clamp(sumRP / sumPP, -Math.abs(maxCoefficient), Math.abs(maxCoefficient));
  if (Math.abs(beta) <= 1e-6) return residual;

  const out = new Float32Array(residual.length);
  for (let i = 0; i < residual.length; i++) {
    const j = i - lag;
    const p = j >= 0 && j < previous.length ? previous[j] : 0;
    out[i] = residual[i] - (beta * p);
  }
  return out;
}
