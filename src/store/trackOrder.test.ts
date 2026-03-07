import test from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '../types/project.ts';
import { reorderTracksByTarget, sortTracksByOrder } from './trackOrder.ts';

function makeTrack(id: string, order: number): Track {
  return {
    id,
    trackName: 'custom',
    displayName: id.toUpperCase(),
    color: '#ffffff',
    order,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: [],
  };
}

test('reorderTracksByTarget moves dragged track to target slot while preserving order values', () => {
  const tracks = [makeTrack('a', 10), makeTrack('b', 20), makeTrack('c', 30)];

  const reordered = reorderTracksByTarget(tracks, 'c', 'a');

  assert.deepEqual(reordered.map((track) => track.id), ['c', 'a', 'b']);
  assert.deepEqual(reordered.map((track) => track.order), [10, 20, 30]);
});

test('reorderTracksByTarget returns original array when target track does not exist', () => {
  const tracks = [makeTrack('a', 1), makeTrack('b', 2), makeTrack('c', 3)];

  const reordered = reorderTracksByTarget(tracks, 'b', 'missing');

  assert.strictEqual(reordered, tracks);
});

test('reorderTracksByTarget does not mutate input tracks', () => {
  const tracks = [makeTrack('a', 3), makeTrack('b', 5), makeTrack('c', 9)];
  const before = tracks.map((track) => ({ id: track.id, order: track.order }));

  const reordered = reorderTracksByTarget(tracks, 'a', 'c');

  assert.deepEqual(
    tracks.map((track) => ({ id: track.id, order: track.order })),
    before,
  );
  assert.deepEqual(sortTracksByOrder(reordered).map((track) => track.id), ['b', 'c', 'a']);
});
