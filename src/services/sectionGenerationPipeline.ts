import { v4 as uuidv4 } from 'uuid';
import type { SongSection } from '../features/arrangement/types';
import type { Clip } from '../types/project';
import { useGenerationStore } from '../store/generationStore';
import { useArrangementStore } from '../store/arrangementStore';
import { useProjectStore } from '../store/projectStore';
import { loadAudioBlobByKey } from './audioFileManager';
import { buildContinuityPrompt } from './continuityBuilder';
import { generateClipWithContext } from './generationPipeline';

const runningSectionIds = new Set<string>();
const canceledSectionIds = new Set<string>();

interface SectionReferenceContext {
  blob: Blob | null;
  endTime: number | null;
}

function isVocalTrack(trackName: string): boolean {
  return trackName === 'vocals' || trackName === 'backing_vocals';
}

function getSortedSections(projectId: string): SongSection[] {
  const ws = useArrangementStore.getState().workspacesByProjectId[projectId];
  if (!ws) return [];
  return [...ws.sections].sort((a, b) => a.startTime - b.startTime);
}

function getPreviousSection(projectId: string, section: SongSection): SongSection | null {
  const sorted = getSortedSections(projectId);
  const idx = sorted.findIndex((candidate) => candidate.id === section.id);
  if (idx <= 0) return null;
  return sorted[idx - 1];
}

async function getPreviousSectionReferenceContext(
  projectId: string,
  section: SongSection,
): Promise<SectionReferenceContext> {
  const ws = useArrangementStore.getState().workspacesByProjectId[projectId];
  if (!ws) return { blob: null, endTime: null };
  const prevSection = getPreviousSection(projectId, section);
  if (!prevSection) return { blob: null, endTime: null };
  const selectedTakeId = ws.selectedTakeBySectionId[prevSection.id] ?? null;
  if (!selectedTakeId) return { blob: null, endTime: null };
  const take = (ws.takesBySectionId[prevSection.id] ?? []).find((item) => item.id === selectedTakeId);
  if (!take) return { blob: null, endTime: null };

  const projectStore = useProjectStore.getState();
  let furthestClip: Clip | null = null;
  for (const clipId of take.trackClipIds) {
    const clip = projectStore.getClipById(clipId);
    const track = projectStore.getTrackForClip(clipId);
    if (track?.hidden) continue;
    if (!clip?.cumulativeMixKey) continue;
    if (!furthestClip) {
      furthestClip = clip;
      continue;
    }
    const currentEnd = clip.startTime + clip.duration;
    const furthestEnd = furthestClip.startTime + furthestClip.duration;
    if (currentEnd > furthestEnd) {
      furthestClip = clip;
    }
  }
  if (!furthestClip?.cumulativeMixKey) {
    return { blob: null, endTime: null };
  }
  return {
    blob: await loadAudioBlobByKey(furthestClip.cumulativeMixKey) ?? null,
    endTime: furthestClip.startTime + furthestClip.duration,
  };
}

function isCanceled(sectionId: string): boolean {
  return canceledSectionIds.has(sectionId);
}

export function isSectionGenerationRunning(sectionId: string): boolean {
  return runningSectionIds.has(sectionId);
}

export function cancelSectionGeneration(sectionId: string): void {
  if (!runningSectionIds.has(sectionId)) return;
  canceledSectionIds.add(sectionId);
}

export async function generateSection(sectionId: string): Promise<void> {
  const project = useProjectStore.getState().project;
  if (!project || runningSectionIds.has(sectionId)) return;
  const ws = useArrangementStore.getState().workspacesByProjectId[project.id];
  if (!ws) return;
  const section = ws.sections.find((item) => item.id === sectionId);
  if (!section || section.locked) return;

  runningSectionIds.add(section.id);
  canceledSectionIds.delete(section.id);
  useGenerationStore.getState().setIsGenerating(true);
  useArrangementStore.getState().setSectionStatus(project.id, section.id, 'running');

  try {
    const plan = ws.generationPlanBySectionId[section.id] ?? {
      enabledTrackIds: project.tracks.map((track) => track.id),
      styleLock: ws.vocalProfile.enabled ? ('strict' as const) : ('balanced' as const),
      takesPerSection: 3,
    };

    const takesToGenerate = Math.max(1, Math.min(5, plan.takesPerSection));
    const orderedTracks = useProjectStore
      .getState()
      .getTracksInGenerationOrder()
      .filter((track) => plan.enabledTrackIds.includes(track.id));

    for (let takeIndex = 0; takeIndex < takesToGenerate; takeIndex += 1) {
      if (isCanceled(section.id)) break;
      const takeId = uuidv4();
      const clipIds: string[] = [];
      const initialContext = await getPreviousSectionReferenceContext(project.id, section);
      let previousBlob = initialContext.blob;
      let previousContextEnd = initialContext.endTime;
      let failedMessage: string | null = null;

      for (const track of orderedTracks) {
        if (isCanceled(section.id)) break;
        const previousSectionSummary = getPreviousSection(project.id, section)?.name ?? null;
        const sectionTaskPrompt = ws.vocalProfile.enabled && !isVocalTrack(track.trackName)
          ? `Write the ${track.displayName} accompaniment while preserving lead vocal clarity and language identity.`
          : `Write the ${track.displayName} part for this section.`;
        const prompt = buildContinuityPrompt({
          globalBrief: `Song project "${project.name}"`,
          section,
          sectionPrompt: sectionTaskPrompt,
          previousSectionSummary,
          languageHint: ws.vocalProfile.languageHint || null,
          bpm: project.bpm,
          keyScale: project.keyScale,
          timeSignature: project.timeSignature,
          styleLock: plan.styleLock,
        });

        const clip = useProjectStore.getState().addClip(track.id, {
          startTime: section.startTime,
          duration: Math.max(0.5, section.endTime - section.startTime),
          prompt,
          lyrics:
            isVocalTrack(track.trackName) && !(ws.vocalProfile.enabled && !ws.vocalProfile.preserveLyrics)
              ? section.lyricBlock
              : '',
          arrangementSectionId: section.id,
          arrangementTakeId: takeId,
        });
        clipIds.push(clip.id);

        try {
          previousBlob = await generateClipWithContext(clip.id, previousBlob, previousContextEnd);
          previousContextEnd = Math.max(
            previousContextEnd ?? Number.NEGATIVE_INFINITY,
            clip.startTime + clip.duration,
          );
        } catch (error) {
          failedMessage = error instanceof Error ? error.message : 'Section generation failed';
          break;
        }
      }

      const takeStatus = isCanceled(section.id) ? 'canceled' : failedMessage ? 'failed' : 'succeeded';
      useArrangementStore.getState().upsertTake(project.id, section.id, {
        id: takeId,
        sectionId: section.id,
        trackClipIds: clipIds,
        score: null,
        selected: false,
        status: takeStatus,
        note: '',
        createdAt: Date.now(),
        errorMessage: failedMessage ?? undefined,
      });

      const latestWs = useArrangementStore.getState().workspacesByProjectId[project.id];
      if (!latestWs.selectedTakeBySectionId[section.id] && takeStatus === 'succeeded') {
        useArrangementStore.getState().setTakeSelected(project.id, section.id, takeId);
      }
    }

    if (isCanceled(section.id)) {
      useArrangementStore.getState().setSectionStatus(project.id, section.id, 'canceled');
      return;
    }

    const currentWs = useArrangementStore.getState().workspacesByProjectId[project.id];
    const sectionTakes = currentWs.takesBySectionId[section.id] ?? [];
    const hasSuccess = sectionTakes.some((take) => take.status === 'succeeded');
    useArrangementStore
      .getState()
      .setSectionStatus(project.id, section.id, hasSuccess ? 'succeeded' : 'failed');
  } finally {
    runningSectionIds.delete(section.id);
    canceledSectionIds.delete(section.id);
    useGenerationStore.getState().setIsGenerating(false);
  }
}

export async function generateAllSections(): Promise<void> {
  const project = useProjectStore.getState().project;
  if (!project) return;
  const orderedSections = getSortedSections(project.id);
  for (const section of orderedSections) {
    if (section.locked) continue;
    await generateSection(section.id);
  }
}
