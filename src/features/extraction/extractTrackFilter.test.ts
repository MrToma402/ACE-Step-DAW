import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveExtractTrackNames } from './extractTrackFilter.ts';

test('resolveExtractTrackNames keeps vocal stems for non-complete sources', () => {
  const extractNames = resolveExtractTrackNames('drums');
  assert.ok(extractNames.includes('vocals'));
  assert.ok(extractNames.includes('backing_vocals'));
  assert.ok(!extractNames.includes('complete'));
});

test('resolveExtractTrackNames excludes vocal stems for complete source', () => {
  const extractNames = resolveExtractTrackNames('complete');
  assert.ok(!extractNames.includes('vocals'));
  assert.ok(!extractNames.includes('backing_vocals'));
  assert.ok(!extractNames.includes('complete'));
  assert.ok(extractNames.includes('drums'));
});
