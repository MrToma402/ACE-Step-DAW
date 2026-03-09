import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useAudioImport } from '../../hooks/useAudioImport';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { exportMixToWav } from '../../engine/exportMix';
import { isArrangementClipSelected } from '../../features/arrangement/selection';
import { shouldBlockTrackDragForTagName } from './trackDragGuards';
import { TrackHeaderContextMenu } from './TrackHeaderContextMenu';
import { useExtractToTracksDialog } from '../../hooks/useExtractToTracksDialog';
import { ExtractToTracksDialog } from '../dialogs/ExtractToTracksDialog';

interface TrackHeaderProps {
  track: Track;
  isSelected?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onSelectTrack?: (trackId: string, multi: boolean) => void;
  onStartTrackLasso?: (startClientY: number, additive: boolean) => void;
  onDragStartTrack?: (trackId: string) => void;
  onDragOverTrack?: (trackId: string) => void;
  onDropTrack?: (trackId: string) => void;
  onDragEndTrack?: () => void;
}

export function TrackHeader({
  track,
  isSelected = false,
  isDragging = false,
  isDropTarget = false,
  onSelectTrack,
  onStartTrackLasso,
  onDragStartTrack,
  onDragOverTrack,
  onDropTrack,
  onDragEndTrack,
}: TrackHeaderProps) {
  const setEditingClip = useUIStore((s) => s.setEditingClip);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const clearSelectedTracks = useUIStore((s) => s.clearSelectedTracks);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTracks = useProjectStore((s) => s.removeTracks);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const project = useProjectStore((s) => s.project);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] ?? null : null,
  );
  const { importAudioToTrack } = useAudioImport();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suppressDragRef = useRef(false);
  const lassoStartedRef = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const {
    canExtract,
    canStart,
    canCancel,
    mode: extractDialogMode,
    progress: extractProgress,
    result: extractResult,
    errorMessage: extractErrorMessage,
    openConfirmDialog: openExtractDialog,
    closeDialog: closeExtractDialog,
    confirmExtract: confirmExtract,
    cancelExtract,
  } = useExtractToTracksDialog({
    sourceTrackId: track.id,
  });

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

  const isInteractiveTarget = (
    target: EventTarget | null,
    currentTarget: HTMLDivElement,
  ): boolean => {
    let node = target as HTMLElement | null;
    while (node && node !== currentTarget) {
      if (shouldBlockTrackDragForTagName(node.tagName) || node.dataset.noTrackDrag === 'true') {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  };

  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    lassoStartedRef.current = false;
    suppressDragRef.current = isInteractiveTarget(event.target, event.currentTarget);
  };

  const clearDragSuppression = () => {
    suppressDragRef.current = false;
    lassoStartedRef.current = false;
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (suppressDragRef.current) {
      event.preventDefault();
      return;
    }

    if (isInteractiveTarget(event.target, event.currentTarget)) {
      event.preventDefault();
      return;
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

  const closeCtxMenu = () => setCtxMenu(null);

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setCtxMenu({ x: event.clientX, y: event.clientY });
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (isInteractiveTarget(event.target, event.currentTarget)) return;
    if ((event.ctrlKey || event.metaKey) && onStartTrackLasso) {
      suppressDragRef.current = true;
      lassoStartedRef.current = true;
      onStartTrackLasso(event.clientY, true);
      event.preventDefault();
    }
  };

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (lassoStartedRef.current) return;
    if (isInteractiveTarget(event.target, event.currentTarget)) return;
    onSelectTrack?.(track.id, event.ctrlKey || event.metaKey);
  };

  const handleExtractToTracks = () => {
    closeCtxMenu();
    setEditingClip(null);
    openExtractDialog();
  };

  const canDeleteSelectedTracks = selectedTrackIds.size > 1 && selectedTrackIds.has(track.id);
  const deleteLabel = canDeleteSelectedTracks
    ? `Delete Selected Tracks (${selectedTrackIds.size})`
    : 'Delete Track';
  const handleDeleteTracks = () => {
    closeCtxMenu();
    if (canDeleteSelectedTracks) {
      removeTracks(Array.from(selectedTrackIds));
      clearSelectedTracks();
      return;
    }
    removeTrack(track.id);
  };

  return (
    <>
      <div
        data-track-header-id={track.id}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerUpCapture={clearDragSuppression}
        onPointerCancel={clearDragSuppression}
        onDragEnd={onDragEndTrack}
        onContextMenu={handleContextMenu}
        className={`flex flex-col justify-between h-[88px] border-b border-daw-border group transition-colors cursor-grab active:cursor-grabbing ${
          isDragging
            ? 'bg-daw-panel-light opacity-70'
            : isDropTarget
              ? 'bg-daw-accent/10 ring-1 ring-inset ring-daw-accent/50'
              : isSelected
                ? 'bg-daw-accent/10 ring-1 ring-inset ring-daw-accent/40'
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
        <div className="px-2.5 pt-1.5">
          <div className="flex items-center justify-between mb-1">
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
              className={`w-[22px] h-[18px] text-[9px] font-bold flex items-center justify-center rounded transition-colors ${
                track.hidden
                  ? 'bg-violet-600/80 text-violet-100 ring-1 ring-violet-300/60'
                  : 'bg-violet-950/35 text-violet-300 border border-violet-700/40 hover:text-violet-100 hover:bg-violet-900/45'
              }`}
              title={track.hidden ? 'Show track' : 'Hide track'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                {track.hidden ? 'visibility_off' : 'visibility'}
              </span>
            </button>
            <button
              onClick={() => updateTrack(track.id, { muted: !track.muted })}
              className={`w-[22px] h-[18px] text-[9px] font-bold flex items-center justify-center rounded transition-colors ${track.muted
                ? 'bg-amber-600/85 text-amber-50 ring-1 ring-amber-300/60'
                : 'bg-amber-950/35 text-amber-300 border border-amber-700/40 hover:text-amber-100 hover:bg-amber-900/45'
                }`}
              title="Mute"
            >
              M
            </button>
            <button
              onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
              className={`w-[22px] h-[18px] text-[9px] font-bold flex items-center justify-center rounded transition-colors ${track.soloed
                ? 'bg-emerald-600/85 text-emerald-50 ring-1 ring-emerald-300/60'
                : 'bg-emerald-950/35 text-emerald-300 border border-emerald-700/40 hover:text-emerald-100 hover:bg-emerald-900/45'
                }`}
              title="Solo"
            >
              S
            </button>
            <button
              onClick={handleImportClick}
              className="w-[22px] h-[18px] text-[9px] font-bold flex items-center justify-center rounded bg-sky-950/35 text-sky-300 border border-sky-700/40 hover:text-sky-100 hover:bg-sky-900/45 transition-all"
              title="Import audio to this track"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>upload</span>
            </button>
            <button
              onClick={handleDownloadTrack}
              disabled={isDownloading}
              className="w-[22px] h-[18px] text-[9px] font-bold flex items-center justify-center rounded bg-cyan-950/35 text-cyan-300 border border-cyan-700/40 hover:text-cyan-100 hover:bg-cyan-900/45 transition-all disabled:cursor-not-allowed disabled:opacity-50"
              title="Download this track as WAV"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
                <path d="M8 2v7m0 0l-3-3m3 3l3-3M3 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => removeTrack(track.id)}
              className="w-[22px] h-[18px] text-[9px] font-bold flex items-center justify-center rounded bg-rose-950/35 text-rose-300 border border-rose-700/40 hover:text-rose-100 hover:bg-rose-900/45 transition-all ml-auto"
              title="Remove track"
            >
              ×
            </button>
          </div>
        </div>

        {/* Bottom: Volume meter */}
        <div className="px-2.5 pb-1.5" data-no-track-drag="true">
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

      {ctxMenu && (
        <TrackHeaderContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          canExtract={canExtract}
          onExtract={handleExtractToTracks}
          deleteLabel={deleteLabel}
          onDelete={handleDeleteTracks}
          onClose={closeCtxMenu}
        />
      )}
      <ExtractToTracksDialog
        mode={extractDialogMode}
        sourceLabel={`track "${track.displayName}"`}
        canStart={canStart}
        canCancel={canCancel}
        progress={extractProgress}
        result={extractResult}
        errorMessage={extractErrorMessage}
        onClose={closeExtractDialog}
        onConfirm={confirmExtract}
        onCancel={cancelExtract}
      />
    </>
  );
}
