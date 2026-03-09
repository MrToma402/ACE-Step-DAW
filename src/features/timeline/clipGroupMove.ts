export interface GroupMoveClip {
  startTime: number;
  duration: number;
}

/**
 * Clamp a requested group move delta so all clips remain within timeline bounds.
 */
export function clampGroupMoveDelta(
  clips: GroupMoveClip[],
  requestedDelta: number,
  timelineDuration: number,
): number {
  if (clips.length === 0) return 0;
  const minDelta = Math.max(...clips.map((clip) => -clip.startTime));
  const maxDelta = Math.min(...clips.map((clip) => timelineDuration - clip.duration - clip.startTime));
  return Math.max(minDelta, Math.min(maxDelta, requestedDelta));
}
