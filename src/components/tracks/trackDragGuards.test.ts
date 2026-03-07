import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldBlockTrackDragForTagName } from './trackDragGuards.ts';

test('shouldBlockTrackDragForTagName blocks interactive controls', () => {
  assert.equal(shouldBlockTrackDragForTagName('input'), true);
  assert.equal(shouldBlockTrackDragForTagName('BUTTON'), true);
  assert.equal(shouldBlockTrackDragForTagName('select'), true);
  assert.equal(shouldBlockTrackDragForTagName('textarea'), true);
});

test('shouldBlockTrackDragForTagName allows non-control elements', () => {
  assert.equal(shouldBlockTrackDragForTagName('div'), false);
  assert.equal(shouldBlockTrackDragForTagName('span'), false);
  assert.equal(shouldBlockTrackDragForTagName(undefined), false);
});
