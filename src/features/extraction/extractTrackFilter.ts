import { TRACK_NAMES } from '../../constants/tracks';
import type { TrackName } from '../../types/project';

const EXCLUDED_ALWAYS = new Set<TrackName>(['complete']);
const EXCLUDED_FOR_COMPLETE_SOURCE = new Set<TrackName>(['vocals', 'backing_vocals']);

/**
 * Resolve extract targets for the source track type.
 * Complete-source extraction skips vocal stems by design.
 */
export function resolveExtractTrackNames(sourceTrackName: TrackName): TrackName[] {
  const baseTrackNames = TRACK_NAMES.filter(
    (name): name is TrackName => !EXCLUDED_ALWAYS.has(name),
  );
  if (sourceTrackName !== 'complete') {
    return baseTrackNames;
  }
  return baseTrackNames.filter((name) => !EXCLUDED_FOR_COMPLETE_SOURCE.has(name));
}
