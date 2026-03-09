import { useCallback, useEffect, useRef, useState } from 'react';
import { useGenerationStore } from '../store/generationStore';
import {
  extractTrackToNewTracks,
  type ExtractTrackProgress,
  type ExtractTrackStemsResult,
} from '../services/stemExtractionPipeline';

export type ExtractToTracksDialogMode = 'closed' | 'confirm' | 'running' | 'result' | 'error';

interface UseExtractToTracksDialogOptions {
  sourceTrackId: string;
  sourceClipId?: string;
}

interface UseExtractToTracksDialogResult {
  canExtract: boolean;
  canStart: boolean;
  mode: ExtractToTracksDialogMode;
  progress: ExtractTrackProgress | null;
  result: ExtractTrackStemsResult | null;
  errorMessage: string | null;
  openConfirmDialog: () => void;
  closeDialog: () => void;
  confirmExtract: () => void;
}

export function useExtractToTracksDialog({
  sourceTrackId,
  sourceClipId,
}: UseExtractToTracksDialogOptions): UseExtractToTracksDialogResult {
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const isMountedRef = useRef(true);
  const [mode, setMode] = useState<ExtractToTracksDialogMode>('closed');
  const [progress, setProgress] = useState<ExtractTrackProgress | null>(null);
  const [result, setResult] = useState<ExtractTrackStemsResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const canExtract = !isGenerating && mode !== 'running';
  const canStart = mode === 'confirm' && !isGenerating;

  const openConfirmDialog = useCallback(() => {
    if (!canExtract) return;
    setProgress(null);
    setResult(null);
    setErrorMessage(null);
    setMode('confirm');
  }, [canExtract]);

  const closeDialog = useCallback(() => {
    if (mode === 'running') return;
    setMode('closed');
  }, [mode]);

  const confirmExtract = useCallback(() => {
    if (!canStart || mode === 'running') return;
    setProgress({
      phase: 'preparing',
      completed: 0,
      total: 1,
      currentTrackName: null,
    });
    setResult(null);
    setErrorMessage(null);
    setMode('running');

    void (async () => {
      try {
        const extractionResult = await extractTrackToNewTracks(sourceTrackId, sourceClipId, {
          onProgress: (nextProgress) => {
            if (!isMountedRef.current) return;
            setProgress(nextProgress);
          },
        });
        if (!isMountedRef.current) return;
        setResult(extractionResult);
        setMode('result');
      } catch (error) {
        if (!isMountedRef.current) return;
        const message = error instanceof Error ? error.message : 'Stem extraction failed';
        setErrorMessage(message);
        setMode('error');
      }
    })();
  }, [canStart, mode, sourceClipId, sourceTrackId]);

  return {
    canExtract,
    canStart,
    mode,
    progress,
    result,
    errorMessage,
    openConfirmDialog,
    closeDialog,
    confirmExtract,
  };
}
