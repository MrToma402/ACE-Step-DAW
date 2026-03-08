import { useCallback, useRef, useState } from 'react';
import type { Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useTimelineInteraction } from '../../hooks/useTimelineInteraction';
import { ClipBlock } from './ClipBlock';
import { isArrangementClipSelected } from '../../features/arrangement/selection';

interface TrackLaneProps {
  track: Track;
}

export function TrackLane({ track }: TrackLaneProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const clipDragPreview = useUIStore((s) => s.clipDragPreview);
  const project = useProjectStore((s) => s.project);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] ?? null : null,
  );
  const { handleLaneClick, handleLaneDragSelection } = useTimelineInteraction();
  const [dragRange, setDragRange] = useState<{ startX: number; endX: number } | null>(null);
  const dragMovedRef = useRef(false);
  const totalWidth = project ? project.totalDuration * pixelsPerSecond : 0;
  const isDropTarget = clipDragPreview?.hoverTrackId === track.id;

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = Math.max(0, Math.min(e.clientX - rect.left, totalWidth));
    dragMovedRef.current = false;
    setDragRange({ startX, endX: startX });

    const onMouseMove = (ev: MouseEvent) => {
      const nextX = ev.clientX - rect.left;
      if (Math.abs(nextX - startX) >= 3) {
        dragMovedRef.current = true;
      }
      setDragRange({
        startX,
        endX: Math.max(0, Math.min(nextX, totalWidth)),
      });
    };

    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const endX = Math.max(0, Math.min(ev.clientX - rect.left, totalWidth));
      if (dragMovedRef.current) {
        handleLaneDragSelection(track.id, startX, endX, 0);
      } else {
        handleLaneClick(track.id, startX, 0);
      }
      setDragRange(null);
      dragMovedRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [handleLaneClick, handleLaneDragSelection, totalWidth, track.id]);

  const visibleClips =
    workspace?.settings.hideInactiveTakes
      ? track.clips.filter((clip) => isArrangementClipSelected(clip, workspace))
      : track.clips;

  if (!project) return null;
  if (track.hidden) {
    return (
      <div
        className="relative h-24 border-b border-daw-border bg-daw-surface/20"
        data-track-id={track.id}
        style={{ width: totalWidth }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.16em] text-slate-600">
          Hidden Track
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative h-24 border-b border-daw-border transition-colors ${
        isDropTarget ? 'bg-daw-accent/15' : 'bg-daw-surface/40 hover:bg-daw-surface/60'
      }`}
      data-track-id={track.id}
      style={{ width: totalWidth }}
      onMouseDown={onMouseDown}
    >
      {clipDragPreview && isDropTarget && (
        <div
          className="absolute top-1 bottom-1 rounded border-2 border-daw-accent/80 bg-daw-accent/25 pointer-events-none z-30"
          style={{
            left: clipDragPreview.startTime * pixelsPerSecond,
            width: Math.max(6, clipDragPreview.duration * pixelsPerSecond),
          }}
        />
      )}
      {dragRange && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none bg-daw-accent/20 border border-daw-accent/70 z-20"
          style={{
            left: Math.min(dragRange.startX, dragRange.endX),
            width: Math.max(1, Math.abs(dragRange.endX - dragRange.startX)),
          }}
        />
      )}
      {visibleClips.map((clip) => (
        <ClipBlock key={clip.id} clip={clip} track={track} />
      ))}
    </div>
  );
}
