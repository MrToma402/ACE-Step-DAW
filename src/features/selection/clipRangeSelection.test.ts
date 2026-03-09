import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveClipRangeSelection } from './clipRangeSelection.ts';

test('selects inclusive range between first selected clip and clicked clip', () => {
  const nextSelected = resolveClipRangeSelection({
    orderedClipIds: ['clip-1', 'clip-2', 'clip-3', 'clip-4', 'clip-5'],
    selectedClipIds: new Set(['clip-2']),
    targetClipId: 'clip-5',
  });

  assert.deepEqual(
    Array.from(nextSelected),
    ['clip-2', 'clip-3', 'clip-4', 'clip-5'],
  );
});

test('uses earliest selected clip as range anchor when multiple clips are already selected', () => {
  const nextSelected = resolveClipRangeSelection({
    orderedClipIds: ['clip-1', 'clip-2', 'clip-3', 'clip-4', 'clip-5', 'clip-6'],
    selectedClipIds: new Set(['clip-5', 'clip-3']),
    targetClipId: 'clip-6',
  });

  assert.deepEqual(
    Array.from(nextSelected),
    ['clip-3', 'clip-4', 'clip-5', 'clip-6'],
  );
});

test('falls back to selecting only target clip when there is no anchor selection', () => {
  const nextSelected = resolveClipRangeSelection({
    orderedClipIds: ['clip-1', 'clip-2', 'clip-3'],
    selectedClipIds: new Set(),
    targetClipId: 'clip-2',
  });

  assert.deepEqual(Array.from(nextSelected), ['clip-2']);
});
