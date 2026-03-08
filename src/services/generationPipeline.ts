import { v4 as uuidv4 } from 'uuid';
import { useProjectStore } from '../store/projectStore';
import { useGenerationStore } from '../store/generationStore';
import type { LegoTaskParams, TaskResultItem } from '../types/api';
import type { InferredMetas } from '../types/project';
import * as api from './aceStepApi';
import { generateViaModal } from './modalApi';
import { generateSilenceWav } from './silenceGenerator';
import { saveAudioBlob, loadAudioBlobByKey } from './audioFileManager';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { isolateTrackAudio } from '../engine/waveSubtraction';
import { audioBufferToWavBlob } from '../utils/wav';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { POLL_INTERVAL_MS, MAX_POLL_DURATION_MS } from '../constants/defaults';
import { buildLegoPromptContent } from './legoPromptBuilder';
import { buildRegenerationContextMix } from './regenerationContext';
import { buildTrackGenerationTextInputs } from '../features/generation/trackLyricsPolicy';

const EDGE_FADE_SECONDS = 0.005;
const MIN_REPAINT_DURATION_SECONDS = 0.1;
const TARGET_ISOLATED_PEAK = 0.98;
const WAVE_SUBTRACTION_ALPHA = 1.0;
const WAVE_SUBTRACTION_GAIN_MATCH = true;
const WAVE_SUBTRACTION_MIN_GAIN = 0.5;
const WAVE_SUBTRACTION_MAX_GAIN = 2.0;
const WAVE_SUBTRACTION_ADAPTIVE_ALPHA = true;
const WAVE_SUBTRACTION_ADAPTIVE_FLOOR = 0.9;
const WAVE_SUBTRACTION_CORRELATION_STRIDE = 4;
const WAVE_SUBTRACTION_LAG_COMPENSATION = true;
const WAVE_SUBTRACTION_MAX_LAG_SAMPLES = 96;
const WAVE_SUBTRACTION_BLEED_GATE = true;
const WAVE_SUBTRACTION_BLEED_GATE_THRESHOLD = 0.28;
const WAVE_SUBTRACTION_BLEED_CORRELATION_THRESHOLD = 0.55;
const WAVE_SUBTRACTION_BLOCK_SIZE = 2048;
const WAVE_SUBTRACTION_BLOCK_HOP = 1024;
const WAVE_SUBTRACTION_DECORRELATE_RESIDUAL = true;
const WAVE_SUBTRACTION_DECORRELATION_THRESHOLD = 0.65;
const WAVE_SUBTRACTION_MAX_DECORRELATION = 0.3;
const WAVE_SUBTRACTION_ORTHOGONALIZE_RESIDUAL = true;
const WAVE_SUBTRACTION_ORTHOGONALIZE_CAP = 0.18;

async function buildLegoSourceAudio(
  previousCumulativeBlob: Blob | null,
  previousContextEnd: number | null,
  totalDuration: number,
): Promise<Blob> {
  if (!previousCumulativeBlob) {
    return generateSilenceWav(totalDuration);
  }
  if (previousContextEnd == null) {
    return previousCumulativeBlob;
  }

  const engine = getAudioEngine();
  const decoded = await engine.decodeAudioData(previousCumulativeBlob);
  const cutoffSample = Math.max(0, Math.min(
    decoded.length,
    Math.floor(previousContextEnd * decoded.sampleRate),
  ));
  if (cutoffSample >= decoded.length) {
    return previousCumulativeBlob;
  }

  const sanitized = engine.ctx.createBuffer(
    decoded.numberOfChannels,
    decoded.length,
    decoded.sampleRate,
  );
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const src = decoded.getChannelData(ch);
    const dst = sanitized.getChannelData(ch);
    if (cutoffSample > 0) {
      dst.set(src.subarray(0, cutoffSample), 0);
    }
  }
  return audioBufferToWavBlob(sanitized);
}

function getClipEndTime(clip: { startTime: number; duration: number }): number {
  return clip.startTime + clip.duration;
}

interface RepaintRangeOverrides {
  startTime: number;
  endTime: number;
}

function resolveRepaintingBounds(
  clip: { startTime: number; duration: number },
  repaintRange?: RepaintRangeOverrides,
): { startTime: number; endTime: number } {
  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + clip.duration;
  if (!repaintRange || clipEnd - clipStart <= MIN_REPAINT_DURATION_SECONDS) {
    return { startTime: clipStart, endTime: clipEnd };
  }

  const rawStart = Math.min(repaintRange.startTime, repaintRange.endTime);
  const rawEnd = Math.max(repaintRange.startTime, repaintRange.endTime);
  let startTime = Math.max(clipStart, Math.min(rawStart, clipEnd));
  let endTime = Math.max(
    startTime + MIN_REPAINT_DURATION_SECONDS,
    Math.min(rawEnd, clipEnd),
  );
  if (endTime > clipEnd) {
    endTime = clipEnd;
    startTime = Math.max(clipStart, endTime - MIN_REPAINT_DURATION_SECONDS);
  }
  return { startTime, endTime };
}

function extractClipBufferFromTimeline(
  ctx: AudioContext,
  timelineBuffer: AudioBuffer,
  clipStart: number,
  clipDuration: number,
): AudioBuffer {
  const sampleRate = timelineBuffer.sampleRate;
  const startSample = Math.floor(clipStart * sampleRate);
  const endSample = Math.min(
    Math.floor((clipStart + clipDuration) * sampleRate),
    timelineBuffer.length,
  );
  const trimmedLength = Math.max(1, endSample - startSample);
  const trimmedBuffer = ctx.createBuffer(
    timelineBuffer.numberOfChannels,
    trimmedLength,
    sampleRate,
  );
  for (let ch = 0; ch < timelineBuffer.numberOfChannels; ch++) {
    const src = timelineBuffer.getChannelData(ch);
    const dst = trimmedBuffer.getChannelData(ch);
    for (let i = 0; i < trimmedLength; i++) {
      dst[i] = src[startSample + i];
    }
  }
  return trimmedBuffer;
}

function buildPatchedClipBuffer(
  ctx: AudioContext,
  fullIsolatedBuffer: AudioBuffer,
  baseClipBuffer: AudioBuffer,
  clipStart: number,
  clipDuration: number,
  repaintingBounds: { startTime: number; endTime: number },
): AudioBuffer {
  const sampleRate = fullIsolatedBuffer.sampleRate;
  const targetLength = Math.max(1, Math.floor(clipDuration * sampleRate));
  const out = ctx.createBuffer(fullIsolatedBuffer.numberOfChannels, targetLength, sampleRate);

  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const dst = out.getChannelData(ch);
    const base = baseClipBuffer.getChannelData(ch);
    const copyLen = Math.min(dst.length, base.length);
    if (copyLen > 0) {
      dst.set(base.subarray(0, copyLen), 0);
    }
  }

  const srcStart = Math.max(0, Math.floor(repaintingBounds.startTime * sampleRate));
  const srcEnd = Math.min(
    fullIsolatedBuffer.length,
    Math.floor(repaintingBounds.endTime * sampleRate),
  );
  const patchLength = Math.max(0, srcEnd - srcStart);
  if (patchLength === 0) return out;

  const destStart = Math.max(
    0,
    Math.floor((repaintingBounds.startTime - clipStart) * sampleRate),
  );
  if (destStart >= out.length) return out;
  const writeLength = Math.min(patchLength, out.length - destStart);

  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const src = fullIsolatedBuffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < writeLength; i++) {
      dst[destStart + i] = src[srcStart + i];
    }
  }

  return out;
}

function getBufferPeak(buffer: AudioBuffer): number {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  return peak;
}

function scaleBuffer(buffer: AudioBuffer, gain: number): void {
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }
}

function limitBufferPeak(buffer: AudioBuffer, targetPeak: number): void {
  const peak = getBufferPeak(buffer);
  if (peak <= targetPeak || peak <= 0) return;
  scaleBuffer(buffer, targetPeak / peak);
}

function applyEdgeFade(buffer: AudioBuffer, fadeSeconds: number): void {
  const fadeSamples = Math.min(
    Math.floor(fadeSeconds * buffer.sampleRate),
    Math.floor(buffer.length / 2),
  );
  if (fadeSamples <= 0) return;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < fadeSamples; i++) {
      const gain = i / fadeSamples;
      data[i] *= gain;
      data[data.length - 1 - i] *= gain;
    }
  }
}

/**
 * Generate all tracks sequentially (bottom → top in generation order).
 */
export async function generateAllTracks(): Promise<void> {
  const { project, getTracksInGenerationOrder, updateClipStatus } = useProjectStore.getState();
  const genStore = useGenerationStore.getState();

  if (!project || genStore.isGenerating) return;
  genStore.setIsGenerating(true);

  try {
    const tracks = getTracksInGenerationOrder();
    let previousCumulativeBlob: Blob | null = null;
    let previousContextEnd: number | null = null;

    for (const track of tracks) {
      const orderedClips = [...track.clips].sort((a, b) => {
        const startDelta = a.startTime - b.startTime;
        if (Math.abs(startDelta) > 0.0001) return startDelta;
        return getClipEndTime(a) - getClipEndTime(b);
      });

      for (const clip of orderedClips) {
        if (clip.generationStatus === 'ready') {
          // Already generated — use its cumulative mix as input for next track
          if (clip.cumulativeMixKey) {
            const blob = await loadAudioBlobByKey(clip.cumulativeMixKey);
            if (blob) {
              const clipEnd = getClipEndTime(clip);
              if (previousContextEnd == null || clipEnd >= previousContextEnd - 0.0001) {
                previousCumulativeBlob = blob;
                previousContextEnd = clipEnd;
              }
            }
          }
          continue;
        }

        const nextCumulativeBlob = await generateClipInternal(
          clip.id,
          previousCumulativeBlob,
          previousContextEnd,
        );
        if (nextCumulativeBlob) {
          previousCumulativeBlob = nextCumulativeBlob;
        }
        const generatedClip = useProjectStore.getState().getClipById(clip.id);
        if (generatedClip?.generationStatus === 'ready') {
          const generatedEnd = getClipEndTime(generatedClip);
          if (previousContextEnd == null || generatedEnd > previousContextEnd) {
            previousContextEnd = generatedEnd;
          }
        }
      }
    }
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
}

/**
 * Generate a single clip (and cascade if needed in the future).
 */
export async function generateSingleClip(clipId: string): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (genStore.isGenerating) return;
  genStore.setIsGenerating(true);

  try {
    const { project } = useProjectStore.getState();
    const context = project
      ? await buildRegenerationContextMix(project, clipId)
      : { blob: null, endTime: null, warningMessage: null };
    if (context.warningMessage && typeof window !== 'undefined') {
      window.alert(context.warningMessage);
    }
    await generateClipInternal(clipId, context.blob, context.endTime);
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
}

export async function generateSingleClipRepaint(
  clipId: string,
  repaintStartTime: number,
  repaintEndTime: number,
): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (genStore.isGenerating) return;
  genStore.setIsGenerating(true);

  try {
    const { project } = useProjectStore.getState();
    const context = project
      ? await buildRegenerationContextMix(project, clipId)
      : { blob: null, endTime: null, warningMessage: null };
    if (context.warningMessage && typeof window !== 'undefined') {
      window.alert(context.warningMessage);
    }
    await generateClipInternal(
      clipId,
      context.blob,
      context.endTime,
      { startTime: repaintStartTime, endTime: repaintEndTime },
    );
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
}

export async function generateClipWithContext(
  clipId: string,
  previousCumulativeBlob: Blob | null,
  previousContextEnd: number | null = null,
): Promise<Blob | null> {
  const nextBlob = await generateClipInternal(clipId, previousCumulativeBlob, previousContextEnd);
  const clip = useProjectStore.getState().getClipById(clipId);
  if (!clip || clip.generationStatus !== 'ready') {
    throw new Error(clip?.errorMessage || 'Generation failed');
  }
  return nextBlob;
}

async function generateClipInternal(
  clipId: string,
  previousCumulativeBlob: Blob | null,
  previousContextEnd: number | null = null,
  repaintRange?: RepaintRangeOverrides,
): Promise<Blob | null> {
  const store = useProjectStore.getState();
  const genStore = useGenerationStore.getState();
  const project = store.project;
  if (!project) return null;

  const clip = store.getClipById(clipId);
  const track = store.getTrackForClip(clipId);
  if (!clip || !track) return null;
  const repaintingBounds = resolveRepaintingBounds(clip, repaintRange);

  // Create generation job
  const jobId = uuidv4();
  const now = Date.now();
  genStore.addJob({
    id: jobId,
    clipId,
    trackName: track.trackName,
    repaintStartTime: repaintRange ? repaintingBounds.startTime : undefined,
    repaintEndTime: repaintRange ? repaintingBounds.endTime : undefined,
    status: 'queued',
    progress: 'Queued',
    startedAt: now,
    updatedAt: now,
  });

  store.updateClipStatus(clipId, 'queued', { generationJobId: jobId });

  try {
    // Determine src_audio
    const srcAudioBlob = await buildLegoSourceAudio(
      previousCumulativeBlob,
      previousContextEnd,
      project.totalDuration,
    );

    // Build params — 'auto' = ACE-Step infers, null/undefined = project defaults, value = manual
    const resolvedBpm = clip.bpm === 'auto' ? null : (clip.bpm ?? project.bpm);
    const resolvedKey = clip.keyScale === 'auto' ? '' : (clip.keyScale ?? project.keyScale);
    const resolvedTimeSig = clip.timeSignature === 'auto' ? '' : String(clip.timeSignature ?? project.timeSignature);
    const legoPrompt = buildLegoPromptContent({
      clip,
      track,
    });
    const generationTextInputs = buildTrackGenerationTextInputs(
      track.trackName,
      clip.lyrics,
      legoPrompt.instruction,
    );

    const params: LegoTaskParams = {
      task_type: 'lego',
      track_name: track.trackName,
      prompt: legoPrompt.prompt,
      lyrics: generationTextInputs.lyrics,
      instruction: generationTextInputs.instruction,
      repainting_start: repaintingBounds.startTime,
      repainting_end: repaintingBounds.endTime,
      audio_duration: project.totalDuration,
      bpm: resolvedBpm,
      key_scale: resolvedKey,
      time_signature: resolvedTimeSig,
      inference_steps: project.generationDefaults.inferenceSteps,
      guidance_scale: project.generationDefaults.guidanceScale,
      shift: project.generationDefaults.shift,
      batch_size: 1,
      audio_format: 'wav',
      thinking: project.generationDefaults.thinking,
      model: project.generationDefaults.model || undefined,
    } as LegoTaskParams;

    const lockedSeed = clip.lockedSeed?.trim();
    if (lockedSeed) {
      params.seed = lockedSeed;
    }

    // Sample mode: send prompt as sample_query
    if (clip.sampleMode) {
      params.sample_mode = true;
      params.sample_query = clip.prompt;
    }

    // Auto-expand prompt: controls whether LM rewrites the caption via CoT
    if (clip.autoExpandPrompt === false) {
      params.use_cot_caption = false;
    }

    // Submit task
    useGenerationStore.getState().updateJob(jobId, { status: 'generating', progress: 'Submitting...' });
    useProjectStore.getState().updateClipStatus(clipId, 'generating');

    let cumulativeBlob: Blob;
    let firstResult: TaskResultItem | null = null;

    if (project.generationDefaults.useModal ?? true) {
      // ── Fast JSON submission path ──
      useGenerationStore.getState().updateJob(jobId, { progress: 'Generating (this may take a minute)...' });

      const modalResult = await generateViaModal(srcAudioBlob, params, ({ progressText }) => {
        useGenerationStore.getState().updateJob(jobId, {
          status: 'generating',
          progress: progressText || 'Generating...',
        });
      });
      cumulativeBlob = modalResult.audioBlob;

      // Build a pseudo TaskResultItem from direct API response
      if (modalResult.metas && Object.keys(modalResult.metas).length > 0) {
        firstResult = {
          file: '',
          wave: '',
          status: 1,
          create_time: Date.now(),
          env: 'modal',
          prompt: clip.prompt,
          lyrics: clip.lyrics,
          metas: modalResult.metas,
          seed_value: modalResult.seed_value,
          dit_model: modalResult.dit_model,
        };
      }
    } else {
      // ── Standard API path: async queue ──
      const releaseResp = await api.releaseLegoTask(srcAudioBlob, params);
      const taskId = releaseResp.task_id;

      // Poll for completion
      const startTime = Date.now();
      let resultAudioPath: string | null = null;
      let lastPollError: string | null = null;

      while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
        await sleep(POLL_INTERVAL_MS);

        let entries;
        try {
          entries = await api.queryResult([taskId]);
          lastPollError = null;
        } catch (error) {
          lastPollError = error instanceof Error ? error.message : 'query_result failed';
          continue;
        }
        const entry = entries?.[0];
        if (!entry) continue;

        useGenerationStore.getState().updateJob(jobId, {
          progress: entry.progress_text || 'Generating...',
        });

        if (entry.status === 1) {
          const resultItems: TaskResultItem[] = JSON.parse(entry.result);
          firstResult = resultItems?.[0] ?? null;
          resultAudioPath = firstResult?.file ?? null;
          break;
        } else if (entry.status === 2) {
          throw new Error(`Generation failed: ${entry.result}`);
        }
      }

      if (!resultAudioPath) {
        throw new Error(lastPollError ? `Generation timed out (${lastPollError})` : 'Generation timed out');
      }

      // Download audio
      useGenerationStore.getState().updateJob(jobId, { status: 'processing', progress: 'Downloading audio...' });
      useProjectStore.getState().updateClipStatus(clipId, 'processing');

      cumulativeBlob = await api.downloadAudio(resultAudioPath);
    }

    // Store cumulative mix
    const cumulativeKey = await saveAudioBlob(project.id, clipId, 'cumulative', cumulativeBlob);

    // Wave subtraction: isolate this track
    const engine = getAudioEngine();
    const cumulativeBuffer = await engine.decodeAudioData(cumulativeBlob);

    let previousBuffer: AudioBuffer | null = null;
    if (previousCumulativeBlob) {
      // Use the same sanitized context that was fed to LEGO. This keeps
      // subtraction stable in regions beyond real context coverage.
      previousBuffer = await engine.decodeAudioData(srcAudioBlob);
    }

    const fullIsolatedBuffer = isolateTrackAudio(engine.ctx, cumulativeBuffer, previousBuffer, {
      alpha: WAVE_SUBTRACTION_ALPHA,
      gainMatch: WAVE_SUBTRACTION_GAIN_MATCH,
      minGainCompensation: WAVE_SUBTRACTION_MIN_GAIN,
      maxGainCompensation: WAVE_SUBTRACTION_MAX_GAIN,
      adaptiveAlpha: WAVE_SUBTRACTION_ADAPTIVE_ALPHA,
      adaptiveAlphaFloor: WAVE_SUBTRACTION_ADAPTIVE_FLOOR,
      correlationSampleStride: WAVE_SUBTRACTION_CORRELATION_STRIDE,
      lagCompensation: WAVE_SUBTRACTION_LAG_COMPENSATION,
      maxLagSamples: WAVE_SUBTRACTION_MAX_LAG_SAMPLES,
      bleedGate: WAVE_SUBTRACTION_BLEED_GATE,
      bleedGateThreshold: WAVE_SUBTRACTION_BLEED_GATE_THRESHOLD,
      bleedCorrelationThreshold: WAVE_SUBTRACTION_BLEED_CORRELATION_THRESHOLD,
      blockSize: WAVE_SUBTRACTION_BLOCK_SIZE,
      blockHop: WAVE_SUBTRACTION_BLOCK_HOP,
      decorrelateResidual: WAVE_SUBTRACTION_DECORRELATE_RESIDUAL,
      decorrelationThreshold: WAVE_SUBTRACTION_DECORRELATION_THRESHOLD,
      maxDecorrelation: WAVE_SUBTRACTION_MAX_DECORRELATION,
      orthogonalizeResidual: WAVE_SUBTRACTION_ORTHOGONALIZE_RESIDUAL,
      orthogonalizeCap: WAVE_SUBTRACTION_ORTHOGONALIZE_CAP,
    });

    // Re-read clip from store in case the user moved/resized it during generation
    const currentClip = useProjectStore.getState().getClipById(clipId);
    const clipStart = currentClip?.startTime ?? clip.startTime;
    const clipDuration = currentClip?.duration ?? clip.duration;

    const fullClipBuffer = extractClipBufferFromTimeline(
      engine.ctx,
      fullIsolatedBuffer,
      clipStart,
      clipDuration,
    );
    let finalClipBuffer = fullClipBuffer;
    let repaintFallbackNotice: string | null = null;

    if (repaintRange) {
      const existingIsolatedKey = currentClip?.isolatedAudioKey ?? clip.isolatedAudioKey;
      if (existingIsolatedKey) {
        const existingIsolatedBlob = await loadAudioBlobByKey(existingIsolatedKey);
        if (existingIsolatedBlob) {
          try {
            const existingBuffer = await engine.decodeAudioData(existingIsolatedBlob);
            const compatible =
              existingBuffer.sampleRate === fullClipBuffer.sampleRate
              && existingBuffer.numberOfChannels === fullClipBuffer.numberOfChannels;
            if (compatible) {
              finalClipBuffer = buildPatchedClipBuffer(
                engine.ctx,
                fullIsolatedBuffer,
                existingBuffer,
                clipStart,
                clipDuration,
                repaintingBounds,
              );
            } else {
              repaintFallbackNotice = 'Repaint fallback: existing clip audio format changed, so full clip was replaced.';
            }
          } catch {
            repaintFallbackNotice = 'Repaint fallback: existing clip audio could not be decoded, so full clip was replaced.';
          }
        } else {
          repaintFallbackNotice = 'Repaint fallback: existing clip audio was missing, so full clip was replaced.';
        }
      } else {
        repaintFallbackNotice = 'Repaint fallback: no prior clip audio found, so full clip was replaced.';
      }
    }

    // Keep isolated export clean: avoid hard clipping and edge clicks.
    limitBufferPeak(finalClipBuffer, TARGET_ISOLATED_PEAK);
    applyEdgeFade(finalClipBuffer, EDGE_FADE_SECONDS);

    const isolatedBlob = audioBufferToWavBlob(finalClipBuffer);
    const isolatedKey = await saveAudioBlob(project.id, clipId, 'isolated', isolatedBlob);

    // Compute waveform peaks from final clip audio (patched segment for repaint, full clip otherwise).
    const peaks = computeWaveformPeaks(finalClipBuffer, 200);

    // Build inferred metadata from result
    const inferredMetas: InferredMetas | undefined = firstResult
      ? {
        bpm: firstResult.metas?.bpm,
        keyScale: firstResult.metas?.keyscale,
        timeSignature: firstResult.metas?.timesignature,
        genres: firstResult.metas?.genres,
        seed: firstResult.seed_value,
        ditModel: firstResult.dit_model,
      }
      : undefined;

    // Update clip as ready
    useProjectStore.getState().updateClipStatus(clipId, 'ready', {
      cumulativeMixKey: cumulativeKey,
      isolatedAudioKey: isolatedKey,
      waveformPeaks: peaks,
      inferredMetas,
      audioDuration: clipDuration,
      audioOffset: 0,
    });

    useGenerationStore.getState().updateJob(jobId, { status: 'done', progress: 'Done' });
    if (repaintFallbackNotice && typeof window !== 'undefined') {
      window.alert(repaintFallbackNotice);
    }

    return cumulativeBlob;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    useProjectStore.getState().updateClipStatus(clipId, 'error', { errorMessage: message });
    useGenerationStore.getState().updateJob(jobId, { status: 'error', progress: message, error: message });
    return previousCumulativeBlob;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
