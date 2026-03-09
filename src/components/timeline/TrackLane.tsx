import { useCallback, useRef } from 'react';
import type { Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useTimelineInteraction } from '../../hooks/useTimelineInteraction';
import { ClipBlock } from './ClipBlock';
import { isArrangementClipSelected } from '../../features/arrangement/selection';
import { resolveLaneEmptyDragAction } from '../../features/timeline/laneEmptyDragAction';
import { resolveHorizontalEdgeAutoScrollDelta, resolveVerticalEdgeAutoScrollDelta } from '../../features/timeline/dragEdgeAutoScroll';

interface TrackLaneProps {
  track: Track;
  onSelectClipsInRect?: (
    startClientY: number,
    currentClientY: number,
    startX: number,
    endX: number,
    scrollX: number,
    additive: boolean,
    baseSelectedClipIds: Set<string>,
  ) => { selectedClipCount: number; selectedTrackCount: number };
  onMarqueeVisualChange?: (
    startClientY: number,
    currentClientY: number,
    startX: number,
    endX: number,
  ) => void;
  onMarqueeVisualEnd?: () => void;
}

export function TrackLane({
  track,
  onSelectClipsInRect,
  onMarqueeVisualChange,
  onMarqueeVisualEnd,
}: TrackLaneProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const clipDragPreview = useUIStore((s) => s.clipDragPreview);
  const project = useProjectStore((s) => s.project);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] ?? null : null,
  );
  const { handleLaneClick, handleLaneDragSelection } = useTimelineInteraction();
  const dragMovedRef = useRef(false);
  const totalWidth = project ? project.totalDuration * pixelsPerSecond : 0;
  const isDropTarget = clipDragPreview?.hoverTrackId === track.id;
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const laneNode = e.currentTarget;
    const scrollContainer = laneNode.closest<HTMLElement>('[data-timeline-scroll-container="true"]');
    const getLaneX = (clientX: number): number => {
      const rect = laneNode.getBoundingClientRect();
      return Math.max(0, Math.min(clientX - rect.left, totalWidth));
    };
    const startX = getLaneX(e.clientX);
    const startClientX = e.clientX;
    const startY = e.clientY;
    const startContentY = startY + (scrollContainer?.scrollTop ?? 0);
    const additive = e.ctrlKey || e.metaKey;
    const baseSelectedClipIds = new Set(useUIStore.getState().selectedClipIds);
    let latestClientX = e.clientX;
    let latestClientY = e.clientY;
    let autoScrollFrameId: number | null = null;
    let pointerActive = true;
    dragMovedRef.current = false;
    const updateDragSelection = (clientX: number, clientY: number) => {
      const moved = Math.abs(clientX - startClientX) >= 3 || Math.abs(clientY - startY) >= 3;
      const nextX = getLaneX(clientX);
      const anchoredStartY = scrollContainer ? startContentY - scrollContainer.scrollTop : startY;
      if (moved) {
        dragMovedRef.current = true;
        onMarqueeVisualChange?.(anchoredStartY, clientY, startX, nextX);
        onSelectClipsInRect?.(anchoredStartY, clientY, startX, nextX, 0, additive, baseSelectedClipIds);
      }
    };
    const stopAutoScroll = () => {
      pointerActive = false;
      if (autoScrollFrameId === null) return;
      window.cancelAnimationFrame(autoScrollFrameId);
      autoScrollFrameId = null;
    };
    const runAutoScroll = () => {
      if (!pointerActive) return;
      if (dragMovedRef.current && scrollContainer) {
        const scrollRect = scrollContainer.getBoundingClientRect();
        const maxScrollLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
        const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        const scrollDelta = resolveHorizontalEdgeAutoScrollDelta({
          pointerClientX: latestClientX,
          viewportLeft: scrollRect.left,
          viewportRight: scrollRect.right,
          scrollLeft: scrollContainer.scrollLeft,
          maxScrollLeft,
        });
        const verticalScrollDelta = resolveVerticalEdgeAutoScrollDelta({
          pointerClientY: latestClientY,
          viewportTop: scrollRect.top,
          viewportBottom: scrollRect.bottom,
          scrollTop: scrollContainer.scrollTop,
          maxScrollTop,
        });
        if (scrollDelta !== 0 || verticalScrollDelta !== 0) {
          scrollContainer.scrollLeft += scrollDelta;
          scrollContainer.scrollTop += verticalScrollDelta;
          updateDragSelection(latestClientX, latestClientY);
        }
      }
      if (pointerActive) {
        autoScrollFrameId = window.requestAnimationFrame(runAutoScroll);
      }
    };
    autoScrollFrameId = window.requestAnimationFrame(runAutoScroll);
    const onMouseMove = (ev: MouseEvent) => {
      latestClientX = ev.clientX;
      latestClientY = ev.clientY;
      updateDragSelection(ev.clientX, ev.clientY);
    };
    const onMouseUp = (ev: MouseEvent) => {
      stopAutoScroll();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onWindowBlur);
      const endX = getLaneX(ev.clientX);
      const anchoredStartY = scrollContainer ? startContentY - scrollContainer.scrollTop : startY;
      if (resolveLaneEmptyDragAction(dragMovedRef.current) === 'selectClips') {
        const result = onSelectClipsInRect?.(anchoredStartY, ev.clientY, startX, endX, 0, additive, baseSelectedClipIds);
        if (!additive && result && result.selectedClipCount === 0 && result.selectedTrackCount === 1) {
          handleLaneDragSelection(track.id, startX, endX, 0);
        }
      } else {
        handleLaneClick(track.id, startX, 0);
      }
      onMarqueeVisualEnd?.();
      dragMovedRef.current = false;
    };
    const onWindowBlur = () => {
      stopAutoScroll();
      onMarqueeVisualEnd?.();
      dragMovedRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onWindowBlur);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onWindowBlur);
  }, [handleLaneClick, handleLaneDragSelection, onMarqueeVisualChange, onMarqueeVisualEnd, onSelectClipsInRect, totalWidth, track.id]);
  const visibleClips =
    workspace?.settings.hideInactiveTakes
      ? track.clips.filter((clip) => isArrangementClipSelected(clip, workspace))
      : track.clips;

  if (!project) return null;
  if (track.hidden) {
    return (
      <div
        className="relative h-[88px] border-b border-daw-border bg-daw-surface/20"
        data-track-id={track.id}
        data-track-lane-id={track.id}
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
      className={`relative h-[88px] border-b border-daw-border transition-colors ${
        isDropTarget
          ? 'bg-daw-accent/15'
          : 'bg-daw-surface/40 hover:bg-daw-surface/60'
      }`}
      data-track-id={track.id}
      data-track-lane-id={track.id}
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
      {visibleClips.map((clip) => (
        <ClipBlock key={clip.id} clip={clip} track={track} />
      ))}
    </div>
  );
}
