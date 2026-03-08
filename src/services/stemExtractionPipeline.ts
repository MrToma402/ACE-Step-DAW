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

interface SourceMix {
  blob: Blob;
  duration: number;
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
): Promise<SourceMix> {
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

  const engine = getAudioEngine();
  const sampleRate = engine.ctx.sampleRate || 48000;

  const decodedClips: Array<{ clip: Track['clips'][number]; buffer: AudioBuffer }> = [];
  let timelineEnd = 0;
  for (const clip of readyClips) {
    if (!clip.isolatedAudioKey) continue;
    const blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
    if (!blob) continue;
    try {
      const buffer = await engine.decodeAudioData(blob);
      decodedClips.push({ clip, buffer });
      timelineEnd = Math.max(timelineEnd, clip.startTime + Math.max(0, clip.duration));
    } catch (error) {
      console.warn(`[extract] Failed to decode clip ${clip.id}`, error);
    }
  }
  if (decodedClips.length === 0 || timelineEnd <= 0) {
    throw new Error('Track has no decodable audio clips to extract.');
  }

  const totalLength = Math.max(1, Math.ceil(timelineEnd * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, totalLength, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.connect(offlineCtx.destination);

  for (const { clip, buffer } of decodedClips) {
    const clipOffset = Math.max(0, clip.audioOffset ?? 0);
    const availableDuration = Math.max(0, buffer.duration - clipOffset);
    const playbackDuration = Math.max(0, Math.min(clip.duration, availableDuration));
    if (playbackDuration <= 0) continue;

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    const gain = offlineCtx.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(masterGain);
    source.start(clip.startTime, clipOffset, playbackDuration);
  }

  const rendered = await offlineCtx.startRendering();
  limitBufferPeak(rendered, TARGET_PEAK);
  return {
    blob: audioBufferToWavBlob(rendered),
    duration: rendered.duration,
  };
}

export async function extractTrackToNewTracks(
  sourceTrackId: string,
  sourceClipId?: string,
): Promise<ExtractTrackStemsResult> {
  const projectStore = useProjectStore.getState();
  const project = projectStore.project;
  if (!project) {
    throw new Error('No project loaded.');
  }
  if (useGenerationStore.getState().isGenerating) {
    throw new Error('Generation is in progress. Please wait until it finishes.');
  }

  const sourceTrack = projectStore.getTrackById(sourceTrackId);
  if (!sourceTrack) {
    throw new Error('Source track not found.');
  }

  useGenerationStore.getState().setIsGenerating(true);
  try {
    const sourceMix = await buildTrackSourceMix(project, sourceTrack, sourceClipId);
    const result: ExtractTrackStemsResult = {
      createdTrackNames: [],
      skippedTrackNames: [],
      failedTrackNames: [],
    };
    const engine = getAudioEngine();

    for (const trackName of EXTRACT_TRACK_NAMES) {
      try {
        const params = buildExtractParams(project, trackName, sourceMix.duration);
        const generated = await generateTask(sourceMix.blob, params);
        const decoded = await engine.decodeAudioData(generated.audioBlob);

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
        result.failedTrackNames.push({
          trackName,
          reason: error instanceof Error ? error.message : 'Unknown extraction error',
        });
      }
    }

    return result;
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
}
