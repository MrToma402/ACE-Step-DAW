import type { SongSection, SectionTake } from '../../features/arrangement/types';
import type { Project, Clip } from '../../types/project';

export type ContinuityLevel = 'high' | 'medium' | 'low';

export interface ContinuityBoundaryMeter {
  fromSectionId: string;
  toSectionId: string;
  level: ContinuityLevel;
  label: string;
}

function parseTimeSignature(value?: string): number | null {
  if (!value) return null;
  const match = /^(\d+)/.exec(value.trim());
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstMetaClip(
  take: SectionTake | null,
  getClipById: (clipId: string) => Clip | undefined,
): Clip | null {
  if (!take) return null;
  for (const clipId of take.trackClipIds) {
    const clip = getClipById(clipId);
    if (clip?.inferredMetas) return clip;
  }
  return null;
}

export function buildSectionContinuityWarnings(
  section: SongSection,
  selectedTake: SectionTake | null,
  project: Project,
  getClipById: (clipId: string) => Clip | undefined,
): string[] {
  if (!selectedTake) return [];
  const warnings: string[] = [];
  const clips = selectedTake.trackClipIds
    .map((clipId) => getClipById(clipId))
    .filter((clip): clip is Clip => Boolean(clip));

  const bpmMetas = clips
    .map((clip) => clip.inferredMetas?.bpm)
    .filter((bpm): bpm is number => typeof bpm === 'number');
  if (bpmMetas.some((bpm) => Math.abs(bpm - project.bpm) > 8)) {
    warnings.push(`Detected BPM drift in "${section.name}" vs project tempo anchor.`);
  }

  const keyMetas = clips
    .map((clip) => clip.inferredMetas?.keyScale?.trim().toLowerCase())
    .filter((key): key is string => Boolean(key));
  if (keyMetas.some((key) => key !== project.keyScale.trim().toLowerCase())) {
    warnings.push(`Detected key mismatch in "${section.name}" relative to project key.`);
  }

  const timeSigMetas = clips
    .map((clip) => parseTimeSignature(clip.inferredMetas?.timeSignature))
    .filter((value): value is number => value != null);
  if (timeSigMetas.some((timeSig) => timeSig !== project.timeSignature)) {
    warnings.push(`Detected time-signature mismatch in "${section.name}".`);
  }

  return warnings;
}

export function buildBoundaryContinuityMeters(
  sections: SongSection[],
  selectedTakeBySectionId: Record<string, string | null>,
  takesBySectionId: Record<string, SectionTake[]>,
  getClipById: (clipId: string) => Clip | undefined,
): ContinuityBoundaryMeter[] {
  const meters: ContinuityBoundaryMeter[] = [];
  const sorted = [...sections].sort((a, b) => a.startTime - b.startTime);
  for (let index = 1; index < sorted.length; index += 1) {
    const from = sorted[index - 1];
    const to = sorted[index];
    const fromTakeId = selectedTakeBySectionId[from.id] ?? null;
    const toTakeId = selectedTakeBySectionId[to.id] ?? null;
    const fromTake = (takesBySectionId[from.id] ?? []).find((take) => take.id === fromTakeId) ?? null;
    const toTake = (takesBySectionId[to.id] ?? []).find((take) => take.id === toTakeId) ?? null;

    const fromClip = firstMetaClip(fromTake, getClipById);
    const toClip = firstMetaClip(toTake, getClipById);
    if (!fromClip || !toClip) {
      meters.push({
        fromSectionId: from.id,
        toSectionId: to.id,
        level: 'medium',
        label: 'Limited continuity data',
      });
      continue;
    }

    let mismatches = 0;
    const bpmA = fromClip.inferredMetas?.bpm;
    const bpmB = toClip.inferredMetas?.bpm;
    if (bpmA != null && bpmB != null && Math.abs(bpmA - bpmB) > 7) mismatches += 1;

    const keyA = fromClip.inferredMetas?.keyScale?.trim().toLowerCase();
    const keyB = toClip.inferredMetas?.keyScale?.trim().toLowerCase();
    if (keyA && keyB && keyA !== keyB) mismatches += 1;

    const tsA = parseTimeSignature(fromClip.inferredMetas?.timeSignature);
    const tsB = parseTimeSignature(toClip.inferredMetas?.timeSignature);
    if (tsA != null && tsB != null && tsA !== tsB) mismatches += 1;

    if (mismatches === 0) {
      meters.push({
        fromSectionId: from.id,
        toSectionId: to.id,
        level: 'high',
        label: 'Strong continuity',
      });
    } else if (mismatches === 1) {
      meters.push({
        fromSectionId: from.id,
        toSectionId: to.id,
        level: 'medium',
        label: 'Moderate continuity',
      });
    } else {
      meters.push({
        fromSectionId: from.id,
        toSectionId: to.id,
        level: 'low',
        label: 'Potential abrupt transition',
      });
    }
  }
  return meters;
}
