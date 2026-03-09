import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTracksForDeleteShortcut } from './deleteTracksShortcutTarget.ts';

test('resolveTracksForDeleteShortcut prefers explicitly selected tracks', () => {
  const trackIds = resolveTracksForDeleteShortcut({
    selectedTrackIds: new Set(['track-a', 'track-b']),
    selectedClipIds: new Set(['clip-1', 'clip-2']),
    resolveTrackIdForClip: () => 'track-z',
  });

  assert.deepEqual(trackIds, ['track-a', 'track-b']);
});

test('resolveTracksForDeleteShortcut resolves unique tracks from selected clips', () => {
  const trackByClip: Record<string, string | null> = {
    'clip-1': 'track-a',
    'clip-2': 'track-b',
    'clip-3': 'track-a',
    'clip-missing': null,
  };

  const trackIds = resolveTracksForDeleteShortcut({
    selectedTrackIds: new Set(),
    selectedClipIds: new Set(['clip-1', 'clip-2', 'clip-3', 'clip-missing']),
    resolveTrackIdForClip: (clipId) => trackByClip[clipId] ?? null,
  });

  assert.deepEqual(trackIds, ['track-a', 'track-b']);
});

test('resolveTracksForDeleteShortcut returns empty when nothing is selected', () => {
  const trackIds = resolveTracksForDeleteShortcut({
    selectedTrackIds: new Set(),
    selectedClipIds: new Set(),
    resolveTrackIdForClip: () => null,
  });

  assert.deepEqual(trackIds, []);
});
