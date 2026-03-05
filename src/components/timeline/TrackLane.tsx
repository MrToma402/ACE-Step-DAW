import { useCallback, useRef, useState } from 'react';
import type { Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useTimelineInteraction } from '../../hooks/useTimelineInteraction';
import { ClipBlock } from './ClipBlock';

interface TrackLaneProps {
  track: Track;
}

export function TrackLane({ track }: TrackLaneProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const project = useProjectStore((s) => s.project);
  const { handleLaneClick, handleLaneDragSelection } = useTimelineInteraction();
  const [dragRange, setDragRange] = useState<{ startX: number; endX: number } | null>(null);
  const dragMovedRef = useRef(false);
  const totalWidth = project ? project.totalDuration * pixelsPerSecond : 0;

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

  if (!project) return null;

  return (
    <div
      className="relative h-24 border-b border-daw-border bg-daw-surface/40 hover:bg-daw-surface/60 transition-colors"
      style={{ width: totalWidth }}
      onMouseDown={onMouseDown}
    >
      {dragRange && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none bg-daw-accent/20 border border-daw-accent/70 z-20"
          style={{
            left: Math.min(dragRange.startX, dragRange.endX),
            width: Math.max(1, Math.abs(dragRange.endX - dragRange.startX)),
          }}
        />
      )}
      {track.clips.map((clip) => (
        <ClipBlock key={clip.id} clip={clip} track={track} />
      ))}
    </div>
  );
}
