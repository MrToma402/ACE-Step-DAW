import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLaneEmptyDragAction } from './laneEmptyDragAction.ts';

test('resolveLaneEmptyDragAction returns createClip when drag did not move', () => {
  assert.equal(resolveLaneEmptyDragAction(false), 'createClip');
});

test('resolveLaneEmptyDragAction returns selectClips when drag moved', () => {
  assert.equal(resolveLaneEmptyDragAction(true), 'selectClips');
});
