import { useCallback, useEffect } from 'react';
import { useTransportStore } from '../store/transportStore';
import { useProjectStore } from '../store/projectStore';
import { getAudioEngine } from './useAudioEngine';
import { loadAudioBlobByKey } from '../services/audioFileManager';

export function useTransport() {
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const project = useProjectStore((s) => s.project);

  const play = useCallback(async (fromTime?: number) => {
    const engine = getAudioEngine();
    await engine.resume();

    const proj = useProjectStore.getState().project;
    if (!proj) return;

    // Collect all clips with ready isolated audio
    const clipBuffers: Array<{
      clipId: string;
      trackId: string;
      startTime: number;
      buffer: AudioBuffer;
      audioOffset: number;
      clipDuration: number;
    }> = [];

    for (const track of proj.tracks) {
      for (const clip of track.clips) {
        if (clip.generationStatus === 'ready' && clip.isolatedAudioKey) {
          const blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
          if (blob) {
            const buffer = await engine.decodeAudioData(blob);
            clipBuffers.push({
              clipId: clip.id,
              trackId: track.id,
              startTime: clip.startTime,
              buffer,
              audioOffset: clip.audioOffset ?? 0,
              clipDuration: clip.duration,
            });
          }
        }
      }

      // Update track node state
      const trackNode = engine.getOrCreateTrackNode(track.id);
      trackNode.volume = track.volume;
      trackNode.muted = track.muted;
      trackNode.soloed = track.soloed;
    }
    engine.updateSoloState();

    const startFrom = fromTime ?? useTransportStore.getState().currentTime;

    // When looping, end at the last clip's endpoint instead of the full timeline
    const { loopEnabled } = useTransportStore.getState();
    let effectiveEnd = proj.totalDuration;
    if (loopEnabled && clipBuffers.length > 0) {
      const lastClipEnd = clipBuffers.reduce(
        (max, cb) => Math.max(max, cb.startTime + cb.clipDuration), 0,
      );
      if (lastClipEnd > 0) effectiveEnd = lastClipEnd;
    }

    engine.schedulePlayback(clipBuffers, startFrom, effectiveEnd);
    useTransportStore.getState().play();
  }, []);

  const pause = useCallback(() => {
    const engine = getAudioEngine();
    const time = engine.getCurrentTime();
    engine.stop();
    useTransportStore.getState().pause();
    useTransportStore.getState().seek(time);
  }, []);

  const stop = useCallback(() => {
    const engine = getAudioEngine();
    engine.stop();
    useTransportStore.getState().stop();
  }, []);

  const seek = useCallback((time: number) => {
    const engine = getAudioEngine();
    if (engine.playing) {
      engine.stop();
      useTransportStore.getState().seek(time);
      play(time);
    } else {
      useTransportStore.getState().seek(time);
    }
  }, [play]);

  // Register the onEnded callback — respect loopEnabled
  useEffect(() => {
    const engine = getAudioEngine();
    engine.setOnEndedCallback(() => {
      const { loopEnabled } = useTransportStore.getState();
      if (loopEnabled) {
        useTransportStore.getState().setCurrentTime(0);
        play(0);
      } else {
        useTransportStore.getState().stop();
      }
    });
    return () => {
      engine.setOnEndedCallback(() => {});
    };
  }, [play]);

  // Sync mute/solo/volume to audio engine TrackNodes during playback
  useEffect(() => {
    if (!project || !isPlaying) return;
    const engine = getAudioEngine();
    for (const track of project.tracks) {
      const trackNode = engine.trackNodes.get(track.id);
      if (trackNode) {
        trackNode.volume = track.volume;
        trackNode.muted = track.muted;
        trackNode.soloed = track.soloed;
      }
    }
    engine.updateSoloState();
  }, [project, isPlaying]);

  return { isPlaying, play, pause, stop, seek };
}
