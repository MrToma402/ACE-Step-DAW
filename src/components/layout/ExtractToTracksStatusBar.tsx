import { TRACK_CATALOG } from '../../constants/tracks';
import { useExtractToTracksStatusStore } from '../../store/extractToTracksStatusStore';

function trackDisplayName(trackName: string): string {
  return TRACK_CATALOG[trackName]?.displayName ?? trackName;
}

export function ExtractToTracksStatusBar() {
  const mode = useExtractToTracksStatusStore((s) => s.mode);
  const sourceLabel = useExtractToTracksStatusStore((s) => s.sourceLabel);
  const progress = useExtractToTracksStatusStore((s) => s.progress);
  const result = useExtractToTracksStatusStore((s) => s.result);
  const errorMessage = useExtractToTracksStatusStore((s) => s.errorMessage);
  const cancelExtraction = useExtractToTracksStatusStore((s) => s.cancelExtraction);
  const closeStatus = useExtractToTracksStatusStore((s) => s.closeStatus);

  if (mode === 'closed' || mode === 'confirm') return null;

  const progressTotal = Math.max(1, progress?.total ?? 1);
  const progressCompleted = Math.max(0, Math.min(progress?.completed ?? 0, progressTotal));
  const progressPct = Math.round((progressCompleted / progressTotal) * 100);
  const currentTrackLabel = progress?.currentTrackName
    ? trackDisplayName(progress.currentTrackName)
    : null;
  const statusLabel = progress?.phase === 'preparing'
    ? (progress?.detail ?? 'Preparing source audio...')
    : (progress?.detail ?? (currentTrackLabel
      ? `Extracting ${currentTrackLabel}...`
      : 'Extracting stems...'));
  const createdCount = result?.createdTrackNames.length ?? 0;
  const skippedCount = result?.skippedTrackNames.length ?? 0;
  const failedCount = result?.failedTrackNames.length ?? 0;

  return (
    <div className="fixed left-3 right-3 bottom-8 z-[65] pointer-events-none">
      <div className="pointer-events-auto rounded border border-daw-border bg-daw-surface/95 shadow-2xl backdrop-blur px-3 py-2">
        {mode === 'running' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3.5 h-3.5 border border-daw-accent border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-[11px] text-zinc-100 truncate">
                  {sourceLabel ? `${sourceLabel}: ` : ''}{statusLabel}
                </span>
              </div>
              <button
                onClick={cancelExtraction}
                className="shrink-0 px-2 py-1 text-[10px] font-semibold bg-rose-600/90 hover:bg-rose-500 text-white rounded transition-colors"
              >
                Cancel
              </button>
            </div>
            <div className="h-1.5 rounded-full bg-black/35 overflow-hidden border border-daw-border">
              <div
                className="h-full bg-daw-accent transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>{currentTrackLabel ? `Current: ${currentTrackLabel}` : 'Current: —'}</span>
              <span>{progressCompleted}/{progressTotal}</span>
            </div>
          </div>
        )}

        {mode === 'result' && (
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] text-zinc-100">
              Extraction complete{sourceLabel ? ` (${sourceLabel})` : ''}. Created {createdCount}, skipped {skippedCount}, failed {failedCount}.
            </div>
            <button
              onClick={closeStatus}
              className="shrink-0 px-2 py-1 text-[10px] font-semibold bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {mode === 'error' && (
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] text-rose-300">
              Extraction failed{sourceLabel ? ` (${sourceLabel})` : ''}: {errorMessage ?? 'Unknown error'}
            </div>
            <button
              onClick={closeStatus}
              className="shrink-0 px-2 py-1 text-[10px] font-semibold bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
