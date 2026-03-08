import test from 'node:test';
import assert from 'node:assert/strict';
import type { Clip, Project, Track } from '../types/project.ts';
import {
  collectRegenerationContextSources,
  getRegenerationContextEnd,
  resolveSourceWindow,
} from './regenerationContext.ts';

function makeClip(
  id: string,
  startTime: number,
  duration: number,
  status: Clip['generationStatus'] = 'ready',
  key: string | null = `${id}-iso`,
): Clip {
  return {
    id,
    trackId: '',
    startTime,
    duration,
    prompt: '',
    lyrics: '',
    generationStatus: status,
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: key,
    waveformPeaks: null,
  };
}

function makeTrack(
  id: string,
  clips: Clip[],
  options?: { muted?: boolean; soloed?: boolean; volume?: number; hidden?: boolean },
): Track {
  return {
    id,
    trackName: 'custom',
    displayName: id,
    color: '#fff',
    order: 0,
    volume: options?.volume ?? 0.8,
    muted: options?.muted ?? false,
    soloed: options?.soloed ?? false,
    hidden: options?.hidden ?? false,
    clips: clips.map((clip) => ({ ...clip, trackId: id })),
  };
}

function makeProject(tracks: Track[]): Project {
  return {
    id: 'p1',
    name: 'Test',
    createdAt: 0,
    updatedAt: 0,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 60,
    tracks,
    generationDefaults: {
      inferenceSteps: 20,
      guidanceScale: 4.5,
      shift: 2,
      thinking: false,
      model: '',
      useModal: true,
    },
  };
}

test('collectRegenerationContextSources excludes target clip (not whole track) and non-ready clips', () => {
  const trackA = makeTrack('a', [makeClip('a1', 0, 8)]);
  const targetTrack = makeTrack('target', [makeClip('t1', 2, 4), makeClip('t2', 8, 4)]);
  const trackB = makeTrack('b', [
    makeClip('b1', 4, 6, 'ready', 'b1-iso'),
    makeClip('b2', 10, 4, 'generating', 'b2-iso'),
    makeClip('b3', 14, 4, 'ready', null),
  ]);
  const project = makeProject([trackA, targetTrack, trackB]);

  const sources = collectRegenerationContextSources(project, 't1');

  assert.deepEqual(sources.map((source) => source.clipId), ['a1', 'b1', 't2']);
  assert.deepEqual(sources.map((source) => source.audioOffset), [0, 0, 0]);
  assert.deepEqual(sources.map((source) => source.playbackDuration), [8, 6, 4]);
});

test('collectRegenerationContextSources ignores muted and solo state', () => {
  const mutedTrack = makeTrack('muted', [makeClip('m1', 0, 8)], { muted: true });
  const soloTrack = makeTrack('solo', [makeClip('s1', 1, 4)], { soloed: true, volume: 0.6 });
  const nonSoloTrack = makeTrack('nonsolo', [makeClip('n1', 2, 4)]);
  const project = makeProject([mutedTrack, soloTrack, nonSoloTrack]);

  const sources = collectRegenerationContextSources(project, 'not-present');

  assert.deepEqual(sources.map((source) => source.clipId), ['m1', 's1', 'n1']);
});

test('collectRegenerationContextSources excludes hidden tracks', () => {
  const hiddenTrack = makeTrack('hidden', [makeClip('h1', 0, 8)], { hidden: true });
  const visibleTrack = makeTrack('visible', [makeClip('v1', 1, 4)]);
  const project = makeProject([hiddenTrack, visibleTrack]);

  const sources = collectRegenerationContextSources(project, 'not-present');

  assert.deepEqual(sources.map((source) => source.clipId), ['v1']);
});

test('getRegenerationContextEnd returns furthest clip end', () => {
  const sources = [
    {
      clipId: 'a', startTime: 0, endTime: 5, isolatedAudioKey: 'a', audioOffset: 0, playbackDuration: 5,
    },
    {
      clipId: 'b', startTime: 6, endTime: 14, isolatedAudioKey: 'b', audioOffset: 0, playbackDuration: 8,
    },
    {
      clipId: 'c', startTime: 10, endTime: 12, isolatedAudioKey: 'c', audioOffset: 0, playbackDuration: 2,
    },
  ];

  assert.equal(getRegenerationContextEnd(sources), 14);
  assert.equal(getRegenerationContextEnd([]), null);
});

test('collectRegenerationContextSources preserves clip trim offset and playback duration', () => {
  const trimmed: Clip = {
    ...makeClip('trim', 12, 3),
    audioOffset: 1.25,
  };
  const project = makeProject([
    makeTrack('target', [makeClip('target-1', 0, 8)]),
    makeTrack('ctx', [trimmed]),
  ]);

  const [source] = collectRegenerationContextSources(project, 'target-1');
  assert.equal(source.audioOffset, 1.25);
  assert.equal(source.playbackDuration, 3);
  assert.equal(source.endTime, 15);
});

test('collectRegenerationContextSources applies custom clip eligibility filter', () => {
  const project = makeProject([
    makeTrack('target', [makeClip('target-1', 0, 8)]),
    makeTrack('ctx', [makeClip('ctx-a', 0, 4), makeClip('ctx-b', 6, 2)]),
  ]);

  const sources = collectRegenerationContextSources(
    project,
    'target-1',
    (clipId) => clipId === 'ctx-b',
  );

  assert.deepEqual(sources.map((source) => source.clipId), ['ctx-b']);
});

test('collectRegenerationContextSources truncates future context at maxContextEndTime', () => {
  const project = makeProject([
    makeTrack('a', [makeClip('a1', 0, 8)]),
    makeTrack('target', [makeClip('t1', 10, 4)]),
    makeTrack('b', [makeClip('b1', 6, 10), makeClip('b2', 12, 4)]),
  ]);

  const sources = collectRegenerationContextSources(project, 't1', null, 10);

  assert.deepEqual(sources.map((source) => source.clipId), ['a1', 'b1']);
  assert.deepEqual(sources.map((source) => source.playbackDuration), [8, 4]);
  assert.deepEqual(sources.map((source) => source.endTime), [8, 10]);
});

test('collectRegenerationContextSources includes same-start clips and clamps to desired end time', () => {
  const project = makeProject([
    makeTrack('target', [makeClip('t1', 10, 4)]),
    makeTrack('ctx', [makeClip('c1', 10, 6), makeClip('c2', 12, 6)]),
  ]);

  const sources = collectRegenerationContextSources(project, 't1', null, 14);

  assert.deepEqual(sources.map((source) => source.clipId), ['c1', 'c2']);
  assert.deepEqual(sources.map((source) => source.playbackDuration), [4, 2]);
  assert.deepEqual(sources.map((source) => source.endTime), [14, 14]);
});

test('resolveSourceWindow truncates to decoded audio and skips empty windows', () => {
  const source = {
    clipId: 'x',
    startTime: 12,
    endTime: 20,
    isolatedAudioKey: 'x-iso',
    audioOffset: 1,
    playbackDuration: 8,
  };

  assert.deepEqual(resolveSourceWindow(source, 5), { startTime: 12, duration: 4 });
  assert.equal(resolveSourceWindow(source, 1), null);
});
