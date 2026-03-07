import type { Clip } from '../types/project';

interface ClipMusicalOverrides {
  bpm: Clip['bpm'];
  keyScale: Clip['keyScale'];
  timeSignature: Clip['timeSignature'];
}

/**
 * Resolve per-clip musical override values.
 *
 * `null` means "use project settings", while `'auto'` means ACE-Step infers.
 */
export function resolveClipMusicalOverrides(
  clip: Pick<Partial<Clip>, 'bpm' | 'keyScale' | 'timeSignature'>,
): ClipMusicalOverrides {
  return {
    bpm: clip.bpm === undefined ? null : clip.bpm,
    keyScale: clip.keyScale === undefined ? null : clip.keyScale,
    timeSignature: clip.timeSignature === undefined ? null : clip.timeSignature,
  };
}
