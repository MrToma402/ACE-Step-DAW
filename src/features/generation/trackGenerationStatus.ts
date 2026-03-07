import type { GenerationJob } from '../../store/generationStore.ts';

const ACTIVE_STATUSES: Array<GenerationJob['status']> = ['generating', 'processing', 'queued'];
const STATUS_PRIORITY: Record<GenerationJob['status'], number> = {
  generating: 0,
  processing: 1,
  queued: 2,
  error: 3,
  done: 4,
};

export interface TrackGenerationStatusView {
  message: string;
  emphasis: GenerationJob['status'];
}

function formatClock(totalSeconds: number): string {
  const clampedSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clampedSeconds / 60);
  const seconds = clampedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function extractProgressPercent(progressText: string): number | null {
  const match = progressText.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
}

export function estimateEtaSeconds(
  startedAtMs: number,
  percentComplete: number,
  nowMs: number,
): number | null {
  if (percentComplete <= 0 || percentComplete >= 100) return null;
  const elapsedSeconds = Math.max(1, (nowMs - startedAtMs) / 1000);
  return Math.max(0, Math.round((elapsedSeconds * (100 - percentComplete)) / percentComplete));
}

/**
 * Build one compact, track-level status line from active generation jobs.
 */
export function buildTrackGenerationStatus(
  jobs: GenerationJob[],
  trackClipIds: string[],
  nowMs: number,
): TrackGenerationStatusView | null {
  const clipIdSet = new Set(trackClipIds);
  const trackActiveJobs = jobs
    .filter((job) => ACTIVE_STATUSES.includes(job.status) && clipIdSet.has(job.clipId))
    .sort((a, b) => {
      const priorityDelta = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (priorityDelta !== 0) return priorityDelta;
      return a.startedAt - b.startedAt;
    });

  if (trackActiveJobs.length === 0) return null;

  const primaryJob = trackActiveJobs[0];
  const parts: string[] = [];
  const statusLabel =
    primaryJob.status === 'queued'
      ? 'Queued'
      : primaryJob.status === 'processing'
        ? 'Processing'
        : 'Generating';
  parts.push(statusLabel);

  const progressText = primaryJob.progress.trim();
  if (progressText.length > 0 && progressText.toLowerCase() !== statusLabel.toLowerCase()) {
    parts.push(progressText);
  }

  const progressPercent = extractProgressPercent(progressText);
  if (progressPercent !== null) {
    const etaSeconds = estimateEtaSeconds(primaryJob.startedAt, progressPercent, nowMs);
    if (etaSeconds !== null) {
      parts.push(`ETA ${formatClock(etaSeconds)}`);
    }
  } else if (primaryJob.status !== 'queued') {
    const elapsedSeconds = Math.max(0, Math.round((nowMs - primaryJob.startedAt) / 1000));
    parts.push(`Elapsed ${formatClock(elapsedSeconds)}`);
  }

  if (trackActiveJobs.length > 1) {
    parts.push(`+${trackActiveJobs.length - 1} more`);
  }

  return {
    message: parts.join(' · '),
    emphasis: primaryJob.status,
  };
}
