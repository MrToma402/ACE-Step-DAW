import { useEffect, useMemo, useState } from 'react';
import { estimateEtaSeconds, extractProgressPercent } from '../../../features/generation/trackGenerationStatus';
import { normalizeSeconds } from '../../../utils/time';
import type { GenerationJob } from '../../../store/generationStore';
import type { Clip } from '../../../types/project';

const STATUS_STYLES: Record<string, string> = {
  empty: 'opacity-60',
  queued: 'opacity-70',
  generating: 'opacity-80 animate-pulse',
  processing: 'opacity-80 animate-pulse',
  ready: '',
  error: 'opacity-60',
  stale: 'opacity-50',
};

interface UseClipVisualStateOptions {
  clip: Clip;
  generationJobs: GenerationJob[];
  pixelsPerSecond: number;
  repaintSelectionPx: { start: number; end: number } | null;
}

export function useClipVisualState({
  clip,
  generationJobs,
  pixelsPerSecond,
  repaintSelectionPx,
}: UseClipVisualStateOptions) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const audioDuration = clip.audioDuration ?? clip.duration;
  const audioOffset = clip.audioOffset ?? 0;
  const innerClipWidthPx = Math.max((clip.duration * pixelsPerSecond) - 4, 0);
  const availableAudioDuration = Math.max(0, audioDuration - audioOffset);
  const renderedWaveDuration = Math.max(0, Math.min(clip.duration, availableAudioDuration));
  const waveformRatio = clip.duration > 0 ? (renderedWaveDuration / clip.duration) : 0;
  const waveformWidthPx = innerClipWidthPx * waveformRatio;
  const extensionWidthPx = Math.max(0, innerClipWidthPx - waveformWidthPx);

  const peaks = clip.waveformPeaks;
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
      : (STATUS_STYLES[clip.generationStatus] ?? '');
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

  return {
    clipStatusClass,
    shouldShowWaveform,
    numBars,
    waveformWidthPx,
    waveformBars,
    extensionWidthPx,
    activeJobRepaintRegionPx,
    compactStatusLabel,
    repaintSelectionMeta,
  };
}
