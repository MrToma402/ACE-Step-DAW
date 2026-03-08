import { useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Track } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useAudioImport } from '../../hooks/useAudioImport';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { exportMixToWav } from '../../engine/exportMix';
import { isArrangementClipSelected } from '../../features/arrangement/selection';
import { shouldBlockTrackDragForTagName } from './trackDragGuards';

interface TrackHeaderProps {
  track: Track;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStartTrack?: (trackId: string) => void;
  onDragOverTrack?: (trackId: string) => void;
  onDropTrack?: (trackId: string) => void;
  onDragEndTrack?: () => void;
}

export function TrackHeader({
  track,
  isDragging = false,
  isDropTarget = false,
  onDragStartTrack,
  onDragOverTrack,
  onDropTrack,
  onDragEndTrack,
}: TrackHeaderProps) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const project = useProjectStore((s) => s.project);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] ?? null : null,
  );
  const { importAudioToTrack } = useAudioImport();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suppressDragRef = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);

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

  const handleDownloadTrack = async () => {
    if (!project || isDownloading) return;
    setIsDownloading(true);
    try {
      const engine = getAudioEngine();
      const clips: Array<{ startTime: number; buffer: AudioBuffer; volume: number }> = [];

      for (const clip of track.clips) {
        if (!isArrangementClipSelected(clip, workspace)) continue;
        if (clip.generationStatus !== 'ready' || !clip.isolatedAudioKey) continue;
        const blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
        if (!blob) continue;
        const buffer = await engine.decodeAudioData(blob);
        clips.push({ startTime: clip.startTime, buffer, volume: track.volume });
      }

      if (clips.length === 0) return;
      const stemBlob = await exportMixToWav(clips, project.totalDuration, 48000, {
        tonePreset: 'clean',
        loudnessTarget: '-18',
      });
      const url = URL.createObjectURL(stemBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}-${track.displayName.replace(/\s+/g, '_').toLowerCase()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Track export failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    let node = event.target as HTMLElement | null;
    suppressDragRef.current = false;
    while (node && node !== event.currentTarget) {
      if (shouldBlockTrackDragForTagName(node.tagName) || node.dataset.noTrackDrag === 'true') {
        suppressDragRef.current = true;
        return;
      }
      node = node.parentElement;
    }
  };

  const clearDragSuppression = () => {
    suppressDragRef.current = false;
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (suppressDragRef.current) {
      event.preventDefault();
      return;
    }

    let node = event.target as HTMLElement | null;
    while (node && node !== event.currentTarget) {
      if (shouldBlockTrackDragForTagName(node.tagName) || node.dataset.noTrackDrag === 'true') {
        event.preventDefault();
        return;
      }
      node = node.parentElement;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', track.id);
    onDragStartTrack?.(track.id);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    onDragOverTrack?.(track.id);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onDropTrack?.(track.id);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerUpCapture={clearDragSuppression}
      onPointerCancel={clearDragSuppression}
      onDragEnd={onDragEndTrack}
      className={`flex flex-col justify-between h-24 border-b border-daw-border group transition-colors cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'bg-daw-panel-light opacity-70'
          : isDropTarget
            ? 'bg-daw-accent/10 ring-1 ring-inset ring-daw-accent/50'
            : 'bg-daw-panel hover:bg-daw-panel-light'
      } ${track.hidden ? 'opacity-60' : ''}`}
    >
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
        <div className="flex gap-1" data-no-track-drag="true">
          <button
            onClick={() => updateTrack(track.id, { hidden: !track.hidden })}
            className={`w-5 h-4 text-[8px] font-bold flex items-center justify-center rounded transition-colors ${
              track.hidden
                ? 'bg-slate-700/80 text-slate-200'
                : 'bg-black/40 text-slate-600 hover:text-white'
            }`}
            title={track.hidden ? 'Show track' : 'Hide track'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>
              {track.hidden ? 'visibility_off' : 'visibility'}
            </span>
          </button>
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
            onClick={handleDownloadTrack}
            disabled={isDownloading}
            className="w-5 h-4 text-[8px] font-bold flex items-center justify-center rounded bg-black/40 text-slate-300 hover:text-emerald-300 hover:bg-emerald-900/30 transition-all disabled:cursor-not-allowed"
            title="Download this track as WAV"
          >
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none" aria-hidden="true">
              <path d="M8 2v7m0 0l-3-3m3 3l3-3M3 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
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
      <div className="px-2.5 pb-2" data-no-track-drag="true">
        <input
          type="range"
          min="0"
          max="100"
          value={volumePct}
          onChange={(e) => updateTrack(track.id, { volume: parseInt(e.target.value, 10) / 100 })}
          className="w-full h-1.5 cursor-pointer rounded-full"
          style={{
            background: `linear-gradient(to right, rgba(16,185,129,0.8) 0%, rgba(16,185,129,0.8) ${volumePct}%, rgba(0,0,0,0.5) ${volumePct}%, rgba(0,0,0,0.5) 100%)`,
          }}
          title={`Volume: ${volumePct}%`}
        />
      </div>
    </div>
  );
}
