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

/**
 * Move multiple tracks as one block relative to `targetTrackId`.
 *
 * Preserves the selected tracks' internal visual order while reassigning the
 * existing order value set (including gaps) to the new visual sequence.
 */
export function reorderTrackBlockByTarget(
  tracks: Track[],
  draggedTrackIds: string[],
  targetTrackId: string,
): Track[] {
  if (draggedTrackIds.length === 0) return tracks;

  const orderedTracks = sortTracksByOrder(tracks);
  const draggedIdSet = new Set(draggedTrackIds);
  if (draggedIdSet.has(targetTrackId)) return tracks;

  const targetIndex = orderedTracks.findIndex((track) => track.id === targetTrackId);
  if (targetIndex < 0) return tracks;

  const selectedTracks = orderedTracks.filter((track) => draggedIdSet.has(track.id));
  if (selectedTracks.length === 0) return tracks;

  const firstSelectedIndex = orderedTracks.findIndex((track) => draggedIdSet.has(track.id));
  if (firstSelectedIndex < 0) return tracks;

  const selectedBeforeTarget = orderedTracks.reduce((count, track, index) => {
    if (index < targetIndex && draggedIdSet.has(track.id)) return count + 1;
    return count;
  }, 0);

  const remainingTracks = orderedTracks.filter((track) => !draggedIdSet.has(track.id));
  const targetIndexInRemaining = targetIndex - selectedBeforeTarget;
  if (targetIndexInRemaining < 0 || targetIndexInRemaining >= remainingTracks.length) return tracks;

  const insertIndex = firstSelectedIndex < targetIndex
    ? targetIndexInRemaining + 1
    : targetIndexInRemaining;

  const nextTracks = [...remainingTracks];
  nextTracks.splice(insertIndex, 0, ...selectedTracks);

  const orderValues = orderedTracks.map((track) => track.order);
  return nextTracks.map((track, index) => {
    const nextOrder = orderValues[index];
    if (track.order === nextOrder) return track;
    return { ...track, order: nextOrder };
  });
}
