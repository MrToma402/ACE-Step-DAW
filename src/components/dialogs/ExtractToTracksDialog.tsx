import { TRACK_CATALOG } from '../../constants/tracks';
import type { TrackName } from '../../types/project';
import type {
  ExtractTrackProgress,
  ExtractTrackStemsResult,
} from '../../services/stemExtractionPipeline';
import type { ExtractToTracksDialogMode } from '../../hooks/useExtractToTracksDialog';

interface ExtractToTracksDialogProps {
  mode: ExtractToTracksDialogMode;
  sourceLabel: string;
  canStart: boolean;
  progress: ExtractTrackProgress | null;
  result: ExtractTrackStemsResult | null;
  errorMessage: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

function trackDisplayName(trackName: TrackName): string {
  return TRACK_CATALOG[trackName]?.displayName ?? trackName;
}

export function ExtractToTracksDialog({
  mode,
  sourceLabel,
  canStart,
  progress,
  result,
  errorMessage,
  onClose,
  onConfirm,
}: ExtractToTracksDialogProps) {
  if (mode === 'closed') return null;

  const isRunning = mode === 'running';
  const createdCount = result?.createdTrackNames.length ?? 0;
  const skippedCount = result?.skippedTrackNames.length ?? 0;
  const failedCount = result?.failedTrackNames.length ?? 0;
  const progressTotal = Math.max(1, progress?.total ?? 1);
  const progressCompleted = Math.max(0, Math.min(progress?.completed ?? 0, progressTotal));
  const progressPct = Math.round((progressCompleted / progressTotal) * 100);
  const currentTrackLabel = progress?.currentTrackName
    ? trackDisplayName(progress.currentTrackName)
    : null;
  const statusLabel = progress?.phase === 'preparing'
    ? 'Preparing source audio...'
    : currentTrackLabel
      ? `Extracting ${currentTrackLabel}...`
      : 'Extracting stems...';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget || isRunning) return;
        onClose();
      }}
    >
      <div className="w-[440px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">
            {mode === 'confirm' && 'Extract To Tracks'}
            {mode === 'running' && 'Extracting Stems'}
            {mode === 'result' && 'Extraction Complete'}
            {mode === 'error' && 'Extraction Failed'}
          </h2>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          {mode === 'confirm' && (
            <>
              <p className="text-xs text-zinc-300">
                Extract separate stems from {sourceLabel} and create new tracks.
              </p>
              <p className="text-[11px] text-zinc-500">
                This can take a bit depending on clip length and model speed.
              </p>
              {!canStart && (
                <p className="text-[11px] text-amber-300">
                  Another generation task is running. Wait for it to finish, then try again.
                </p>
              )}
            </>
          )}

          {mode === 'running' && (
            <>
              <div className="flex items-center gap-2 text-xs text-daw-accent">
                <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                <span>{statusLabel}</span>
              </div>
              <div className="h-1.5 rounded-full bg-black/30 overflow-hidden border border-daw-border">
                <div
                  className="h-full bg-daw-accent transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-400">
                Processed {progressCompleted} / {progressTotal} stems
              </p>
            </>
          )}

          {mode === 'result' && (
            <>
              <p className="text-xs text-zinc-300">
                Created {createdCount} extracted track{createdCount === 1 ? '' : 's'}.
              </p>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded border border-emerald-700/40 bg-emerald-900/20 px-2 py-1 text-emerald-300">
                  Created: {createdCount}
                </div>
                <div className="rounded border border-amber-700/40 bg-amber-900/20 px-2 py-1 text-amber-300">
                  Skipped: {skippedCount}
                </div>
                <div className="rounded border border-rose-700/40 bg-rose-900/20 px-2 py-1 text-rose-300">
                  Failed: {failedCount}
                </div>
              </div>
              {failedCount > 0 && result && (
                <div className="rounded border border-rose-700/40 bg-rose-950/20 px-2 py-1.5 text-[11px] text-rose-300">
                  {result.failedTrackNames.map((entry) => trackDisplayName(entry.trackName)).join(', ')}
                </div>
              )}
            </>
          )}

          {mode === 'error' && (
            <div className="rounded border border-rose-700/40 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
              {errorMessage ?? 'Stem extraction failed'}
            </div>
          )}
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-daw-border gap-2">
          {mode === 'confirm' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={!canStart}
                className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Extract
              </button>
            </>
          )}

          {mode === 'running' && (
            <button
              disabled
              className="px-4 py-1.5 text-xs font-medium bg-daw-accent text-white rounded opacity-80 cursor-wait"
            >
              Extracting...
            </button>
          )}

          {(mode === 'result' || mode === 'error') && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
