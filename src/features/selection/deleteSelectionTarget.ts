export type DeleteSelectionTarget = 'none' | 'tracks' | 'clips';

/**
 * Resolve delete shortcut target with explicit clip-first priority.
 */
export function resolveDeleteSelectionTarget(
  selectedTrackCount: number,
  selectedClipCount: number,
): DeleteSelectionTarget {
  if (selectedClipCount > 0) return 'clips';
  if (selectedTrackCount > 0) return 'tracks';
  return 'none';
}
