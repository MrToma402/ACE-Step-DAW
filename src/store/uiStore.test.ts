import test from 'node:test';
import assert from 'node:assert/strict';
import { useUIStore } from './uiStore.ts';

function resetSelections() {
  useUIStore.setState({
    selectedClipIds: new Set(),
    selectedTrackIds: new Set(),
  });
}

test('selectTrack supports single selection and ctrl/cmd-style toggle selection', () => {
  resetSelections();
  const { selectTrack } = useUIStore.getState();

  selectTrack('track-1', false);
  assert.deepEqual(Array.from(useUIStore.getState().selectedTrackIds), ['track-1']);

  selectTrack('track-2', true);
  assert.deepEqual(new Set(useUIStore.getState().selectedTrackIds), new Set(['track-1', 'track-2']));

  selectTrack('track-1', true);
  assert.deepEqual(Array.from(useUIStore.getState().selectedTrackIds), ['track-2']);
});

test('setSelectedTracks replaces selection and clearSelectedTracks clears it', () => {
  resetSelections();
  const { setSelectedTracks, clearSelectedTracks } = useUIStore.getState();

  setSelectedTracks(['track-a', 'track-b']);
  assert.deepEqual(new Set(useUIStore.getState().selectedTrackIds), new Set(['track-a', 'track-b']));

  clearSelectedTracks();
  assert.equal(useUIStore.getState().selectedTrackIds.size, 0);
});

test('selecting a clip clears track selection for clip-focused editing', () => {
  resetSelections();
  const { selectClip, selectTrack } = useUIStore.getState();

  selectTrack('track-1', false);
  selectClip('clip-1', false);

  assert.deepEqual(Array.from(useUIStore.getState().selectedClipIds), ['clip-1']);
  assert.equal(useUIStore.getState().selectedTrackIds.size, 0);
});

test('shortcut defaults include play selected isolation on P', () => {
  const { shortcutBindings } = useUIStore.getState();
  assert.equal(shortcutBindings.playSelectedIsolation, 'KeyP');
});
