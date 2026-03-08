import test from 'node:test';
import assert from 'node:assert/strict';
import {
  subtractChannelAdaptive,
  type AdaptiveSubtractionConfig,
} from './waveSubtractionCore.ts';

const BASE_CONFIG: AdaptiveSubtractionConfig = {
  alpha: 0.95,
  gainMatch: true,
  minGainCompensation: 0.65,
  maxGainCompensation: 1.6,
  adaptiveAlpha: true,
  adaptiveAlphaFloor: 0.7,
  correlationSampleStride: 4,
  bleedGate: true,
  bleedGateThreshold: 0.28,
  bleedCorrelationThreshold: 0.55,
  blockSize: 1024,
  blockHop: 512,
  decorrelateResidual: false,
  decorrelationThreshold: 0.65,
  maxDecorrelation: 0.3,
  orthogonalizeResidual: false,
  orthogonalizeCap: 0.18,
};

function makeSine(length: number, freqHz: number, sampleRate: number, amp: number): Float32Array {
  const out = new Float32Array(length);
  const step = (2 * Math.PI * freqHz) / sampleRate;
  for (let i = 0; i < length; i++) {
    out[i] = Math.sin(step * i) * amp;
  }
  return out;
}

function addSignals(a: Float32Array, b: Float32Array): Float32Array {
  const length = Math.min(a.length, b.length);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = a[i] + b[i];
  return out;
}

function rms(input: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  return Math.sqrt(sum / Math.max(1, input.length));
}

function correlation(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let sumAB = 0;
  let sumAA = 0;
  let sumBB = 0;
  for (let i = 0; i < length; i++) {
    const av = a[i];
    const bv = b[i];
    sumAB += av * bv;
    sumAA += av * av;
    sumBB += bv * bv;
  }
  const denom = Math.sqrt(sumAA * sumBB);
  return denom > 1e-8 ? sumAB / denom : 0;
}

function makeNoise(length: number, seed: number): Float32Array {
  let state = seed >>> 0;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    state = ((1664525 * state) + 1013904223) >>> 0;
    out[i] = ((state / 0xffffffff) * 2) - 1;
  }
  return out;
}

test('subtractChannelAdaptive keeps the new layer while reducing old layer bleed', () => {
  const sampleRate = 48000;
  const length = 8192;
  const previous = makeSine(length, 110, sampleRate, 0.6);
  const added = makeSine(length, 220, sampleRate, 0.2);
  const current = addSignals(previous, added);

  const residual = subtractChannelAdaptive(current, previous, 0, BASE_CONFIG);

  assert.ok(correlation(residual, added) > 0.75);
  assert.ok(Math.abs(correlation(residual, previous)) < 0.55);
});

test('subtractChannelAdaptive avoids over-subtraction on uncorrelated material', () => {
  const length = 8192;
  const current = makeNoise(length, 1337);
  const previous = makeNoise(length, 42);

  const residual = subtractChannelAdaptive(current, previous, 0, BASE_CONFIG);
  const ratio = rms(residual) / Math.max(1e-8, rms(current));

  assert.ok(ratio > 0.75);
  assert.ok(ratio < 1.25);
});

test('subtractChannelAdaptive preserves strong transients not present in previous mix', () => {
  const sampleRate = 48000;
  const length = 4096;
  const previous = makeSine(length, 180, sampleRate, 0.25);
  const current = previous.slice();
  current[1000] += 1.0;
  current[3000] -= 0.9;

  const residual = subtractChannelAdaptive(current, previous, 0, BASE_CONFIG);

  assert.ok(Math.abs(residual[1000]) > 0.45);
  assert.ok(Math.abs(residual[3000]) > 0.4);
});
