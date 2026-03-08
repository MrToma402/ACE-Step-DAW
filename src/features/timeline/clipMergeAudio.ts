import { getAudioEngine } from '../../hooks/useAudioEngine';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { computeWaveformPeaks } from '../../utils/waveformPeaks';
import { audioBufferToWavBlob } from '../../utils/wav';

const TARGET_PEAK = 0.98;
const EPSILON_SECONDS = 0.0001;

export interface MergeAudioSource {
  isolatedAudioKey: string;
  startTime: number;
  duration: number;
  audioOffset: number;
}

interface DecodedMergeSource extends MergeAudioSource {
  buffer: AudioBuffer;
}

export interface MergedClipAudio {
  blob: Blob;
  waveformPeaks: number[];
  audioDuration: number;
}

export interface BuildMergedClipAudioResult {
  merged: MergedClipAudio | null;
  reason: string | null;
}

function clampToBufferWindow(
  source: DecodedMergeSource,
  sampleRate: number,
): { sourceStart: number; sampleCount: number } | null {
  const sourceStart = Math.max(0, Math.floor(source.audioOffset * sampleRate));
  const requested = Math.max(1, Math.floor(source.duration * sampleRate));
  if (sourceStart >= source.buffer.length) return null;
  const sampleCount = Math.max(0, Math.min(requested, source.buffer.length - sourceStart));
  if (sampleCount <= 0) return null;
  return { sourceStart, sampleCount };
}

function normalizePeak(buffer: AudioBuffer): void {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak <= TARGET_PEAK || peak <= 0) return;
  const gain = TARGET_PEAK / peak;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }
}

export async function buildMergedClipAudio(
  sources: MergeAudioSource[],
  mergedStartTime: number,
  mergedEndTime: number,
): Promise<BuildMergedClipAudioResult> {
  if (sources.length === 0 || mergedEndTime <= mergedStartTime + EPSILON_SECONDS) {
    return { merged: null, reason: 'No source audio to merge.' };
  }

  const engine = getAudioEngine();
  const decodedSources: DecodedMergeSource[] = [];

  for (const source of sources) {
    const blob = await loadAudioBlobByKey(source.isolatedAudioKey);
    if (!blob) {
      return { merged: null, reason: 'One selected clip is missing stored audio.' };
    }
    try {
      const buffer = await engine.decodeAudioData(blob);
      decodedSources.push({ ...source, buffer });
    } catch {
      return { merged: null, reason: 'One selected clip has unreadable audio.' };
    }
  }

  if (decodedSources.length === 0) {
    return { merged: null, reason: 'No source audio could be decoded.' };
  }

  const sampleRate = decodedSources[0].buffer.sampleRate;
  const frameLength = Math.max(1, Math.ceil((mergedEndTime - mergedStartTime) * sampleRate));
  const mergedBuffer = engine.ctx.createBuffer(2, frameLength, sampleRate);
  const left = mergedBuffer.getChannelData(0);
  const right = mergedBuffer.getChannelData(1);

  for (const source of decodedSources) {
    const window = clampToBufferWindow(source, sampleRate);
    if (!window) continue;
    const destinationStart = Math.max(0, Math.floor((source.startTime - mergedStartTime) * sampleRate));
    if (destinationStart >= frameLength) continue;
    const writeLength = Math.max(0, Math.min(window.sampleCount, frameLength - destinationStart));
    if (writeLength <= 0) continue;

    const srcLeft = source.buffer.getChannelData(0);
    const srcRight = source.buffer.getChannelData(
      source.buffer.numberOfChannels > 1 ? 1 : 0,
    );
    for (let i = 0; i < writeLength; i++) {
      left[destinationStart + i] += srcLeft[window.sourceStart + i];
      right[destinationStart + i] += srcRight[window.sourceStart + i];
    }
  }

  normalizePeak(mergedBuffer);

  return {
    merged: {
      blob: audioBufferToWavBlob(mergedBuffer),
      waveformPeaks: computeWaveformPeaks(mergedBuffer, 200),
      audioDuration: mergedEndTime - mergedStartTime,
    },
    reason: null,
  };
}
