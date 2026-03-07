import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLegoPromptContent } from './legoPromptBuilder.ts';
import type { Clip, Track } from '../types/project.ts';

function makeTrack(overrides?: Partial<Track>): Track {
  return {
    id: 'track-1',
    trackName: 'woodwinds',
    displayName: 'Woodwinds',
    color: '#ffffff',
    order: 1,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: [],
    ...overrides,
  };
}

function makeClip(prompt: string): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 30,
    prompt,
    lyrics: '',
    generationStatus: 'empty',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
  };
}

test('buildLegoPromptContent keeps user brief without instrument anchor', () => {
  const result = buildLegoPromptContent({
    clip: makeClip('woodwinds.'),
    track: makeTrack(),
  });

  assert.ok(!result.prompt.includes('Instrument anchor:'));
  assert.ok(result.prompt.includes('woodwinds.'));
  assert.ok(!result.prompt.includes('User brief:'));
});

test('buildLegoPromptContent keeps descriptive user briefs', () => {
  const result = buildLegoPromptContent({
    clip: makeClip('expressive low-register clarinet countermelody with short rests'),
    track: makeTrack(),
  });

  assert.ok(result.prompt.includes('expressive low-register clarinet countermelody with short rests.'));
});

test('buildLegoPromptContent keeps raw user brief content', () => {
  const result = buildLegoPromptContent({
    clip: makeClip('110.0 bpm, electric, bass, loops, G# min keyscale, 4/4'),
    track: makeTrack({ trackName: 'bass', displayName: 'Bass' }),
  });

  assert.ok(result.prompt.includes('110.0 bpm, electric, bass, loops, G# min keyscale, 4/4.'));
});

test('buildLegoPromptContent does not include tempo/key/time anchors in caption', () => {
  const result = buildLegoPromptContent({
    clip: makeClip('tight groove'),
    track: makeTrack({ trackName: 'bass', displayName: 'Bass' }),
  });

  assert.ok(!result.prompt.includes('Tempo anchor:'));
  assert.ok(!result.prompt.includes('Key anchor:'));
  assert.ok(!result.prompt.includes('Time signature anchor:'));
});

test('buildLegoPromptContent keeps instruction minimal with only track name', () => {
  const result = buildLegoPromptContent({
    clip: makeClip(''),
    track: makeTrack(),
  });

  assert.equal(result.instruction, 'WOODWINDS');
});
