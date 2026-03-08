import { useCallback } from 'react';
import { useGenerationStore } from '../store/generationStore';
import { useProjectStore } from '../store/projectStore';
import {
  generateAllTracks,
  generateSingleClipCover,
  generateClipWithContext,
  generateSingleClip,
  generateSingleClipRepaint,
} from '../services/generationPipeline';
import { loadAudioBlobByKey } from '../services/audioFileManager';

export function useGeneration() {
  const { jobs, isGenerating } = useGenerationStore();
  const setIsGenerating = useGenerationStore((s) => s.setIsGenerating);
  const project = useProjectStore((s) => s.project);
  const getClipById = useProjectStore((s) => s.getClipById);

  const generateAll = useCallback(async () => {
    if (!project || isGenerating) return;
    await generateAllTracks();
  }, [project, isGenerating]);

  const generateClip = useCallback(async (clipId: string) => {
    if (!project || isGenerating) return;
    await generateSingleClip(clipId);
  }, [project, isGenerating]);

  const generateClipWithSourceContext = useCallback(async (clipId: string, sourceClipId: string) => {
    if (!project || isGenerating) return;

    const sourceClip = getClipById(sourceClipId);
    const contextKey = sourceClip?.cumulativeMixKey ?? null;
    const contextEnd = sourceClip ? sourceClip.startTime + sourceClip.duration : null;
    if (!contextKey) {
      await generateSingleClip(clipId);
      return;
    }

    const contextBlob = await loadAudioBlobByKey(contextKey);
    if (!contextBlob) {
      await generateSingleClip(clipId);
      return;
    }

    setIsGenerating(true);
    try {
      await generateClipWithContext(clipId, contextBlob, contextEnd);
    } finally {
      setIsGenerating(false);
    }
  }, [project, isGenerating, getClipById, setIsGenerating]);

  const repaintClipRegion = useCallback(async (
    clipId: string,
    repaintStartTime: number,
    repaintEndTime: number,
  ) => {
    if (!project || isGenerating) return;
    await generateSingleClipRepaint(clipId, repaintStartTime, repaintEndTime);
  }, [project, isGenerating]);

  const coverClipWithReference = useCallback(async (
    clipId: string,
    referenceClipId: string,
    overrides?: {
      prompt?: string;
      lyrics?: string;
      coverStrength?: number;
    },
  ) => {
    if (!project || isGenerating) return;
    await generateSingleClipCover(clipId, referenceClipId, overrides);
  }, [project, isGenerating]);

  return {
    jobs,
    isGenerating,
    generateAll,
    generateClip,
    generateClipWithSourceContext,
    repaintClipRegion,
    coverClipWithReference,
  };
}
