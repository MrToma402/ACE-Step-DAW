import { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import type { Clip, Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useGenerationStore } from '../../store/generationStore';
import { useGeneration } from '../../hooks/useGeneration';
import { hexToRgba } from '../../utils/color';
import { snapTime } from '../../features/arrangement/snap';
import { isArrangementClipSelected } from '../../features/arrangement/selection';
import { estimateEtaSeconds, extractProgressPercent } from '../../features/generation/trackGenerationStatus';
import { normalizeSeconds } from '../../utils/time';
import { clampGroupMoveDelta } from '../../features/timeline/clipGroupMove';
import { extractTrackToNewTracks } from '../../services/stemExtractionPipeline';

interface ClipBlockProps {
  clip: Clip;
  track: Track;
}

const EDGE_HANDLE_PX = 6;
const MIN_CLIP_DURATION = 0.5;
const EXTEND_EPSILON_SECONDS = 0.05;

type DragMode = 'move' | 'resize-left' | 'resize-right';

export function ClipBlock({ clip, track }: ClipBlockProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const selectClip = useUIStore((s) => s.selectClip);
  const deselectAll = useUIStore((s) => s.deselectAll);
  const setEditingClip = useUIStore((s) => s.setEditingClip);
  const setDraftClipId = useUIStore((s) => s.setDraftClipId);
  const clipDragPreview = useUIStore((s) => s.clipDragPreview);
  const setClipDragPreview = useUIStore((s) => s.setClipDragPreview);
  const setClipGestureActive = useUIStore((s) => s.setClipGestureActive);
  const isShiftPressed = useUIStore((s) => s.isShiftPressed);
  const openRepaintDialog = useUIStore((s) => s.openRepaintDialog);
  const openCoverDialog = useUIStore((s) => s.openCoverDialog);
  const openExtendConfirmDialog = useUIStore((s) => s.openExtendConfirmDialog);
  const updateClip = useProjectStore((s) => s.updateClip);
  const moveClipToTrack = useProjectStore((s) => s.moveClipToTrack);
  const addTrack = useProjectStore((s) => s.addTrack);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const mergeClips = useProjectStore((s) => s.mergeClips);
  const getClipById = useProjectStore((s) => s.getClipById);
  const getTrackForClip = useProjectStore((s) => s.getTrackForClip);
  const generationJobs = useGenerationStore((s) => s.jobs);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
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
  const repaintDragFrameRef = useRef<number | null>(null);
  const repaintDragStartPxRef = useRef(0);
  const repaintDragEndPxRef = useRef(0);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [repaintSelectionPx, setRepaintSelectionPx] = useState<{ start: number; end: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

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
    const isRepaintSelectionDrag = isShiftPressed || e.shiftKey;
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
    if (mode === 'move' && !isSelected) {
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
    clip.id,
    clip.startTime,
    clip.duration,
    clip.audioOffset,
    clip.audioDuration,
    clip.generationStatus,
    clip.prompt,
    clip.lyrics,
    clip.arrangementSectionId,
    clip.arrangementTakeId,
    clip.bpm,
    clip.keyScale,
    clip.timeSignature,
    clip.sampleMode,
    clip.autoExpandPrompt,
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
    isShiftPressed,
    openRepaintDialog,
    flushRepaintSelectionFrame,
    getClipById,
    track.id,
    track.color,
    getDragMode,
  ]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current) return;
    setCtxMenu(null);
    selectClip(clip.id, e.metaKey || e.ctrlKey);
  }, [clip.id, selectClip]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftClipId(null);
    setEditingClip(clip.id);
  }, [clip.id, setDraftClipId, setEditingClip]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);
  const canMergeSelected = selectedClipIds.size >= 2 && selectedClipIds.has(clip.id);
  const canDeleteSelected = selectedClipIds.size >= 2 && selectedClipIds.has(clip.id);
  const deleteLabel = canDeleteSelected ? `Delete Selected (${selectedClipIds.size})` : 'Delete';
  const handleDelete = useCallback(() => {
    closeCtxMenu();
    const ids = canDeleteSelected ? Array.from(selectedClipIds) : [clip.id];
    for (const clipId of ids) {
      removeClip(clipId);
    }
    deselectAll();
  }, [canDeleteSelected, clip.id, closeCtxMenu, deselectAll, removeClip, selectedClipIds]);
  const handleMergeSelected = useCallback(() => {
    if (!canMergeSelected) return;
    closeCtxMenu();
    const selectedIds = Array.from(selectedClipIds);
    void (async () => {
      const { clip: mergedClip, reason } = await mergeClips(selectedIds);
      if (mergedClip) {
        selectClip(mergedClip.id, false);
        return;
      }
      if (reason && typeof window !== 'undefined') {
        window.alert(reason);
      }
    })();
  }, [canMergeSelected, closeCtxMenu, mergeClips, selectClip, selectedClipIds]);
  const handleDuplicateToNewLayer = useCallback(() => {
    const sourceClip = getClipById(clip.id);
    if (!sourceClip) return;
    const sourceTrack = getTrackForClip(clip.id);
    const duplicatedClip = duplicateClip(clip.id);
    if (!duplicatedClip) return;
    const layerTrack = addTrack(sourceTrack?.trackName ?? 'custom');
    moveClipToTrack(duplicatedClip.id, layerTrack.id, { startTime: sourceClip.startTime });
  }, [addTrack, clip.id, duplicateClip, getClipById, getTrackForClip, moveClipToTrack]);
  const handleExtractToTracks = useCallback(() => {
    if (isExtracting || isGenerating) return;
    closeCtxMenu();
    setIsExtracting(true);
    void (async () => {
      try {
        const result = await extractTrackToNewTracks(track.id, clip.id);
        const createdCount = result.createdTrackNames.length;
        const skippedCount = result.skippedTrackNames.length;
        const failedCount = result.failedTrackNames.length;
        const lines: string[] = [];
        lines.push(`Created ${createdCount} extracted track(s).`);
        if (skippedCount > 0) lines.push(`Skipped ${skippedCount} silent stem(s).`);
        if (failedCount > 0) lines.push(`Failed ${failedCount} stem(s).`);
        if (typeof window !== 'undefined') {
          window.alert(lines.join('\n'));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Stem extraction failed';
        if (typeof window !== 'undefined') {
          window.alert(message);
        }
      } finally {
        setIsExtracting(false);
      }
    })();
  }, [clip.id, closeCtxMenu, isExtracting, isGenerating, track.id]);

  const handleMouseMoveLocal = useCallback((e: React.MouseEvent) => {
    if (isShiftPressed || e.shiftKey) {
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
  }, [isShiftPressed]);

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
  const innerClipWidthPx = Math.max(width - 4, 0);
  const availableAudioDuration = Math.max(0, audioDuration - audioOffset);
  const renderedWaveDuration = Math.max(0, Math.min(clip.duration, availableAudioDuration));
  const waveformRatio = clip.duration > 0 ? (renderedWaveDuration / clip.duration) : 0;
  const waveformWidthPx = innerClipWidthPx * waveformRatio;
  const extensionWidthPx = Math.max(0, innerClipWidthPx - waveformWidthPx);

  const startPeakIdx = peaks && audioDuration > 0 ? Math.floor((audioOffset / audioDuration) * peaks.length) : 0;
  const endPeakIdx = peaks && audioDuration > 0 ? Math.min(
    Math.ceil(((audioOffset + renderedWaveDuration) / audioDuration) * peaks.length),
    peaks.length,
  ) : 0;
  const visiblePeakCount = endPeakIdx - startPeakIdx;
  const numBars = peaks ? Math.min(visiblePeakCount, Math.floor(waveformWidthPx / 2)) : 0;
  const barSpacing = numBars > 0 ? waveformWidthPx / numBars : 0;
  const waveformBars = useMemo(() => {
    if (!peaks || numBars <= 0 || visiblePeakCount <= 0) return [];
    return Array.from({ length: numBars }, (_, i) => {
      const peakIdx = startPeakIdx + Math.floor((i / numBars) * visiblePeakCount);
      const peak = peaks[Math.min(peakIdx, peaks.length - 1)];
      const h = peak * 80;
      return {
        x: i * barSpacing,
        y: 50 - h / 2,
        width: Math.max(barSpacing * 0.7, 0.5),
        height: Math.max(h, 1),
      };
    });
  }, [barSpacing, numBars, peaks, startPeakIdx, visiblePeakCount]);
  const activeJob = useMemo(
    () =>
      generationJobs.find((job) => (
        job.clipId === clip.id
        && (job.status === 'queued' || job.status === 'generating' || job.status === 'processing')
      )) ?? null,
    [clip.id, generationJobs],
  );
  const activeJobRepaintRegionPx = useMemo(() => {
    if (!activeJob || activeJob.repaintStartTime == null || activeJob.repaintEndTime == null) {
      return null;
    }
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;
    const start = Math.max(clipStart, Math.min(activeJob.repaintStartTime, clipEnd));
    const end = Math.max(start, Math.min(clipEnd, activeJob.repaintEndTime));
    const leftPx = Math.max(0, (start - clipStart) * pixelsPerSecond);
    const widthPx = Math.max(1, (end - start) * pixelsPerSecond);
    return { leftPx, widthPx };
  }, [activeJob, clip.startTime, clip.duration, pixelsPerSecond]);
  const clipStatusClass =
    activeJobRepaintRegionPx
    && (clip.generationStatus === 'queued' || clip.generationStatus === 'generating' || clip.generationStatus === 'processing')
      ? ''
      : (statusStyles[clip.generationStatus] ?? '');
  const compactStatusLabel = useMemo(() => {
    if (!activeJob) return null;
    if (activeJob.status === 'queued') return 'Queued';
    if (activeJob.status === 'processing') return 'Processing';
    const progressPct = extractProgressPercent(activeJob.progress);
    if (progressPct === null) return 'Generating';
    const etaSeconds = estimateEtaSeconds(activeJob.startedAt, progressPct, nowMs);
    if (etaSeconds === null) return `${Math.round(progressPct)}%`;
    return `${Math.round(progressPct)}% · ~${String(Math.floor(etaSeconds / 60)).padStart(2, '0')}:${String(etaSeconds % 60).padStart(2, '0')}`;
  }, [activeJob, nowMs]);

  useEffect(() => {
    if (!activeJob) return;
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [activeJob?.id]);
  const shouldShowWaveform =
    peaks
    && (numBars > 0 || extensionWidthPx > 1)
    && (clip.generationStatus === 'ready' || clip.generationStatus === 'stale' || activeJob !== null);
  const repaintSelectionMeta = useMemo(() => {
    if (!repaintSelectionPx) return null;
    const clipEnd = clip.startTime + clip.duration;
    const startPx = Math.min(repaintSelectionPx.start, repaintSelectionPx.end);
    const endPx = Math.max(repaintSelectionPx.start, repaintSelectionPx.end);
    const startTime = normalizeSeconds(
      Math.max(clip.startTime, Math.min(clip.startTime + (startPx / pixelsPerSecond), clipEnd)),
      2,
    );
    const endTime = normalizeSeconds(
      Math.max(startTime, Math.min(clip.startTime + (endPx / pixelsPerSecond), clipEnd)),
      2,
    );
    const duration = normalizeSeconds(endTime - startTime, 2);
    return { startTime, endTime, duration };
  }, [clip.duration, clip.startTime, pixelsPerSecond, repaintSelectionPx]);

  useEffect(() => () => {
    if (repaintDragFrameRef.current != null) {
      window.cancelAnimationFrame(repaintDragFrameRef.current);
      repaintDragFrameRef.current = null;
    }
  }, []);

  return (
    <>
      <div
        data-clip-id={clip.id}
        className={`absolute top-1 bottom-1 rounded select-none overflow-hidden border border-white/10
          ${clipStatusClass}
          ${arrangementSelected || hideInactiveTakes ? '' : 'opacity-40'}
          ${isSelected ? 'ring-1 ring-daw-accent ring-offset-1 ring-offset-transparent' : ''}
          ${isHovered ? 'ring-1 ring-amber-400/60' : ''}
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
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={handleContextMenu}
      >
        {/* Resize handles */}
        <div className="absolute top-0 bottom-0 left-0 w-[6px] cursor-col-resize z-10" />
        <div className="absolute top-0 bottom-0 right-0 w-[6px] cursor-col-resize z-10" />

        {/* Waveform */}
        {shouldShowWaveform && (
          <div className="absolute inset-0 overflow-hidden">
            {numBars > 0 && (
              <svg
                width={waveformWidthPx}
                height="100%"
                viewBox={`0 0 ${waveformWidthPx} 100`}
                preserveAspectRatio="none"
                className="opacity-50 ml-0.5"
              >
                {waveformBars.map((bar, i) => (
                  <rect
                    key={i}
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    fill={track.color}
                  />
                ))}
              </svg>
            )}
            {extensionWidthPx > 1 && (
              <div
                className="absolute top-0 bottom-0 bg-black/20 border-l border-white/10"
                style={{ left: waveformWidthPx + 0.5, width: extensionWidthPx }}
              />
            )}
          </div>
        )}

        {/* Label */}
        <div className="absolute top-1.5 left-2 right-1.5 text-[9px] font-bold text-slate-400 truncate leading-none z-10 pointer-events-none">
          {clip.prompt || '(no prompt)'}
        </div>

        {repaintSelectionPx && (
          <div
            className="absolute top-0 bottom-0 bg-amber-400/25 border-x border-amber-300/70 pointer-events-none z-20"
            style={{
              left: Math.min(repaintSelectionPx.start, repaintSelectionPx.end),
              width: Math.max(1, Math.abs(repaintSelectionPx.end - repaintSelectionPx.start)),
            }}
          >
            {repaintSelectionMeta && (
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-semibold text-amber-200 whitespace-nowrap px-1 py-0.5 rounded bg-black/50 border border-amber-200/30">
                {repaintSelectionMeta.startTime.toFixed(2)}s - {repaintSelectionMeta.endTime.toFixed(2)}s ({repaintSelectionMeta.duration.toFixed(2)}s)
              </div>
            )}
          </div>
        )}

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
          activeJobRepaintRegionPx ? (
            <div
              className="absolute top-0 bottom-0 pointer-events-none bg-black/25 border-x border-daw-accent/45 z-20 flex items-center justify-center"
              style={{
                left: activeJobRepaintRegionPx.leftPx,
                width: activeJobRepaintRegionPx.widthPx,
              }}
            >
              <div className="flex flex-col items-center gap-1 px-1">
                <div className="w-4 h-4 border-2 border-daw-accent border-t-transparent rounded-full animate-spin" />
                {compactStatusLabel && (
                  <div className="text-[8px] font-semibold text-daw-accent/95 whitespace-nowrap px-1 py-0.5 rounded bg-black/45 border border-daw-accent/30">
                    {compactStatusLabel}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
              <div className="flex flex-col items-center gap-1">
                <div className="w-4 h-4 border-2 border-daw-accent border-t-transparent rounded-full animate-spin" />
                {compactStatusLabel && (
                  <div className="text-[8px] font-semibold text-daw-accent/95 whitespace-nowrap px-1 py-0.5 rounded bg-black/45 border border-daw-accent/30">
                    {compactStatusLabel}
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {clip.generationStatus === 'processing' && activeJobRepaintRegionPx && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none bg-black/20 border-x border-emerald-300/45 z-20"
            style={{
              left: activeJobRepaintRegionPx.leftPx,
              width: activeJobRepaintRegionPx.widthPx,
            }}
          />
        )}
        {clip.generationStatus === 'queued' && activeJobRepaintRegionPx && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none bg-black/15 border-x border-slate-300/40 z-20"
            style={{
              left: activeJobRepaintRegionPx.leftPx,
              width: activeJobRepaintRegionPx.widthPx,
            }}
          />
        )}
        {clip.generationStatus === 'queued' && compactStatusLabel && (
          <div className="absolute bottom-1 left-2 text-[8px] text-slate-300 truncate pointer-events-none">
            {compactStatusLabel}
          </div>
        )}
        {clip.generationStatus === 'processing' && compactStatusLabel && (
          <div className="absolute bottom-1 left-2 text-[8px] text-emerald-300 truncate pointer-events-none">
            {compactStatusLabel}
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
          onEdit={() => { closeCtxMenu(); setDraftClipId(null); setEditingClip(clip.id); }}
          onGenerate={() => { closeCtxMenu(); generateClip(clip.id); }}
          onCover={() => { closeCtxMenu(); openCoverDialog({ clipId: clip.id, referenceClipId: clip.id }); }}
          onDuplicate={() => { closeCtxMenu(); duplicateClip(clip.id); }}
          onDuplicateToNewLayer={() => { closeCtxMenu(); handleDuplicateToNewLayer(); }}
          onExtractToTracks={handleExtractToTracks}
          canExtractToTracks={!isExtracting && !isGenerating}
          onMergeSelected={handleMergeSelected}
          canMergeSelected={canMergeSelected}
          onDelete={handleDelete}
          deleteLabel={deleteLabel}
          onClose={closeCtxMenu}
          hasPrompt={!!clip.prompt}
          hasReferenceAudio={!!clip.isolatedAudioKey}
        />
      )}
    </>
  );
}

function ClipContextMenu({
  x,
  y,
  onEdit,
  onGenerate,
  onCover,
  onDuplicate,
  onDuplicateToNewLayer,
  onExtractToTracks,
  canExtractToTracks,
  onMergeSelected,
  canMergeSelected,
  onDelete,
  deleteLabel,
  onClose,
  hasPrompt,
  hasReferenceAudio,
}: {
  x: number;
  y: number;
  onEdit: () => void;
  onGenerate: () => void;
  onCover: () => void;
  onDuplicate: () => void;
  onDuplicateToNewLayer: () => void;
  onExtractToTracks: () => void;
  canExtractToTracks: boolean;
  onMergeSelected: () => void;
  canMergeSelected: boolean;
  onDelete: () => void;
  deleteLabel: string;
  onClose: () => void;
  hasPrompt: boolean;
  hasReferenceAudio: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-50 bg-daw-panel border border-daw-border rounded shadow-2xl py-1 min-w-[220px]"
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
          onClick={onCover}
          disabled={!hasReferenceAudio}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors disabled:text-slate-700 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">mic</span>
          Cover
        </button>
        <button
          onClick={onDuplicate}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">content_copy</span>
          Duplicate (Ctrl+D)
        </button>
        <button
          onClick={onDuplicateToNewLayer}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">view_week</span>
          Duplicate to New Layer (Ctrl+Shift+D)
        </button>
        <button
          onClick={onExtractToTracks}
          disabled={!canExtractToTracks}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors disabled:text-slate-700 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">call_split</span>
          Extract To Tracks
        </button>
        {canMergeSelected && (
          <button
            onClick={onMergeSelected}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-xs">merge_type</span>
            Merge Selected (M)
          </button>
        )}
        <div className="my-1 border-t border-daw-border" />
        <button
          onClick={onDelete}
          className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/20 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">delete</span>
          {deleteLabel}
        </button>
      </div>
    </>
  );
}
