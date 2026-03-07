import type { Track } from '../types/project';

/**
 * Return tracks sorted by ascending `order`.
 */
export function sortTracksByOrder(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => a.order - b.order);
}

/**
 * Move `draggedTrackId` to the position of `targetTrackId`.
 *
 * Preserves the existing order value set (including gaps) while reassigning
 * those values to the new visual sequence.
 */
export function reorderTracksByTarget(
  tracks: Track[],
  draggedTrackId: string,
  targetTrackId: string,
): Track[] {
  if (draggedTrackId === targetTrackId) return tracks;

  const orderedTracks = sortTracksByOrder(tracks);
  const draggedIndex = orderedTracks.findIndex((track) => track.id === draggedTrackId);
  const targetIndex = orderedTracks.findIndex((track) => track.id === targetTrackId);
  if (draggedIndex < 0 || targetIndex < 0) return tracks;

  const orderValues = orderedTracks.map((track) => track.order);
  const nextTracks = [...orderedTracks];
  const [draggedTrack] = nextTracks.splice(draggedIndex, 1);
  nextTracks.splice(targetIndex, 0, draggedTrack);

  return nextTracks.map((track, index) => {
    const nextOrder = orderValues[index];
    if (track.order === nextOrder) return track;
    return { ...track, order: nextOrder };
  });
}
