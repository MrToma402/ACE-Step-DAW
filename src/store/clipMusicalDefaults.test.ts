import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveClipMusicalOverrides } from './clipMusicalDefaults.ts';

test('resolveClipMusicalOverrides defaults undefined values to project-mode null', () => {
  const resolved = resolveClipMusicalOverrides({});

  assert.equal(resolved.bpm, null);
  assert.equal(resolved.keyScale, null);
  assert.equal(resolved.timeSignature, null);
});

test('resolveClipMusicalOverrides preserves explicit auto inference values', () => {
  const resolved = resolveClipMusicalOverrides({
    bpm: 'auto',
    keyScale: 'auto',
    timeSignature: 'auto',
  });

  assert.equal(resolved.bpm, 'auto');
  assert.equal(resolved.keyScale, 'auto');
  assert.equal(resolved.timeSignature, 'auto');
});

test('resolveClipMusicalOverrides preserves manual override values', () => {
  const resolved = resolveClipMusicalOverrides({
    bpm: 138,
    keyScale: 'D major',
    timeSignature: 3,
  });

  assert.equal(resolved.bpm, 138);
  assert.equal(resolved.keyScale, 'D major');
  assert.equal(resolved.timeSignature, 3);
});
