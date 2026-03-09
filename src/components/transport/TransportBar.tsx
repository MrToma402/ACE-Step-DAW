import { useTransport } from '../../hooks/useTransport';
import { useTransportStore } from '../../store/transportStore';
import { getSelectionLoopRange } from '../../features/transport/selectionLoopRange';
import { useProjectStore } from '../../store/projectStore';
import { formatTime } from '../../utils/time';
import { TimeDisplay } from './TimeDisplay';
import { TempoDisplay } from './TempoDisplay';

export function TransportBar() {
  const { isPlaying, play, pause, stop } = useTransport();
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const playbackScope = useTransportStore((s) => s.playbackScope);
  const project = useProjectStore((s) => s.project);
  const toggleLoop = useTransportStore((s) => s.toggleLoop);
  const selectionLoopRange = getSelectionLoopRange(playbackScope, project);
  const isSelectionLooping = isPlaying && selectionLoopRange !== null;

  return (
    <div className="flex items-center h-10 px-3 gap-3 bg-daw-surface border-b border-daw-border">
      <div className="flex items-center gap-1">
        <button
          onClick={stop}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-daw-surface-2 transition-colors"
          title="Stop"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect width="12" height="12" rx="1" />
          </svg>
        </button>
        <button
          onClick={() => isPlaying ? pause() : play()}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            isPlaying ? 'bg-daw-accent text-white' : 'hover:bg-daw-surface-2'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
              <rect width="4" height="14" rx="1" />
              <rect x="8" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
              <path d="M0 0L12 7L0 14V0Z" />
            </svg>
          )}
        </button>
        <button
          onClick={toggleLoop}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            loopEnabled ? 'bg-daw-accent text-white' : 'hover:bg-daw-surface-2 text-zinc-400'
          }`}
          title={loopEnabled ? 'Loop On' : 'Loop Off'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 1l2 2-2 2" />
            <path d="M4 13l-2-2 2-2" />
            <path d="M12 3H5a3 3 0 0 0 0 6" />
            <path d="M2 11h7a3 3 0 0 0 0-6" />
          </svg>
        </button>
        {selectionLoopRange && (
          <div
            className={`h-8 px-2 flex items-center rounded text-[10px] font-bold uppercase tracking-wider border ${
              isSelectionLooping
                ? 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30'
                : 'text-emerald-200/80 bg-emerald-500/5 border-emerald-500/20'
            }`}
            title="Selected clips loop range"
          >
            Loop {formatTime(selectionLoopRange.start)} - {formatTime(selectionLoopRange.end)}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-daw-border" />

      <TimeDisplay />

      <div className="flex-1" />

      <TempoDisplay />
    </div>
  );
}
