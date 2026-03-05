import { useRef, useCallback, useState } from 'react';
import type { Clip, Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useGeneration } from '../../hooks/useGeneration';
import { hexToRgba } from '../../utils/color';
import { snapTime } from '../../features/arrangement/snap';
import { isArrangementClipSelected } from '../../features/arrangement/selection';

interface ClipBlockProps {
  clip: Clip;
  track: Track;
}

const EDGE_HANDLE_PX = 6;
const MIN_CLIP_DURATION = 0.5;

type DragMode = 'move' | 'resize-left' | 'resize-right';

export function ClipBlock({ clip, track }: ClipBlockProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const selectClip = useUIStore((s) => s.selectClip);
  const setEditingClip = useUIStore((s) => s.setEditingClip);
  const clipDragPreview = useUIStore((s) => s.clipDragPreview);
  const setClipDragPreview = useUIStore((s) => s.setClipDragPreview);
  const updateClip = useProjectStore((s) => s.updateClip);
  const moveClipToTrack = useProjectStore((s) => s.moveClipToTrack);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const project = useProjectStore((s) => s.project);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] : undefined,
  );
  const { generateClip } = useGeneration();
  const snapEnabled = workspace?.settings.snapEnabled ?? true;
  const snapResolution = workspace?.settings.snapResolution ?? '1_4';

  const peaks = clip.waveformPeaks;
  const arrangementSelected = isArrangementClipSelected(clip, workspace ?? null);
  const isArrangementClip = Boolean(clip.arrangementSectionId && clip.arrangementTakeId);
  const hideInactiveTakes = workspace?.settings.hideInactiveTakes ?? false;

  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;
  const isSelected = selectedClipIds.has(clip.id);
  const isDraggingThisClip = clipDragPreview?.clipId === clip.id;

  const dragRef = useRef(false);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const getDragMode = useCallback((e: React.MouseEvent): DragMode => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX <= EDGE_HANDLE_PX) return 'resize-left';
    if (relX >= rect.width - EDGE_HANDLE_PX) return 'resize-right';
    return 'move';
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const mode = getDragMode(e);
    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = clip.startTime;
    const origDuration = clip.duration;
    const origAudioOffset = clip.audioOffset ?? 0;
    const origAudioDuration = clip.audioDuration ?? clip.duration;
    let latestStart = origStart;
    let latestHoverTrackId = track.id;
    let lastPreviewStart = Number.NaN;
    let lastPreviewTrack = '';
    const bpm = project?.bpm ?? 120;
    const totalDuration = project?.totalDuration ?? 600;
    dragRef.current = false;

    const findDropTargetTrackId = (clientX: number, clientY: number): string | null => {
      const el = document.elementFromPoint(clientX, clientY);
      if (!(el instanceof HTMLElement)) return null;
      const lane = el.closest('[data-track-id]');
      if (!(lane instanceof HTMLElement)) return null;
      return lane.dataset.trackId ?? null;
    };

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && !dragRef.current) return;
      dragRef.current = true;

      const deltaSec = dx / pixelsPerSecond;

      if (mode === 'move') {
        let newStart = snapTime(origStart + deltaSec, bpm, snapEnabled, snapResolution);
        newStart = Math.max(0, Math.min(newStart, totalDuration - origDuration));
        latestStart = newStart;
        const hoverTrackId = findDropTargetTrackId(ev.clientX, ev.clientY) ?? track.id;
        latestHoverTrackId = hoverTrackId;
        if (hoverTrackId !== lastPreviewTrack || Math.abs(newStart - lastPreviewStart) > 0.001) {
          setClipDragPreview({
            clipId: clip.id,
            sourceTrackId: track.id,
            hoverTrackId,
            startTime: newStart,
            duration: clip.duration,
            color: track.color,
          });
          lastPreviewTrack = hoverTrackId;
          lastPreviewStart = newStart;
        }
        updateClip(clip.id, { startTime: newStart });
      } else if (mode === 'resize-left') {
        let newStart = snapTime(origStart + deltaSec, bpm, snapEnabled, snapResolution);
        newStart = Math.max(0, newStart);
        const maxStart = origStart + origDuration - MIN_CLIP_DURATION;
        newStart = Math.min(newStart, maxStart);

        const shift = newStart - origStart;
        let newAudioOffset = origAudioOffset + shift;
        if (newAudioOffset < 0) {
          newStart = origStart - origAudioOffset;
          newAudioOffset = 0;
        }
        if (newAudioOffset > origAudioDuration - MIN_CLIP_DURATION) {
          newAudioOffset = origAudioDuration - MIN_CLIP_DURATION;
          newStart = origStart + (newAudioOffset - origAudioOffset);
        }
        const newDuration = origDuration + (origStart - newStart);
        updateClip(clip.id, { startTime: newStart, duration: newDuration, audioOffset: newAudioOffset });
      } else {
        let newDuration = snapTime(origDuration + deltaSec, bpm, snapEnabled, snapResolution);
        newDuration = Math.max(MIN_CLIP_DURATION, newDuration);
        newDuration = Math.min(newDuration, totalDuration - origStart);
        const maxDuration = origAudioDuration - origAudioOffset;
        newDuration = Math.min(newDuration, maxDuration);
        updateClip(clip.id, { duration: newDuration });
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (mode === 'move' && dragRef.current) {
        if (latestHoverTrackId !== track.id) {
          moveClipToTrack(clip.id, latestHoverTrackId, { startTime: latestStart });
        }
      }
      setClipDragPreview(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [clip.id, clip.startTime, clip.duration, clip.audioOffset, clip.audioDuration, pixelsPerSecond, project, snapEnabled, snapResolution, updateClip, moveClipToTrack, setClipDragPreview, track.id, track.color, getDragMode]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current) return;
    setCtxMenu(null);
    selectClip(clip.id, e.metaKey || e.ctrlKey);
  }, [clip.id, selectClip]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingClip(clip.id);
  }, [clip.id, setEditingClip]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const handleMouseMoveLocal = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const el = e.currentTarget as HTMLElement;
    if (relX <= EDGE_HANDLE_PX || relX >= rect.width - EDGE_HANDLE_PX) {
      el.style.cursor = 'col-resize';
    } else {
      el.style.cursor = 'grab';
    }
  }, []);

  const statusStyles: Record<string, string> = {
    empty: 'opacity-60',
    queued: 'opacity-70',
    generating: 'opacity-80 animate-pulse',
    processing: 'opacity-80 animate-pulse',
    ready: '',
    error: 'opacity-60',
    stale: 'opacity-50',
  };

  const audioDuration = clip.audioDuration ?? clip.duration;
  const audioOffset = clip.audioOffset ?? 0;
  const peakWidthPx = width - 4;

  const startPeakIdx = peaks ? Math.floor((audioOffset / audioDuration) * peaks.length) : 0;
  const endPeakIdx = peaks ? Math.min(
    Math.ceil(((audioOffset + clip.duration) / audioDuration) * peaks.length),
    peaks.length,
  ) : 0;
  const visiblePeakCount = endPeakIdx - startPeakIdx;
  const numBars = peaks ? Math.min(visiblePeakCount, Math.floor(peakWidthPx / 2)) : 0;
  const barSpacing = numBars > 0 ? peakWidthPx / numBars : 0;

  return (
    <>
      <div
        className={`absolute top-1 bottom-1 rounded select-none overflow-hidden border border-white/10
          ${statusStyles[clip.generationStatus] ?? ''}
          ${arrangementSelected || hideInactiveTakes ? '' : 'opacity-40'}
          ${isSelected ? 'ring-1 ring-daw-accent ring-offset-1 ring-offset-transparent' : ''}
          ${isDraggingThisClip ? 'opacity-50' : ''}
        `}
        style={{
          left,
          width: Math.max(width, 4),
          backgroundColor: hexToRgba(track.color, 0.15),
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMoveLocal}
        onContextMenu={handleContextMenu}
      >
        {/* Resize handles */}
        <div className="absolute top-0 bottom-0 left-0 w-[6px] cursor-col-resize z-10" />
        <div className="absolute top-0 bottom-0 right-0 w-[6px] cursor-col-resize z-10" />

        {/* Waveform */}
        {peaks && numBars > 0 && (
          <div className="absolute inset-0 flex items-center overflow-hidden">
            <svg
              width={peakWidthPx}
              height="100%"
              viewBox={`0 0 ${peakWidthPx} 100`}
              preserveAspectRatio="none"
              className="opacity-50 ml-0.5"
            >
              {Array.from({ length: numBars }, (_, i) => {
                const peakIdx = startPeakIdx + Math.floor((i / numBars) * visiblePeakCount);
                const peak = peaks[Math.min(peakIdx, peaks.length - 1)];
                const h = peak * 80;
                return (
                  <rect
                    key={i}
                    x={i * barSpacing}
                    y={50 - h / 2}
                    width={Math.max(barSpacing * 0.7, 0.5)}
                    height={Math.max(h, 1)}
                    fill={track.color}
                  />
                );
              })}
            </svg>
          </div>
        )}

        {/* Label */}
        <div className="absolute top-1.5 left-2 right-1.5 text-[9px] font-bold text-slate-400 truncate leading-none z-10 pointer-events-none">
          {clip.prompt || '(no prompt)'}
        </div>

        {isArrangementClip && (
          <div
            className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold ${
              arrangementSelected ? 'bg-emerald-900/40 text-emerald-300' : 'bg-zinc-900/60 text-zinc-400'
            }`}
          >
            {arrangementSelected ? 'Selected Take' : 'Inactive Take'}
          </div>
        )}

        {/* Status indicator */}
        {clip.generationStatus === 'generating' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
            <div className="w-4 h-4 border-2 border-daw-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {clip.generationStatus === 'error' && (
          <div className="absolute bottom-1 left-2 text-[8px] text-red-400 truncate pointer-events-none">
            Error
          </div>
        )}
        {clip.generationStatus === 'ready' && clip.inferredMetas && (
          <div className="absolute bottom-1 left-2 right-1.5 text-[8px] text-slate-600 truncate pointer-events-none">
            {[
              clip.inferredMetas.bpm != null ? `${clip.inferredMetas.bpm}bpm` : null,
              clip.inferredMetas.keyScale || null,
            ].filter(Boolean).join(' | ')}
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ClipContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={() => { closeCtxMenu(); setEditingClip(clip.id); }}
          onGenerate={() => { closeCtxMenu(); generateClip(clip.id); }}
          onDuplicate={() => { closeCtxMenu(); duplicateClip(clip.id); }}
          onDelete={() => { closeCtxMenu(); removeClip(clip.id); }}
          onClose={closeCtxMenu}
          hasPrompt={!!clip.prompt}
        />
      )}
    </>
  );
}

function ClipContextMenu({
  x, y, onEdit, onGenerate, onDuplicate, onDelete, onClose, hasPrompt,
}: {
  x: number;
  y: number;
  onEdit: () => void;
  onGenerate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
  hasPrompt: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-50 bg-daw-panel border border-daw-border rounded shadow-2xl py-1 min-w-[140px]"
        style={{ left: x, top: y }}
      >
        <button
          onClick={onEdit}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">edit</span>
          Edit Clip
        </button>
        <button
          onClick={onGenerate}
          disabled={!hasPrompt}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors disabled:text-slate-700 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">auto_awesome</span>
          Generate
        </button>
        <button
          onClick={onDuplicate}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">content_copy</span>
          Duplicate
        </button>
        <div className="my-1 border-t border-daw-border" />
        <button
          onClick={onDelete}
          className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/20 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">delete</span>
          Delete
        </button>
      </div>
    </>
  );
}
