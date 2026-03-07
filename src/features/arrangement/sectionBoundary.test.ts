import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SECTION_DURATION_SECONDS,
  clampSectionBoundaryTime,
} from './sectionBoundary.ts';

test('clampSectionBoundaryTime keeps boundary inside allowed range', () => {
  const boundary = clampSectionBoundaryTime(12, 8, 20);

  assert.equal(boundary, 12);
});

test('clampSectionBoundaryTime clamps below and above min/max boundaries', () => {
  const minBoundary = 4 + MIN_SECTION_DURATION_SECONDS;
  const maxBoundary = 10 - MIN_SECTION_DURATION_SECONDS;

  assert.equal(clampSectionBoundaryTime(0, 4, 10), minBoundary);
  assert.equal(clampSectionBoundaryTime(99, 4, 10), maxBoundary);
});

test('clampSectionBoundaryTime falls back to midpoint when range is too small', () => {
  const boundary = clampSectionBoundaryTime(8, 0, 0.6, 0.5);

  assert.equal(boundary, 0.3);
});
