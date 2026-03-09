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
  canCancel: boolean;
  mode: ExtractToTracksDialogMode;
  progress: ExtractTrackProgress | null;
  result: ExtractTrackStemsResult | null;
  errorMessage: string | null;
  openConfirmDialog: () => void;
  closeDialog: () => void;
  confirmExtract: () => void;
  cancelExtract: () => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useExtractToTracksDialog({
  sourceTrackId,
  sourceClipId,
}: UseExtractToTracksDialogOptions): UseExtractToTracksDialogResult {
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
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
  const canCancel = mode === 'running';

  const openConfirmDialog = useCallback(() => {
    if (!canExtract) return;
    setProgress(null);
    setResult(null);
    setErrorMessage(null);
    setMode('confirm');
  }, [canExtract]);

  const closeDialog = useCallback(() => {
    if (mode === 'running') {
      abortRef.current?.abort();
      abortRef.current = null;
    }
    setMode('closed');
  }, [mode]);

  const cancelExtract = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMode('closed');
  }, []);

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
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const extractionResult = await extractTrackToNewTracks(sourceTrackId, sourceClipId, {
          signal: controller.signal,
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
        if (isAbortError(error)) {
          setMode('closed');
          return;
        }
        const message = error instanceof Error ? error.message : 'Stem extraction failed';
        setErrorMessage(message);
        setMode('error');
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    })();
  }, [canStart, mode, sourceClipId, sourceTrackId]);

  return {
    canExtract,
    canStart,
    canCancel,
    mode,
    progress,
    result,
    errorMessage,
    openConfirmDialog,
    closeDialog,
    confirmExtract,
    cancelExtract,
  };
}
