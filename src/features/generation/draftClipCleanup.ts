import type { Clip } from '../../types/project';

/**
 * Return true when a clip is an untouched draft placeholder created from timeline click/drag.
 */
export function isDisposableDraftClip(clip: Clip | null | undefined): boolean {
  if (!clip) return false;
  const hasPrompt = clip.prompt.trim().length > 0;
  const hasLyrics = clip.lyrics.trim().length > 0;
  const hasAudio = Boolean(clip.cumulativeMixKey || clip.isolatedAudioKey);
  const hasWaveform = Array.isArray(clip.waveformPeaks) && clip.waveformPeaks.length > 0;
  const hasInferredMetas = Boolean(clip.inferredMetas);

  return (
    clip.generationStatus === 'empty'
    && !hasPrompt
    && !hasLyrics
    && !hasAudio
    && !hasWaveform
    && !hasInferredMetas
  );
}
