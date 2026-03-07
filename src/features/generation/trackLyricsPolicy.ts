import type { TrackName } from '../../types/project';

export interface TrackGenerationTextInputs {
  lyrics: string;
  instruction: string;
}

function isVocalTrack(trackName: TrackName): boolean {
  return trackName === 'vocals' || trackName === 'backing_vocals';
}

/**
 * Build final instruction + lyrics inputs for LEGO generation by track role.
 */
export function buildTrackGenerationTextInputs(
  trackName: TrackName,
  clipLyrics: string,
  baseInstruction: string,
): TrackGenerationTextInputs {
  if (isVocalTrack(trackName)) {
    return {
      lyrics: clipLyrics || '',
      instruction: baseInstruction,
    };
  }

  return {
    lyrics: (clipLyrics && clipLyrics.trim().length > 0) ? clipLyrics : '[Instrumental]',
    instruction: baseInstruction,
  };
}
