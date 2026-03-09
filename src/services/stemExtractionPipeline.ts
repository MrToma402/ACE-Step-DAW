import type { ExtractTaskParams } from '../types/api';
import type { Project, Track, TrackName } from '../types/project';
import { TRACK_CATALOG, TRACK_NAMES } from '../constants/tracks';
import { isArrangementClipSelected } from '../features/arrangement/selection';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { useArrangementStore } from '../store/arrangementStore';
import { useGenerationStore } from '../store/generationStore';
import { useProjectStore } from '../store/projectStore';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { audioBufferToWavBlob } from '../utils/wav';
import { generateTask } from './aceStepApi';
import { loadAudioBlobByKey, saveAudioBlob } from './audioFileManager';
import { hasAudibleContent, limitBufferPeak } from './extractAudioAnalysis';

const EXTRACT_TRACK_NAMES: TrackName[] = TRACK_NAMES.filter(
  (name): name is TrackName => name !== 'complete',
);
const TARGET_PEAK = 0.98;
const SILENCE_RMS_THRESHOLD = 0.002;
const SILENCE_PEAK_THRESHOLD = 0.02;

export interface ExtractTrackStemsResult {
  createdTrackNames: TrackName[];
  skippedTrackNames: TrackName[];
  failedTrackNames: Array<{ trackName: TrackName; reason: string }>;
}

export type ExtractTrackProgressPhase = 'preparing' | 'extracting' | 'done';

export interface ExtractTrackProgress {
  phase: ExtractTrackProgressPhase;
  completed: number;
  total: number;
  currentTrackName: TrackName | null;
  detail?: string;
}

interface ExtractTrackOptions {
  onProgress?: (progress: ExtractTrackProgress) => void;
  signal?: AbortSignal;
}

interface SourceMix {
  blob: Blob;
  duration: number;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException('The operation was aborted.', 'AbortError');
}

function emitPreparingProgress(
  onProgress: ExtractTrackOptions['onProgress'],
  completed: number,
  total: number,
  detail: string,
): void {
  onProgress?.({
    phase: 'preparing',
    completed,
    total,
    currentTrackName: null,
    detail,
  });
}

function buildExtractParams(project: Project, trackName: TrackName, duration: number): ExtractTaskParams {
  return {
    task_type: 'extract',
    track_name: trackName,
    instruction: `Extract the ${trackName.toUpperCase()} track from the audio:`,
    prompt: `Extract ${TRACK_CATALOG[trackName].displayName}`,
    lyrics: '[Instrumental]',
    audio_duration: duration,
    bpm: null,
    key_scale: '',
    time_signature: '',
    inference_steps: project.generationDefaults.inferenceSteps,
    guidance_scale: project.generationDefaults.guidanceScale,
    shift: project.generationDefaults.shift,
    batch_size: 1,
    audio_format: 'wav',
    thinking: false,
    model: project.generationDefaults.model || undefined,
    use_cot_caption: false,
    use_cot_metas: false,
    use_cot_language: false,
  };
}

async function buildTrackSourceMix(
  project: Project,
  track: Track,
  sourceClipId?: string,
  options: ExtractTrackOptions = {},
): Promise<SourceMix> {
  throwIfAborted(options.signal);
  const workspace = useArrangementStore.getState().workspacesByProjectId[project.id] ?? null;
  const readyClips = track.clips.filter(
    (clip) =>
      (!sourceClipId || clip.id === sourceClipId)
      && isArrangementClipSelected(clip, workspace)
      && clip.generationStatus === 'ready'
      && Boolean(clip.isolatedAudioKey),
  );
  if (readyClips.length === 0) {
    throw new Error('Track has no ready audio clips to extract.');
  }
  const prepTotalSteps = Math.max(2, readyClips.length + 1);
  emitPreparingProgress(options.onProgress, 0, prepTotalSteps, 'Loading source clips...');

  const engine = getAudioEngine();
  const sampleRate = engine.ctx.sampleRate || 48000;

  const decodedClips: Array<{
    buffer: AudioBuffer;
    timelineStart: number;
    clipOffset: number;
    playbackDuration: number;
  }> = [];
  let timelineStart = Number.POSITIVE_INFINITY;
  let timelineEnd = 0;
  for (const [clipIndex, clip] of readyClips.entries()) {
    throwIfAborted(options.signal);
    emitPreparingProgress(
      options.onProgress,
      clipIndex,
      prepTotalSteps,
      `Decoding clip ${clipIndex + 1}/${readyClips.length}...`,
    );
    if (!clip.isolatedAudioKey) continue;
    const blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
    throwIfAborted(options.signal);
    if (!blob) continue;
    try {
      const buffer = await engine.decodeAudioData(blob);
      throwIfAborted(options.signal);
      const clipOffset = Math.max(0, clip.audioOffset ?? 0);
      const availableDuration = Math.max(0, buffer.duration - clipOffset);
      const unclampedPlaybackDuration = Math.max(0, Math.min(clip.duration, availableDuration));
      const clipTimelineStart = Math.max(0, Math.min(project.totalDuration, clip.startTime));
      const clipTimelineEnd = Math.max(
        clipTimelineStart,
        Math.min(project.totalDuration, clip.startTime + unclampedPlaybackDuration),
      );
      const playbackDuration = Math.max(0, clipTimelineEnd - clipTimelineStart);
      if (playbackDuration <= 0) continue;
      decodedClips.push({
        buffer,
        timelineStart: clipTimelineStart,
        clipOffset,
        playbackDuration,
      });
      timelineStart = Math.min(timelineStart, clipTimelineStart);
      timelineEnd = Math.max(timelineEnd, clipTimelineStart + playbackDuration);
    } catch (error) {
      console.warn(`[extract] Failed to decode clip ${clip.id}`, error);
    }
  }
  if (decodedClips.length === 0 || timelineEnd <= 0 || !Number.isFinite(timelineStart)) {
    throw new Error('Track has no decodable audio clips to extract.');
  }
  throwIfAborted(options.signal);
  emitPreparingProgress(
    options.onProgress,
    prepTotalSteps - 1,
    prepTotalSteps,
    'Rendering source mix...',
  );

  const trimmedDuration = Math.max(0.1, timelineEnd - timelineStart);
  const totalLength = Math.max(1, Math.ceil(trimmedDuration * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, totalLength, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.connect(offlineCtx.destination);

  for (const { buffer, timelineStart: clipTimelineStart, clipOffset, playbackDuration } of decodedClips) {
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    const gain = offlineCtx.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(masterGain);
    source.start(Math.max(0, clipTimelineStart - timelineStart), clipOffset, playbackDuration);
  }

  throwIfAborted(options.signal);
  const rendered = await offlineCtx.startRendering();
  throwIfAborted(options.signal);
  limitBufferPeak(rendered, TARGET_PEAK);
  emitPreparingProgress(options.onProgress, prepTotalSteps, prepTotalSteps, 'Source audio ready');
  return {
    blob: audioBufferToWavBlob(rendered),
    duration: rendered.duration,
  };
}

export async function extractTrackToNewTracks(
  sourceTrackId: string,
  sourceClipId?: string,
  options: ExtractTrackOptions = {},
): Promise<ExtractTrackStemsResult> {
  const projectStore = useProjectStore.getState();
  const project = projectStore.project;
  if (!project) {
    throw new Error('No project loaded.');
  }
  if (useGenerationStore.getState().isGenerating) {
    throw new Error('Generation is in progress. Please wait until it finishes.');
  }
  throwIfAborted(options.signal);

  const sourceTrack = projectStore.getTrackById(sourceTrackId);
  if (!sourceTrack) {
    throw new Error('Source track not found.');
  }

  useGenerationStore.getState().setIsGenerating(true);
  try {
    options.onProgress?.({
      phase: 'preparing',
      completed: 0,
      total: Math.max(2, sourceTrack.clips.length + 1),
      currentTrackName: null,
      detail: 'Preparing source audio...',
    });
    const sourceMix = await buildTrackSourceMix(project, sourceTrack, sourceClipId, options);
    throwIfAborted(options.signal);
    const result: ExtractTrackStemsResult = {
      createdTrackNames: [],
      skippedTrackNames: [],
      failedTrackNames: [],
    };
    const engine = getAudioEngine();
    let processedCount = 0;

    options.onProgress?.({
      phase: 'extracting',
      completed: processedCount,
      total: EXTRACT_TRACK_NAMES.length,
      currentTrackName: null,
    });

    for (const trackName of EXTRACT_TRACK_NAMES) {
      options.onProgress?.({
        phase: 'extracting',
        completed: processedCount,
        total: EXTRACT_TRACK_NAMES.length,
        currentTrackName: trackName,
        detail: `Extracting ${TRACK_CATALOG[trackName].displayName}...`,
      });
      try {
        const params = buildExtractParams(project, trackName, sourceMix.duration);
        const generated = await generateTask(sourceMix.blob, params, {
          signal: options.signal,
        });
        throwIfAborted(options.signal);
        const decoded = await engine.decodeAudioData(generated.audioBlob);
        throwIfAborted(options.signal);

        if (!hasAudibleContent(decoded, SILENCE_PEAK_THRESHOLD, SILENCE_RMS_THRESHOLD)) {
          result.skippedTrackNames.push(trackName);
          continue;
        }

        limitBufferPeak(decoded, TARGET_PEAK);
        const normalizedBlob = audioBufferToWavBlob(decoded);
        const extractedTrack = useProjectStore.getState().addTrack(trackName);
        const extractedClip = useProjectStore.getState().addClip(extractedTrack.id, {
          startTime: 0,
          duration: decoded.duration,
          prompt: `Extracted ${TRACK_CATALOG[trackName].displayName}`,
          lyrics: '',
        });
        const isolatedKey = await saveAudioBlob(project.id, extractedClip.id, 'isolated', normalizedBlob);
        const peaks = computeWaveformPeaks(decoded, 200);

        useProjectStore.getState().updateClipStatus(extractedClip.id, 'ready', {
          isolatedAudioKey: isolatedKey,
          waveformPeaks: peaks,
          audioDuration: decoded.duration,
          audioOffset: 0,
          errorMessage: undefined,
        });
        result.createdTrackNames.push(trackName);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }
        result.failedTrackNames.push({
          trackName,
          reason: error instanceof Error ? error.message : 'Unknown extraction error',
        });
      } finally {
        processedCount += 1;
        options.onProgress?.({
          phase: 'extracting',
          completed: processedCount,
          total: EXTRACT_TRACK_NAMES.length,
          currentTrackName: trackName,
        });
      }
    }

    options.onProgress?.({
      phase: 'done',
      completed: EXTRACT_TRACK_NAMES.length,
      total: EXTRACT_TRACK_NAMES.length,
      currentTrackName: null,
      detail: 'Extraction complete',
    });
    return result;
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
}
