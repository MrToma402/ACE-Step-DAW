import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeleteSelectionTarget } from './deleteSelectionTarget.ts';

test('resolveDeleteSelectionTarget prioritizes clip selection over track selection', () => {
  assert.equal(resolveDeleteSelectionTarget(2, 3), 'clips');
});

test('resolveDeleteSelectionTarget falls back to clips when no tracks are selected', () => {
  assert.equal(resolveDeleteSelectionTarget(0, 2), 'clips');
});

test('resolveDeleteSelectionTarget returns none when nothing is selected', () => {
  assert.equal(resolveDeleteSelectionTarget(0, 0), 'none');
});
