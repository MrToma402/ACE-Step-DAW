import type { Clip } from '../../types/project';

export type NewClipDraft = Omit<
  Clip,
  'id' | 'trackId' | 'generationStatus' | 'generationJobId' | 'cumulativeMixKey' | 'isolatedAudioKey' | 'waveformPeaks'
>;

export const VARIANT_BATCH_OPTIONS = [2, 4, 8] as const;

export function resolveSingleSelectedClipId(selectedClipIds: ReadonlySet<string>): string | null {
  if (selectedClipIds.size !== 1) return null;
  for (const clipId of selectedClipIds) {
    return clipId;
  }
  return null;
}

export function buildVariantClipDraft(sourceClip: Clip): NewClipDraft {
  return {
    startTime: sourceClip.startTime,
    duration: sourceClip.duration,
    arrangementSectionId: sourceClip.arrangementSectionId,
    arrangementTakeId: sourceClip.arrangementTakeId,
    prompt: sourceClip.prompt,
    lyrics: sourceClip.lyrics,
    bpm: sourceClip.bpm,
    keyScale: sourceClip.keyScale,
    timeSignature: sourceClip.timeSignature,
    sampleMode: sourceClip.sampleMode ?? false,
    autoExpandPrompt: sourceClip.autoExpandPrompt ?? true,
    generationTaskType: sourceClip.generationTaskType,
    ditModel: sourceClip.ditModel ?? null,
    // Variants should be diverse by default.
    lockedSeed: null,
  };
}

/**
 * Returns how many additional variant clips should be created on new tracks.
 * The source clip itself is always treated as the first variant in a batch.
 */
export function resolveAdditionalVariantClipCount(requestedVariantCount: number): number {
  if (!Number.isFinite(requestedVariantCount)) return 0;
  return Math.max(0, Math.floor(requestedVariantCount) - 1);
}
