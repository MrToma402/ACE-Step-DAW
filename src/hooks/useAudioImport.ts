import { useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import { getAudioEngine } from './useAudioEngine';
import { saveAudioBlob } from '../services/audioFileManager';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { audioBufferToWavBlob } from '../utils/wav';

function revealImportedClip(clipId: string): void {
  useUIStore.getState().setActiveTab('daw');
  useUIStore.getState().selectClip(clipId, false);
  window.requestAnimationFrame(() => {
    const clipElement = document.querySelector<HTMLElement>(`[data-clip-id="${clipId}"]`);
    const scrollContainer = document.querySelector<HTMLElement>('[data-timeline-scroll-container="true"]');
    if (!clipElement || !scrollContainer) return;

    const clipLeft = clipElement.offsetLeft;
    const clipRight = clipLeft + clipElement.offsetWidth;
    const viewLeft = scrollContainer.scrollLeft;
    const viewRight = viewLeft + scrollContainer.clientWidth;

    if (clipLeft < viewLeft || clipRight > viewRight) {
      const targetLeft = Math.max(0, clipLeft - 48);
      scrollContainer.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }
  });
}

export function useAudioImport() {
  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const updateClipStatus = useProjectStore((s) => s.updateClipStatus);
  const isImportingAudio = useUIStore((s) => s.isImportingAudio);
  const setIsImportingAudio = useUIStore((s) => s.setIsImportingAudio);

  /**
   * Import audio into an existing track (adds a clip to that track).
   */
  const importAudioToTrack = useCallback(async (file: File, trackId: string) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    setIsImportingAudio(true);
    try {
      const engine = getAudioEngine();
      await engine.resume();

      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
      const duration = audioBuffer.duration;

      // Find the latest clip end on this track to place the new clip after it
      const track = useProjectStore.getState().getTrackById(trackId);
      let startTime = 0;
      if (track) {
        for (const clip of track.clips) {
          const end = clip.startTime + clip.duration;
          if (end > startTime) startTime = end;
        }
      }

      // Do not clip to current timeline length; project duration will expand after addClip.
      const clipDuration = duration;
      if (clipDuration <= 0) return;

      const clip = addClip(trackId, {
        startTime,
        duration: clipDuration,
        prompt: `Imported: ${file.name}`,
        lyrics: '',
      });

      // Trim the buffer to clip duration if needed
      const sampleRate = audioBuffer.sampleRate;
      const trimmedLength = Math.min(
        Math.floor(clipDuration * sampleRate),
        audioBuffer.length,
      );
      const trimmedBuffer = engine.ctx.createBuffer(
        audioBuffer.numberOfChannels,
        trimmedLength,
        sampleRate,
      );
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const src = audioBuffer.getChannelData(ch);
        const dst = trimmedBuffer.getChannelData(ch);
        for (let i = 0; i < trimmedLength; i++) {
          dst[i] = src[i];
        }
      }

      const wavBlob = audioBufferToWavBlob(trimmedBuffer);
      const isolatedKey = await saveAudioBlob(project.id, clip.id, 'isolated', wavBlob);
      const peaks = computeWaveformPeaks(trimmedBuffer, 200);

      updateClipStatus(clip.id, 'ready', {
        isolatedAudioKey: isolatedKey,
        waveformPeaks: peaks,
        audioDuration: clipDuration,
        audioOffset: 0,
      });
      revealImportedClip(clip.id);
    } finally {
      setIsImportingAudio(false);
    }
  }, [addClip, updateClipStatus, setIsImportingAudio]);

  const importAudioFile = useCallback(async (file: File) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    setIsImportingAudio(true);
    try {
      const engine = getAudioEngine();
      await engine.resume();

      // Decode the audio file
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
      const duration = audioBuffer.duration;

      // Create a custom track
      const track = addTrack('custom');
      // Rename to the file name
      useProjectStore.getState().updateTrack(track.id, {
        displayName: file.name.replace(/\.[^.]+$/, ''),
      });

      // Keep full imported duration and let timeline auto-expand.
      const clipDuration = duration;
      const clip = addClip(track.id, {
        startTime: 0,
        duration: clipDuration,
        prompt: `Imported: ${file.name}`,
        lyrics: '',
      });

      // Trim the buffer to clip duration if needed
      const sampleRate = audioBuffer.sampleRate;
      const trimmedLength = Math.min(
        Math.floor(clipDuration * sampleRate),
        audioBuffer.length,
      );
      const trimmedBuffer = engine.ctx.createBuffer(
        audioBuffer.numberOfChannels,
        trimmedLength,
        sampleRate,
      );
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const src = audioBuffer.getChannelData(ch);
        const dst = trimmedBuffer.getChannelData(ch);
        for (let i = 0; i < trimmedLength; i++) {
          dst[i] = src[i];
        }
      }

      // Convert to WAV and store
      const wavBlob = audioBufferToWavBlob(trimmedBuffer);
      const isolatedKey = await saveAudioBlob(project.id, clip.id, 'isolated', wavBlob);

      // Compute waveform peaks
      const peaks = computeWaveformPeaks(trimmedBuffer, 200);

      // Mark clip as ready
      updateClipStatus(clip.id, 'ready', {
        isolatedAudioKey: isolatedKey,
        waveformPeaks: peaks,
        audioDuration: clipDuration,
        audioOffset: 0,
      });
      revealImportedClip(clip.id);
    } finally {
      setIsImportingAudio(false);
    }
  }, [addTrack, addClip, updateClipStatus, setIsImportingAudio]);

  const openAudioPicker = useCallback((onFile: (file: File) => Promise<void>) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';
    document.body.appendChild(input);

    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (file) {
          await onFile(file);
        }
      } catch (error) {
        console.error('Audio import failed:', error);
      } finally {
        input.value = '';
        input.remove();
      }
    };

    input.value = '';
    input.click();
  }, []);

  const openFilePicker = useCallback(() => {
    openAudioPicker(importAudioFile);
  }, [importAudioFile, openAudioPicker]);

  const openFilePickerForTrack = useCallback((trackId: string) => {
    openAudioPicker((file) => importAudioToTrack(file, trackId));
  }, [importAudioToTrack, openAudioPicker]);

  return {
    importAudioFile,
    importAudioToTrack,
    openFilePicker,
    openFilePickerForTrack,
    isImportingAudio,
  };
}
