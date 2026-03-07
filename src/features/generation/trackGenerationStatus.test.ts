import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTrackGenerationStatus,
  estimateEtaSeconds,
  extractProgressPercent,
} from './trackGenerationStatus.ts';
import type { GenerationJob } from '../../store/generationStore.ts';

function makeJob(overrides: Partial<GenerationJob>): GenerationJob {
  return {
    id: 'job-1',
    clipId: 'clip-1',
    trackName: 'drums',
    status: 'generating',
    progress: 'Generating...',
    startedAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

test('extractProgressPercent parses percentage values from progress text', () => {
  assert.equal(extractProgressPercent('Step 3/10 (45%)'), 45);
  assert.equal(extractProgressPercent('101% complete'), 100);
  assert.equal(extractProgressPercent('No percentage here'), null);
});

test('estimateEtaSeconds estimates remaining seconds from elapsed time and percent', () => {
  const eta = estimateEtaSeconds(0, 50, 10_000);
  assert.equal(eta, 10);
});

test('buildTrackGenerationStatus includes progress, ETA, and extra-job count', () => {
  const jobs: GenerationJob[] = [
    makeJob({ id: 'job-a', clipId: 'clip-a', progress: 'rendering 50%', startedAt: 0 }),
    makeJob({ id: 'job-b', clipId: 'clip-b', status: 'queued', progress: 'Queued', startedAt: 1000 }),
  ];

  const status = buildTrackGenerationStatus(jobs, ['clip-a', 'clip-b'], 10_000);

  assert.ok(status);
  assert.equal(status?.emphasis, 'generating');
  assert.match(status?.message ?? '', /Generating · rendering 50% · ETA 00:10 · \+1 more/);
});

test('buildTrackGenerationStatus falls back to elapsed when percent is missing', () => {
  const jobs: GenerationJob[] = [
    makeJob({ progress: 'Warming up model', startedAt: 5_000 }),
  ];

  const status = buildTrackGenerationStatus(jobs, ['clip-1'], 17_000);

  assert.ok(status);
  assert.match(status?.message ?? '', /Generating · Warming up model · Elapsed 00:12/);
});

test('buildTrackGenerationStatus ignores jobs from other tracks', () => {
  const jobs: GenerationJob[] = [makeJob({ clipId: 'other-clip' })];

  const status = buildTrackGenerationStatus(jobs, ['clip-1'], 12_000);

  assert.equal(status, null);
});
