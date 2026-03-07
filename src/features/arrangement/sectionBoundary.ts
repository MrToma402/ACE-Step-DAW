export const MIN_SECTION_DURATION_SECONDS = 0.5;

/**
 * Clamp a section boundary time so both adjacent sections keep a minimum duration.
 */
export function clampSectionBoundaryTime(
  nextBoundaryTime: number,
  leftSectionStart: number,
  rightSectionEnd: number,
  minSectionDuration: number = MIN_SECTION_DURATION_SECONDS,
): number {
  const minBoundary = leftSectionStart + minSectionDuration;
  const maxBoundary = rightSectionEnd - minSectionDuration;
  if (minBoundary > maxBoundary) {
    return (leftSectionStart + rightSectionEnd) / 2;
  }
  return Math.min(maxBoundary, Math.max(minBoundary, nextBoundaryTime));
}
