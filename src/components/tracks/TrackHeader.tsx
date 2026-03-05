import { useRef, type ChangeEvent } from 'react';
import type { Track } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { TRACK_CATALOG } from '../../constants/tracks';
import { useAudioImport } from '../../hooks/useAudioImport';

interface TrackHeaderProps {
  track: Track;
}

export function TrackHeader({ track }: TrackHeaderProps) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const { importAudioToTrack } = useAudioImport();
  const info = TRACK_CATALOG[track.trackName];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const volumePct = Math.round(track.volume * 100);

  const handleImportClick = () => {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importAudioToTrack(file, track.id);
    } catch (error) {
      console.error('Track audio import failed:', error);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="flex flex-col justify-between h-24 border-b border-daw-border bg-daw-panel group hover:bg-daw-panel-light transition-colors">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileChange}
      />
      {/* Top: Name + Track number */}
      <div className="px-2.5 pt-2">
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[10px] font-bold tracking-[0.15em] uppercase truncate"
            style={{ color: track.color }}
          >
            {track.displayName}
          </span>
          <span className="text-[9px] text-slate-600 font-mono">{String(track.order + 1).padStart(2, '0')}</span>
        </div>

        {/* Mute / Solo / Remove buttons */}
        <div className="flex gap-1">
          <button
            onClick={() => updateTrack(track.id, { muted: !track.muted })}
            className={`w-5 h-4 text-[8px] font-bold flex items-center justify-center rounded transition-colors ${track.muted
              ? 'bg-amber-600/80 text-white'
              : 'bg-black/40 text-slate-600 hover:text-white'
              }`}
            title="Mute"
          >
            M
          </button>
          <button
            onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
            className={`w-5 h-4 text-[8px] font-bold flex items-center justify-center rounded transition-colors ${track.soloed
              ? 'bg-emerald-600/80 text-white'
              : 'bg-black/40 text-slate-600 hover:text-white'
              }`}
            title="Solo"
          >
            S
          </button>
          <button
            onClick={handleImportClick}
            className="w-5 h-4 text-[8px] font-bold flex items-center justify-center rounded bg-black/40 text-slate-600 hover:text-blue-400 hover:bg-blue-900/30 transition-all"
            title="Import audio to this track"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>upload</span>
          </button>
          <button
            onClick={() => removeTrack(track.id)}
            className="w-5 h-4 text-[8px] font-bold flex items-center justify-center rounded bg-black/40 text-slate-600 hover:text-red-400 hover:bg-red-900/30 transition-all ml-auto"
            title="Remove track"
          >
            ×
          </button>
        </div>
      </div>

      {/* Bottom: Volume meter */}
      <div className="px-2.5 pb-2">
        <div className="w-full h-1 bg-black/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500/80 transition-all"
            style={{ width: `${volumePct}%` }}
          />
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={volumePct}
          onChange={(e) => updateTrack(track.id, { volume: parseInt(e.target.value) / 100 })}
          className="w-full h-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          title={`Volume: ${volumePct}%`}
        />
      </div>
    </div>
  );
}
