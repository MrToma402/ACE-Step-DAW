import type { Clip } from '../../types/project';

const DEFAULT_GAP_EPSILON_SECONDS = 0.05;

export type MergeCandidateClip = Pick<Clip, 'id' | 'trackId' | 'startTime' | 'duration'>;

export interface ClipMergePlan {
  trackId: string;
  orderedClipIds: string[];
  startTime: number;
  endTime: number;
}

export function buildClipMergePlan(
  clips: MergeCandidateClip[],
  gapEpsilonSeconds: number = DEFAULT_GAP_EPSILON_SECONDS,
): ClipMergePlan | null {
  if (clips.length < 2) return null;
  const trackId = clips[0]?.trackId;
  if (!trackId) return null;
  if (clips.some((clip) => clip.trackId !== trackId)) return null;

  const ordered = [...clips].sort((a, b) => {
    const startDelta = a.startTime - b.startTime;
    if (Math.abs(startDelta) > 0.0001) return startDelta;
    return (a.startTime + a.duration) - (b.startTime + b.duration);
  });
  let currentEnd = ordered[0].startTime + ordered[0].duration;

  for (let i = 1; i < ordered.length; i++) {
    const clip = ordered[i];
    if (clip.startTime > currentEnd + gapEpsilonSeconds) return null;
    const clipEnd = clip.startTime + clip.duration;
    if (clipEnd > currentEnd) currentEnd = clipEnd;
  }

  return {
    trackId,
    orderedClipIds: ordered.map((clip) => clip.id),
    startTime: ordered[0].startTime,
    endTime: currentEnd,
  };
}
