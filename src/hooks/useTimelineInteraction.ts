import { useCallback } from 'react';
import { useUIStore } from '../store/uiStore';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { useArrangementStore } from '../store/arrangementStore';
import { snapTime } from '../features/arrangement/snap';

export function useTimelineInteraction() {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const project = useProjectStore((s) => s.project);
  const addClip = useProjectStore((s) => s.addClip);
  const setDraftClipId = useUIStore((s) => s.setDraftClipId);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] : undefined,
  );
  const snapEnabled = workspace?.settings.snapEnabled ?? true;
  const snapResolution = workspace?.settings.snapResolution ?? '1_4';

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

      setDraftClipId(clip.id);
      useUIStore.getState().setEditingClip(clip.id);
    },
    [project, addClip, setDraftClipId],
  );

  const handleLaneClick = useCallback(
    (_trackId: string, clickX: number, scrollX: number) => {
      if (!project) return;
      const time = (clickX + scrollX) / pixelsPerSecond;
      useTransportStore.getState().seek(Math.max(0, Math.min(time, project.totalDuration)));
    },
    [project, pixelsPerSecond],
  );

  const handleLaneDragSelection = useCallback(
    (trackId: string, startX: number, endX: number, scrollX: number) => {
      if (!project) return;
      const rangeStartX = Math.min(startX, endX) + scrollX;
      const rangeEndX = Math.max(startX, endX) + scrollX;
      const rawStart = rangeStartX / pixelsPerSecond;
      const rawEnd = rangeEndX / pixelsPerSecond;
      const snappedStart = snapTime(rawStart, project.bpm, snapEnabled, snapResolution);
      const snappedEnd = snapTime(rawEnd, project.bpm, snapEnabled, snapResolution);
      createClipInRange(trackId, snappedStart, snappedEnd);
    },
    [project, pixelsPerSecond, createClipInRange, snapEnabled, snapResolution],
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
