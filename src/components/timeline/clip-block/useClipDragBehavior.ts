import { useCallback, useEffect, useRef, useState } from 'react';
import { snapTime } from '../../../features/arrangement/snap';
import type { GridResolution } from '../../../features/arrangement/types';
import { clampGroupMoveDelta } from '../../../features/timeline/clipGroupMove';
import { shouldSelectClipOnPointerDown } from '../../../features/selection/clipPointerDownSelection';
import { normalizeSeconds } from '../../../utils/time';
import type { Clip, Project, Track } from '../../../types/project';
import type { ClipDragPreview, ExtendConfirmRequest, RepaintRequest } from '../../../store/uiStore';

const EDGE_HANDLE_PX = 6;
const MIN_CLIP_DURATION = 0.5;
const EXTEND_EPSILON_SECONDS = 0.05;

type DragMode = 'move' | 'resize-left' | 'resize-right';

interface UseClipDragBehaviorOptions {
  clip: Clip;
  track: Track;
  project: Project | null;
  isSelected: boolean;
  selectedClipIds: Set<string>;
  pixelsPerSecond: number;
  isRepaintModeActive: boolean;
  snapEnabled: boolean;
  snapResolution: GridResolution;
  selectClip: (clipId: string, multi?: boolean) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  moveClipToTrack: (clipId: string, trackId: string, options?: { startTime?: number }) => void;
  getClipById: (clipId: string) => Clip | undefined;
  setClipDragPreview: (preview: ClipDragPreview | null) => void;
  setClipGestureActive: (active: boolean) => void;
  openExtendConfirmDialog: (request: ExtendConfirmRequest) => void;
  openRepaintDialog: (request: RepaintRequest) => void;
  setRepaintModeActive: (active: boolean) => void;
}

export function useClipDragBehavior({
  clip,
  track,
  project,
  isSelected,
  selectedClipIds,
  pixelsPerSecond,
  isRepaintModeActive,
  snapEnabled,
  snapResolution,
  selectClip,
  updateClip,
  moveClipToTrack,
  getClipById,
  setClipDragPreview,
  setClipGestureActive,
  openExtendConfirmDialog,
  openRepaintDialog,
  setRepaintModeActive,
}: UseClipDragBehaviorOptions) {
  const dragRef = useRef(false);
  const repaintDragFrameRef = useRef<number | null>(null);
  const repaintDragStartPxRef = useRef(0);
  const repaintDragEndPxRef = useRef(0);
  const [repaintSelectionPx, setRepaintSelectionPx] = useState<{ start: number; end: number } | null>(null);

  const flushRepaintSelectionFrame = useCallback(() => {
    if (repaintDragFrameRef.current != null) return;
    repaintDragFrameRef.current = window.requestAnimationFrame(() => {
      repaintDragFrameRef.current = null;
      setRepaintSelectionPx({
        start: repaintDragStartPxRef.current,
        end: repaintDragEndPxRef.current,
      });
    });
  }, []);

  const getDragMode = useCallback((e: React.MouseEvent): DragMode => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX <= EDGE_HANDLE_PX) return 'resize-left';
    if (relX >= rect.width - EDGE_HANDLE_PX) return 'resize-right';
    return 'move';
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const isRepaintSelectionDrag = isRepaintModeActive;
    if (isRepaintSelectionDrag) {
      e.stopPropagation();
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const clipEnd = clip.startTime + clip.duration;
      const clampPx = (value: number) => Math.max(0, Math.min(value, rect.width));
      const startPx = clampPx(e.clientX - rect.left);
      let endPx = startPx;
      const previousUserSelect = document.body.style.userSelect;
      const previousCursor = document.body.style.cursor;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'crosshair';
      repaintDragStartPxRef.current = startPx;
      repaintDragEndPxRef.current = startPx;
      setRepaintSelectionPx({ start: startPx, end: startPx });

      const onMouseMove = (ev: MouseEvent) => {
        endPx = clampPx(ev.clientX - rect.left);
        repaintDragStartPxRef.current = startPx;
        repaintDragEndPxRef.current = endPx;
        flushRepaintSelectionFrame();
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('blur', onMouseUp);
        document.body.style.userSelect = previousUserSelect;
        document.body.style.cursor = previousCursor;
        if (repaintDragFrameRef.current != null) {
          window.cancelAnimationFrame(repaintDragFrameRef.current);
          repaintDragFrameRef.current = null;
        }
        setRepaintSelectionPx(null);

        const startPxClamped = Math.min(startPx, endPx);
        const endPxClamped = Math.max(startPx, endPx);
        const absoluteStart = clip.startTime + (startPxClamped / pixelsPerSecond);
        const absoluteEnd = clip.startTime + (endPxClamped / pixelsPerSecond);
        const repaintStart = normalizeSeconds(
          Math.max(clip.startTime, Math.min(absoluteStart, clipEnd)),
          3,
        );
        const repaintEnd = normalizeSeconds(
          Math.max(repaintStart, Math.min(clipEnd, absoluteEnd)),
          3,
        );
        if (repaintEnd - repaintStart >= 0.1) {
          setRepaintModeActive(false);
          openRepaintDialog({ clipId: clip.id, startTime: repaintStart, endTime: repaintEnd });
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('blur', onMouseUp);
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const mode = getDragMode(e);
    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = clip.startTime;
    const origDuration = clip.duration;
    const origAudioOffset = clip.audioOffset ?? 0;
    const origAudioDuration = clip.audioDuration ?? clip.duration;
    let latestDuration = origDuration;
    let latestStart = origStart;
    let latestHoverTrackId = track.id;
    let extendsBeyondCurrentAudio = false;
    let lastPreviewStart = Number.NaN;
    let lastPreviewTrack = '';
    const bpm = project?.bpm ?? 120;
    const totalDuration = project?.totalDuration ?? 600;
    const additiveSelection = e.metaKey || e.ctrlKey;
    if (shouldSelectClipOnPointerDown({ mode, isSelected, additive: additiveSelection })) {
      selectClip(clip.id, false);
    }
    const groupDragClipIds =
      mode === 'move' && isSelected && selectedClipIds.size > 1
        ? Array.from(selectedClipIds)
        : [clip.id];
    const groupDragClips = groupDragClipIds
      .map((clipId) => getClipById(clipId))
      .filter((candidate): candidate is Clip => Boolean(candidate))
      .map((candidate) => ({
        id: candidate.id,
        startTime: candidate.startTime,
        duration: candidate.duration,
      }));
    const isGroupMove = mode === 'move' && groupDragClips.length > 1;
    dragRef.current = false;
    setClipGestureActive(true);

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
        if (isGroupMove) {
          const delta = clampGroupMoveDelta(groupDragClips, newStart - origStart, totalDuration);
          for (const groupClip of groupDragClips) {
            updateClip(groupClip.id, { startTime: groupClip.startTime + delta });
          }
          if (Math.abs(delta - lastPreviewStart) > 0.001) {
            setClipDragPreview({
              clipId: clip.id,
              sourceTrackId: track.id,
              hoverTrackId: track.id,
              startTime: origStart + delta,
              duration: clip.duration,
              color: track.color,
            });
            lastPreviewStart = delta;
          }
        } else {
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
        }
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
        latestDuration = newDuration;
        const maxDuration = origAudioDuration - origAudioOffset;
        extendsBeyondCurrentAudio = newDuration > maxDuration + EXTEND_EPSILON_SECONDS;
        updateClip(clip.id, {
          duration: newDuration,
          generationStatus: extendsBeyondCurrentAudio && clip.generationStatus === 'ready'
            ? 'stale'
            : clip.generationStatus,
        });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onMouseUp);
      setClipGestureActive(false);
      if (mode === 'move' && dragRef.current) {
        if (!isGroupMove && latestHoverTrackId !== track.id) {
          moveClipToTrack(clip.id, latestHoverTrackId, { startTime: latestStart });
        }
      }
      if (
        mode === 'resize-right'
        && dragRef.current
        && extendsBeyondCurrentAudio
        && (clip.generationStatus === 'ready' || clip.generationStatus === 'stale')
      ) {
        const extensionDuration = latestDuration - origDuration;
        if (extensionDuration > EXTEND_EPSILON_SECONDS) {
          openExtendConfirmDialog({
            clipId: clip.id,
            trackId: track.id,
            baseStartTime: origStart,
            baseDuration: origDuration,
            extensionDuration,
            originalGenerationStatus: clip.generationStatus,
          });
        }
      }
      setClipDragPreview(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onMouseUp);
  }, [
    clip,
    isSelected,
    pixelsPerSecond,
    project,
    selectedClipIds,
    selectClip,
    snapEnabled,
    snapResolution,
    updateClip,
    moveClipToTrack,
    setClipDragPreview,
    setClipGestureActive,
    openExtendConfirmDialog,
    isRepaintModeActive,
    openRepaintDialog,
    setRepaintModeActive,
    flushRepaintSelectionFrame,
    getClipById,
    track,
    getDragMode,
  ]);

  const handleMouseMoveLocal = useCallback((e: React.MouseEvent) => {
    if (isRepaintModeActive) {
      const el = e.currentTarget as HTMLElement;
      el.style.cursor = 'crosshair';
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const el = e.currentTarget as HTMLElement;
    if (relX <= EDGE_HANDLE_PX || relX >= rect.width - EDGE_HANDLE_PX) {
      el.style.cursor = 'col-resize';
    } else {
      el.style.cursor = 'grab';
    }
  }, [isRepaintModeActive]);

  useEffect(() => () => {
    if (repaintDragFrameRef.current != null) {
      window.cancelAnimationFrame(repaintDragFrameRef.current);
      repaintDragFrameRef.current = null;
    }
  }, []);

  return {
    dragRef,
    repaintSelectionPx,
    handleMouseDown,
    handleMouseMoveLocal,
  };
}
