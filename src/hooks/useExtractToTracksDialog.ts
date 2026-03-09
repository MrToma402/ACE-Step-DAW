import { useCallback } from 'react';
import { useGenerationStore } from '../store/generationStore';
import type { ExtractTrackProgress, ExtractTrackStemsResult } from '../services/stemExtractionPipeline';
import { useExtractToTracksStatusStore } from '../store/extractToTracksStatusStore';

export type ExtractToTracksDialogMode = 'closed' | 'confirm' | 'running' | 'result' | 'error';

interface UseExtractToTracksDialogOptions {
  sourceTrackId: string;
  sourceClipId?: string;
  sourceLabel?: string;
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

export function useExtractToTracksDialog({
  sourceTrackId,
  sourceClipId,
  sourceLabel,
}: UseExtractToTracksDialogOptions): UseExtractToTracksDialogResult {
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const mode = useExtractToTracksStatusStore((s) => s.mode);
  const progress = useExtractToTracksStatusStore((s) => s.progress);
  const result = useExtractToTracksStatusStore((s) => s.result);
  const errorMessage = useExtractToTracksStatusStore((s) => s.errorMessage);
  const startExtraction = useExtractToTracksStatusStore((s) => s.startExtraction);
  const cancelExtraction = useExtractToTracksStatusStore((s) => s.cancelExtraction);
  const closeStatus = useExtractToTracksStatusStore((s) => s.closeStatus);

  const canExtract = !isGenerating && mode !== 'running';
  const canStart = canExtract;
  const canCancel = mode === 'running';

  const openConfirmDialog = useCallback(() => {
    if (!canExtract) return;
    void startExtraction({ sourceTrackId, sourceClipId, sourceLabel });
  }, [canExtract, sourceClipId, sourceLabel, sourceTrackId, startExtraction]);

  const closeDialog = useCallback(() => {
    closeStatus();
  }, [closeStatus]);

  const cancelExtract = useCallback(() => {
    cancelExtraction();
  }, [cancelExtraction]);

  const confirmExtract = useCallback(() => {
    openConfirmDialog();
  }, [openConfirmDialog]);

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
