import test from 'node:test';
import assert from 'node:assert/strict';
import { getSectionColorTone } from './sectionColors.ts';

test('getSectionColorTone returns deterministic tones for a section id', () => {
  const first = getSectionColorTone('section-intro-1');
  const second = getSectionColorTone('section-intro-1');

  assert.deepEqual(second, first);
});

test('getSectionColorTone returns different base colors for different section ids', () => {
  const intro = getSectionColorTone('section-intro-1');
  const chorus = getSectionColorTone('section-chorus-1');

  assert.notEqual(intro.baseHex, chorus.baseHex);
});

test('getSectionColorTone returns rgba tone strings for UI styling', () => {
  const tone = getSectionColorTone('section-bridge-1');

  assert.match(tone.fill, /^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
  assert.match(tone.border, /^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
  assert.match(tone.label, /^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
});
