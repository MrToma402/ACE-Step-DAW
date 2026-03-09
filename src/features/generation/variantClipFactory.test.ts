import test from 'node:test';
import assert from 'node:assert/strict';
import type { Clip } from '../../types/project.ts';
import {
  buildVariantClipDraft,
  resolveAdditionalVariantClipCount,
  resolveSingleSelectedClipId,
} from './variantClipFactory.ts';

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 8,
    duration: 4,
    prompt: 'warm analog bassline',
    lyrics: '[Instrumental]',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    ...overrides,
  };
}

test('resolveSingleSelectedClipId returns only when exactly one clip is selected', () => {
  assert.equal(resolveSingleSelectedClipId(new Set()), null);
  assert.equal(resolveSingleSelectedClipId(new Set(['a', 'b'])), null);
  assert.equal(resolveSingleSelectedClipId(new Set(['only'])), 'only');
});

test('buildVariantClipDraft copies clip inputs and unlocks seed for variation', () => {
  const source = makeClip({
    arrangementSectionId: 'section-1',
    arrangementTakeId: 'take-1',
    bpm: 128,
    keyScale: 'A minor',
    timeSignature: 4,
    sampleMode: true,
    autoExpandPrompt: false,
    generationTaskType: 'text2music',
    ditModel: 'acestep-v15-turbo',
    lockedSeed: '123',
  });

  const draft = buildVariantClipDraft(source);

  assert.equal(draft.startTime, 8);
  assert.equal(draft.duration, 4);
  assert.equal(draft.prompt, 'warm analog bassline');
  assert.equal(draft.lyrics, '[Instrumental]');
  assert.equal(draft.arrangementSectionId, 'section-1');
  assert.equal(draft.arrangementTakeId, 'take-1');
  assert.equal(draft.bpm, 128);
  assert.equal(draft.keyScale, 'A minor');
  assert.equal(draft.timeSignature, 4);
  assert.equal(draft.sampleMode, true);
  assert.equal(draft.autoExpandPrompt, false);
  assert.equal(draft.generationTaskType, 'text2music');
  assert.equal(draft.ditModel, 'acestep-v15-turbo');
  assert.equal(draft.lockedSeed, null);
});

test('buildVariantClipDraft applies default sample/expand settings when unset', () => {
  const source = makeClip({
    sampleMode: undefined,
    autoExpandPrompt: undefined,
    generationTaskType: undefined,
    ditModel: undefined,
  });

  const draft = buildVariantClipDraft(source);

  assert.equal(draft.sampleMode, false);
  assert.equal(draft.autoExpandPrompt, true);
  assert.equal(draft.generationTaskType, undefined);
  assert.equal(draft.ditModel, null);
});

test('resolveAdditionalVariantClipCount includes source clip in requested total', () => {
  assert.equal(resolveAdditionalVariantClipCount(2), 1);
  assert.equal(resolveAdditionalVariantClipCount(4), 3);
  assert.equal(resolveAdditionalVariantClipCount(8), 7);
});

test('resolveAdditionalVariantClipCount clamps invalid counts to zero', () => {
  assert.equal(resolveAdditionalVariantClipCount(1), 0);
  assert.equal(resolveAdditionalVariantClipCount(0), 0);
  assert.equal(resolveAdditionalVariantClipCount(-3), 0);
  assert.equal(resolveAdditionalVariantClipCount(Number.NaN), 0);
});
