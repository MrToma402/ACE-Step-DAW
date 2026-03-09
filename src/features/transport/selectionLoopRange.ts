import type { Project } from '../../types/project';
import type { PlaybackScope } from '../../store/transportStore';

export interface SelectionLoopRange {
  start: number;
  end: number;
}

export function getSelectionLoopRange(
  playbackScope: PlaybackScope,
  project: Project | null,
): SelectionLoopRange | null {
  if (playbackScope.type !== 'selection' || !playbackScope.loop || !project) return null;

  const selectedClipIds = new Set(playbackScope.clipIds);
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (!selectedClipIds.has(clip.id)) continue;
      start = Math.min(start, clip.startTime);
      end = Math.max(end, clip.startTime + clip.duration);
    }
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}
