import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExtractTrackStemsResult } from '../services/stemExtractionPipeline.ts';
import { createExtractToTracksStatusStore } from './extractToTracksStatusStore.ts';

function makeResult(): ExtractTrackStemsResult {
  return {
    createdTrackNames: ['drums'],
    skippedTrackNames: ['strings'],
    failedTrackNames: [],
  };
}

test('extractToTracksStatusStore transitions to result with progress updates', async () => {
  const store = createExtractToTracksStatusStore({
    isGenerating: () => false,
    extractRunner: async (_sourceTrackId, _sourceClipId, options) => {
      options.onProgress?.({
        phase: 'extracting',
        completed: 1,
        total: 3,
        currentTrackName: 'drums',
      });
      return makeResult();
    },
  });

  await store.getState().startExtraction({
    sourceTrackId: 'track-1',
    sourceLabel: 'track "Drums"',
  });

  const state = store.getState();
  assert.equal(state.mode, 'result');
  assert.equal(state.progress?.currentTrackName, 'drums');
  assert.deepEqual(state.result, makeResult());
});

test('extractToTracksStatusStore transitions to error on extraction failure', async () => {
  const store = createExtractToTracksStatusStore({
    isGenerating: () => false,
    extractRunner: async () => {
      throw new Error('boom');
    },
  });

  await store.getState().startExtraction({
    sourceTrackId: 'track-1',
  });

  const state = store.getState();
  assert.equal(state.mode, 'error');
  assert.equal(state.errorMessage, 'boom');
});

test('extractToTracksStatusStore closes on cancel', async () => {
  const store = createExtractToTracksStatusStore({
    isGenerating: () => false,
    extractRunner: (_sourceTrackId, _sourceClipId, options) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    }),
  });

  const task = store.getState().startExtraction({
    sourceTrackId: 'track-1',
  });
  store.getState().cancelExtraction();
  await task;

  assert.equal(store.getState().mode, 'closed');
});
