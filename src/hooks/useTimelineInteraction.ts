import { useCallback } from 'react';
import { useUIStore } from '../store/uiStore';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { snapToGrid } from '../utils/time';

export function useTimelineInteraction() {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const project = useProjectStore((s) => s.project);
  const addClip = useProjectStore((s) => s.addClip);

  const pixelsToSeconds = useCallback(
    (px: number) => px / pixelsPerSecond,
    [pixelsPerSecond],
  );

  const secondsToPixels = useCallback(
    (s: number) => s * pixelsPerSecond,
    [pixelsPerSecond],
  );

  const createClipInRange = useCallback(
    (trackId: string, startTime: number, endTime: number) => {
      if (!project) return;

      const beatDuration = 60 / project.bpm;
      const minDuration = Math.max(0.5, beatDuration);
      const clippedStart = Math.max(0, Math.min(startTime, project.totalDuration));
      const clippedEnd = Math.max(clippedStart + minDuration, Math.min(endTime, project.totalDuration));
      const safeDuration = Math.max(minDuration, clippedEnd - clippedStart);

      const clip = addClip(trackId, {
        startTime: clippedStart,
        duration: Math.min(safeDuration, project.totalDuration - clippedStart),
        prompt: '',
        lyrics: '',
      });

      useUIStore.getState().setEditingClip(clip.id);
    },
    [project, addClip],
  );

  const handleLaneClick = useCallback(
    (trackId: string, clickX: number, scrollX: number) => {
      if (!project) return;

      const rawTime = (clickX + scrollX) / pixelsPerSecond;
      const snappedTime = snapToGrid(rawTime, project.bpm, 1);
      const beatDuration = 60 / project.bpm;
      const defaultDuration = beatDuration * project.timeSignature * 2; // 2 bars
      const endTime = Math.min(snappedTime + defaultDuration, project.totalDuration);

      createClipInRange(trackId, snappedTime, endTime);
    },
    [project, pixelsPerSecond, createClipInRange],
  );

  const handleLaneDragSelection = useCallback(
    (trackId: string, startX: number, endX: number, scrollX: number) => {
      if (!project) return;
      const rangeStartX = Math.min(startX, endX) + scrollX;
      const rangeEndX = Math.max(startX, endX) + scrollX;
      const rawStart = rangeStartX / pixelsPerSecond;
      const rawEnd = rangeEndX / pixelsPerSecond;
      const snappedStart = snapToGrid(rawStart, project.bpm, 1);
      const snappedEnd = snapToGrid(rawEnd, project.bpm, 1);
      createClipInRange(trackId, snappedStart, snappedEnd);
    },
    [project, pixelsPerSecond, createClipInRange],
  );

  const handleTimelineClick = useCallback(
    (clickX: number, scrollX: number) => {
      if (!project) return;
      const time = (clickX + scrollX) / pixelsPerSecond;
      useTransportStore.getState().seek(Math.max(0, Math.min(time, project.totalDuration)));
    },
    [project, pixelsPerSecond],
  );

  return {
    pixelsToSeconds,
    secondsToPixels,
    handleLaneClick,
    handleLaneDragSelection,
    handleTimelineClick,
  };
}
