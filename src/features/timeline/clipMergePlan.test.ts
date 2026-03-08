import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClipMergePlan } from './clipMergePlan.ts';

function makeClip(
  id: string,
  trackId: string,
  startTime: number,
  duration: number,
) {
  return {
    id,
    trackId,
    startTime,
    duration,
  };
}

test('buildClipMergePlan returns null when less than two clips are selected', () => {
  const plan = buildClipMergePlan([makeClip('a', 'track-1', 0, 4)]);
  assert.equal(plan, null);
});

test('buildClipMergePlan rejects clips from different tracks', () => {
  const plan = buildClipMergePlan([
    makeClip('a', 'track-1', 0, 4),
    makeClip('b', 'track-2', 4, 4),
  ]);
  assert.equal(plan, null);
});

test('buildClipMergePlan accepts touching clips and normalizes order', () => {
  const plan = buildClipMergePlan([
    makeClip('b', 'track-1', 4, 4),
    makeClip('a', 'track-1', 0, 4),
  ]);

  assert.deepEqual(plan, {
    trackId: 'track-1',
    orderedClipIds: ['a', 'b'],
    startTime: 0,
    endTime: 8,
  });
});

test('buildClipMergePlan rejects clips with a visible gap', () => {
  const plan = buildClipMergePlan([
    makeClip('a', 'track-1', 0, 4),
    makeClip('b', 'track-1', 4.2, 4),
  ]);
  assert.equal(plan, null);
});
