import type { Project } from '../types/project';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { useArrangementStore } from '../store/arrangementStore';
import { loadAudioBlobByKey } from './audioFileManager';
import { audioBufferToWavBlob } from '../utils/wav';
import { isArrangementClipSelected } from '../features/arrangement/selection';

export interface RegenerationContextSource {
  clipId: string;
  startTime: number;
  endTime: number;
  isolatedAudioKey: string;
  audioOffset: number;
  playbackDuration: number;
}

interface RegenerationContext {
  blob: Blob | null;
  endTime: number | null;
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

function limitBufferPeak(buffer: AudioBuffer, targetPeak: number): void {
  const peak = getBufferPeak(buffer);
  if (peak <= targetPeak || peak <= 0) return;
  const gain = targetPeak / peak;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }
}

/**
 * Collect ready context clips, excluding only the target clip being regenerated.
 */
export function collectRegenerationContextSources(
  project: Project,
  excludedClipId: string,
  isClipEligible: ((clipId: string) => boolean) | null = null,
  maxContextEndTime: number | null = null,
): RegenerationContextSource[] {
  const sources: RegenerationContextSource[] = [];

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludedClipId) continue;
      if (clip.generationStatus !== 'ready' || !clip.isolatedAudioKey) continue;
      if (isClipEligible && !isClipEligible(clip.id)) continue;
      const audioOffset = Math.max(0, clip.audioOffset ?? 0);
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + Math.max(0, clip.duration);
      if (maxContextEndTime != null && clipStart >= maxContextEndTime) continue;
      const playbackEnd = maxContextEndTime == null
        ? clipEnd
        : Math.min(clipEnd, maxContextEndTime);
      const playbackDuration = Math.max(0, playbackEnd - clipStart);
      if (playbackDuration <= 0) continue;
      sources.push({
        clipId: clip.id,
        startTime: clipStart,
        endTime: clipStart + playbackDuration,
        isolatedAudioKey: clip.isolatedAudioKey,
        audioOffset,
        playbackDuration,
      });
    }
  }

  sources.sort((a, b) => {
    const startDelta = a.startTime - b.startTime;
    if (Math.abs(startDelta) > 0.0001) return startDelta;
    return a.endTime - b.endTime;
  });
  return sources;
}

/**
 * Return the furthest context end time from collected sources.
 */
export function getRegenerationContextEnd(
  sources: readonly RegenerationContextSource[],
): number | null {
  if (sources.length === 0) return null;
  let maxEnd = 0;
  for (const source of sources) {
    if (source.endTime > maxEnd) maxEnd = source.endTime;
  }
  return maxEnd;
}

/**
 * Build a rendered context mix for clip regeneration from other audible tracks.
 */
export async function buildRegenerationContextMix(
  project: Project,
  excludedClipId: string,
): Promise<RegenerationContext> {
  const workspace = useArrangementStore.getState().workspacesByProjectId[project.id] ?? null;
  const clipsById = new Map<string, Project['tracks'][number]['clips'][number]>();
  for (const track of project.tracks) {
    for (const clip of track.clips) clipsById.set(clip.id, clip);
  }
  const targetClip = clipsById.get(excludedClipId) ?? null;
  const maxContextEndTime = targetClip?.startTime ?? null;
  const sources = collectRegenerationContextSources(
    project,
    excludedClipId,
    (clipId) => {
      const clip = clipsById.get(clipId);
      return clip ? isArrangementClipSelected(clip, workspace) : false;
    },
    maxContextEndTime,
  );
  const endTime = getRegenerationContextEnd(sources);
  if (sources.length === 0 || endTime === null) {
    return { blob: null, endTime: null };
  }

  const engine = getAudioEngine();
  const sampleRate = engine.ctx.sampleRate || 48000;
  const length = Math.max(1, Math.ceil(project.totalDuration * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.connect(offlineCtx.destination);

  for (const source of sources) {
    const blob = await loadAudioBlobByKey(source.isolatedAudioKey);
    if (!blob) continue;

    const decodedBuffer = await engine.decodeAudioData(blob);
    const availableDuration = Math.max(0, decodedBuffer.duration - source.audioOffset);
    const effectiveDuration = Math.max(0, Math.min(source.playbackDuration, availableDuration));
    if (effectiveDuration <= 0) continue;

    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = decodedBuffer;
    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = 1;
    bufferSource.connect(gainNode);
    gainNode.connect(masterGain);
    bufferSource.start(source.startTime, source.audioOffset, effectiveDuration);
  }

  const rendered = await offlineCtx.startRendering();
  limitBufferPeak(rendered, 0.98);
  return {
    blob: audioBufferToWavBlob(rendered),
    endTime,
  };
}
