import test from 'node:test';
import assert from 'node:assert/strict';
import type { Clip } from '../../types/project.ts';
import { isDisposableDraftClip } from './draftClipCleanup.ts';

function makeClip(overrides?: Partial<Clip>): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 8,
    prompt: '',
    lyrics: '',
    generationStatus: 'empty',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    ...overrides,
  };
}

test('isDisposableDraftClip returns true for untouched empty draft clip', () => {
  assert.equal(isDisposableDraftClip(makeClip()), true);
});

test('isDisposableDraftClip returns false once clip contains user content', () => {
  assert.equal(isDisposableDraftClip(makeClip({ prompt: 'bass groove' })), false);
  assert.equal(isDisposableDraftClip(makeClip({ lyrics: 'la la' })), false);
});

test('isDisposableDraftClip returns false for generated or imported clips', () => {
  assert.equal(isDisposableDraftClip(makeClip({ generationStatus: 'ready' })), false);
  assert.equal(isDisposableDraftClip(makeClip({ isolatedAudioKey: 'isolated-audio' })), false);
  assert.equal(isDisposableDraftClip(makeClip({ waveformPeaks: [0.1, 0.2] })), false);
});
