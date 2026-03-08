import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAudibleContent, limitBufferPeak } from './extractAudioAnalysis.ts';

function makeAudioBuffer(samplesByChannel: number[][]): AudioBuffer {
  const channels = samplesByChannel.map((samples) => Float32Array.from(samples));
  return {
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    getChannelData: (channel: number) => channels[channel],
  } as unknown as AudioBuffer;
}

function getPeak(buffer: AudioBuffer): number {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
  }
  return peak;
}

test('limitBufferPeak scales audio when peak is above target', () => {
  const buffer = makeAudioBuffer([[0.2, -1.0, 0.5]]);
  limitBufferPeak(buffer, 0.5);
  assert.ok(Math.abs(getPeak(buffer) - 0.5) < 1e-6);
});

test('hasAudibleContent returns false for near-silent output', () => {
  const buffer = makeAudioBuffer([[0.0002, -0.0003, 0.0001, -0.0002]]);
  const audible = hasAudibleContent(buffer, 0.02, 0.002);
  assert.equal(audible, false);
});

test('hasAudibleContent returns true when peak passes threshold', () => {
  const buffer = makeAudioBuffer([[0, 0.03, 0, -0.01]]);
  const audible = hasAudibleContent(buffer, 0.02, 0.002);
  assert.equal(audible, true);
});
