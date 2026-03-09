export interface DeleteTracksShortcutResolution {
  selectedTrackIds: ReadonlySet<string>;
  selectedClipIds: ReadonlySet<string>;
  resolveTrackIdForClip: (clipId: string) => string | null;
}

/**
 * Resolves which tracks should be removed when using the "delete tracks" shortcut.
 *
 * Priority:
 * 1) Explicitly selected tracks.
 * 2) Tracks that contain selected clips.
 */
export function resolveTracksForDeleteShortcut(
  resolution: DeleteTracksShortcutResolution,
): string[] {
  if (resolution.selectedTrackIds.size > 0) {
    return Array.from(resolution.selectedTrackIds);
  }

  if (resolution.selectedClipIds.size === 0) {
    return [];
  }

  const trackIds = new Set<string>();
  for (const clipId of resolution.selectedClipIds) {
    const trackId = resolution.resolveTrackIdForClip(clipId);
    if (trackId) {
      trackIds.add(trackId);
    }
  }
  return Array.from(trackIds);
}
