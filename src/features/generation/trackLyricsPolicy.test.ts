import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrackGenerationTextInputs } from './trackLyricsPolicy.ts';

test('non-vocal tracks default empty lyrics to [Instrumental] and keep instruction unchanged', () => {
  const result = buildTrackGenerationTextInputs(
    'bass',
    '',
    'Generate the BASS track based on the audio context.',
  );

  assert.equal(result.lyrics, '[Instrumental]');
  assert.equal(result.instruction, 'Generate the BASS track based on the audio context.');
});

test('non-vocal tracks preserve provided lyrics and keep instruction unchanged', () => {
  const result = buildTrackGenerationTextInputs(
    'guitar',
    '[Instrumental]\n[Bridge]',
    'Generate the GUITAR track based on the audio context.',
  );

  assert.equal(result.lyrics, '[Instrumental]\n[Bridge]');
  assert.equal(result.instruction, 'Generate the GUITAR track based on the audio context.');
});

test('vocals track keeps user lyrics and does not append instrumental guardrail', () => {
  const baseInstruction = 'Generate the VOCALS track based on the audio context.';
  const result = buildTrackGenerationTextInputs(
    'vocals',
    '[Verse]\nHello',
    baseInstruction,
  );

  assert.equal(result.lyrics, '[Verse]\nHello');
  assert.equal(result.instruction, baseInstruction);
});

test('backing vocals track keeps empty lyrics unchanged', () => {
  const baseInstruction = 'Generate the BACKING VOCALS track based on the audio context.';
  const result = buildTrackGenerationTextInputs(
    'backing_vocals',
    '',
    baseInstruction,
  );

  assert.equal(result.lyrics, '');
  assert.equal(result.instruction, baseInstruction);
});
