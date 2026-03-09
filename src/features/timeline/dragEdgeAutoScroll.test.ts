import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveHorizontalEdgeAutoScrollDelta,
  resolveVerticalEdgeAutoScrollDelta,
} from './dragEdgeAutoScroll.ts';

test('resolveHorizontalEdgeAutoScrollDelta returns positive delta near right edge', () => {
  const delta = resolveHorizontalEdgeAutoScrollDelta({
    pointerClientX: 492,
    viewportLeft: 100,
    viewportRight: 500,
    scrollLeft: 80,
    maxScrollLeft: 600,
    config: { edgeThresholdPx: 50, maxStepPx: 20 },
  });

  assert.equal(Math.round(delta), 17);
});

test('resolveHorizontalEdgeAutoScrollDelta returns negative delta near left edge', () => {
  const delta = resolveHorizontalEdgeAutoScrollDelta({
    pointerClientX: 106,
    viewportLeft: 100,
    viewportRight: 500,
    scrollLeft: 180,
    maxScrollLeft: 600,
    config: { edgeThresholdPx: 40, maxStepPx: 16 },
  });

  assert.equal(Math.round(delta), -14);
});

test('resolveHorizontalEdgeAutoScrollDelta returns zero inside safe zone', () => {
  const delta = resolveHorizontalEdgeAutoScrollDelta({
    pointerClientX: 280,
    viewportLeft: 100,
    viewportRight: 500,
    scrollLeft: 100,
    maxScrollLeft: 600,
  });

  assert.equal(delta, 0);
});

test('resolveHorizontalEdgeAutoScrollDelta clamps at scroll boundaries', () => {
  const leftDelta = resolveHorizontalEdgeAutoScrollDelta({
    pointerClientX: 0,
    viewportLeft: 100,
    viewportRight: 500,
    scrollLeft: 0,
    maxScrollLeft: 600,
    config: { edgeThresholdPx: 50, maxStepPx: 20 },
  });
  const rightDelta = resolveHorizontalEdgeAutoScrollDelta({
    pointerClientX: 600,
    viewportLeft: 100,
    viewportRight: 500,
    scrollLeft: 600,
    maxScrollLeft: 600,
    config: { edgeThresholdPx: 50, maxStepPx: 20 },
  });

  assert.equal(leftDelta, 0);
  assert.equal(rightDelta, 0);
});

test('resolveVerticalEdgeAutoScrollDelta returns positive delta near bottom edge', () => {
  const delta = resolveVerticalEdgeAutoScrollDelta({
    pointerClientY: 592,
    viewportTop: 100,
    viewportBottom: 600,
    scrollTop: 40,
    maxScrollTop: 800,
    config: { edgeThresholdPx: 50, maxStepPx: 20 },
  });

  assert.equal(Math.round(delta), 17);
});

test('resolveVerticalEdgeAutoScrollDelta returns negative delta near top edge', () => {
  const delta = resolveVerticalEdgeAutoScrollDelta({
    pointerClientY: 106,
    viewportTop: 100,
    viewportBottom: 600,
    scrollTop: 140,
    maxScrollTop: 800,
    config: { edgeThresholdPx: 40, maxStepPx: 16 },
  });

  assert.equal(Math.round(delta), -14);
});

test('resolveVerticalEdgeAutoScrollDelta clamps at scroll boundaries', () => {
  const upDelta = resolveVerticalEdgeAutoScrollDelta({
    pointerClientY: 0,
    viewportTop: 100,
    viewportBottom: 600,
    scrollTop: 0,
    maxScrollTop: 800,
    config: { edgeThresholdPx: 50, maxStepPx: 20 },
  });
  const downDelta = resolveVerticalEdgeAutoScrollDelta({
    pointerClientY: 700,
    viewportTop: 100,
    viewportBottom: 600,
    scrollTop: 800,
    maxScrollTop: 800,
    config: { edgeThresholdPx: 50, maxStepPx: 20 },
  });

  assert.equal(upDelta, 0);
  assert.equal(downDelta, 0);
});
