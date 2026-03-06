import { useCallback } from 'react';
import { useGenerationStore } from '../store/generationStore';
import { useProjectStore } from '../store/projectStore';
import { generateAllTracks, generateSingleClip } from '../services/generationPipeline';
import type { Project, Track, Clip } from '../types/project';

const GAP_EPSILON_SECONDS = 0.05;

function getClipEnd(clip: Clip): number {
  return clip.startTime + clip.duration;
}

function getTrackEnd(track: Track): number {
  if (track.clips.length === 0) return 0;
  return Math.max(...track.clips.map(getClipEnd));
}

function getSongEnd(project: Project): number {
  let maxEnd = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const clipEnd = getClipEnd(clip);
      if (clipEnd > maxEnd) maxEnd = clipEnd;
    }
  }
  return maxEnd;
}

export function useGeneration() {
  const { jobs, isGenerating } = useGenerationStore();
  const project = useProjectStore((s) => s.project);
  const getClipById = useProjectStore((s) => s.getClipById);
  const getTrackForClip = useProjectStore((s) => s.getTrackForClip);
  const addClip = useProjectStore((s) => s.addClip);
  const updateClip = useProjectStore((s) => s.updateClip);

  const generateAll = useCallback(async () => {
    if (!project || isGenerating) return;
    await generateAllTracks();
  }, [project, isGenerating]);

  const generateClip = useCallback(async (clipId: string) => {
    if (!project || isGenerating) return;
    const clip = getClipById(clipId);
    const track = getTrackForClip(clipId);
    let continuationClipId: string | null = null;

    if (clip && track) {
      const clipEnd = getClipEnd(clip);
      const trackEnd = getTrackEnd(track);
      const songEnd = getSongEnd(project);
      const isTailClip = Math.abs(clipEnd - trackEnd) <= GAP_EPSILON_SECONDS;
      const missingDuration = songEnd - trackEnd;

      if (isTailClip && missingDuration > GAP_EPSILON_SECONDS) {
        const shouldComplete = window.confirm(
          `Track "${track.displayName}" ends at ${trackEnd.toFixed(1)}s, but the song reaches ${songEnd.toFixed(1)}s.\n\n`
          + `Create and generate a continuation clip for the remaining ${missingDuration.toFixed(1)}s?`,
        );

        if (shouldComplete) {
          const continuationClip = addClip(track.id, {
            startTime: trackEnd,
            duration: missingDuration,
            prompt: clip.prompt,
            lyrics: clip.lyrics,
            arrangementSectionId: clip.arrangementSectionId,
            arrangementTakeId: clip.arrangementTakeId,
          });

          updateClip(continuationClip.id, {
            bpm: clip.bpm,
            keyScale: clip.keyScale,
            timeSignature: clip.timeSignature,
            sampleMode: clip.sampleMode,
            autoExpandPrompt: clip.autoExpandPrompt,
          });

          continuationClipId = continuationClip.id;
        }
      }
    }

    await generateSingleClip(clipId);

    if (continuationClipId) {
      const refreshedClip = getClipById(clipId);
      if (refreshedClip?.generationStatus === 'ready') {
        await generateSingleClip(continuationClipId);
      }
    }
  }, [project, isGenerating, getClipById, getTrackForClip, addClip, updateClip]);

  return { jobs, isGenerating, generateAll, generateClip };
}
