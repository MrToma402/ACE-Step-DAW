import test from 'node:test';
import assert from 'node:assert/strict';
import { clampGroupMoveDelta } from './clipGroupMove.ts';

test('clampGroupMoveDelta keeps requested delta when all clips remain in bounds', () => {
  const delta = clampGroupMoveDelta(
    [
      { startTime: 4, duration: 3 },
      { startTime: 10, duration: 2 },
    ],
    1.5,
    30,
  );
  assert.equal(delta, 1.5);
});

test('clampGroupMoveDelta clamps leftward movement at timeline start', () => {
  const delta = clampGroupMoveDelta(
    [
      { startTime: 1, duration: 2 },
      { startTime: 6, duration: 2 },
    ],
    -5,
    30,
  );
  assert.equal(delta, -1);
});

test('clampGroupMoveDelta clamps rightward movement at timeline end', () => {
  const delta = clampGroupMoveDelta(
    [
      { startTime: 18, duration: 2 },
      { startTime: 16, duration: 4 },
    ],
    6,
    20,
  );
  assert.equal(delta, 0);
});
