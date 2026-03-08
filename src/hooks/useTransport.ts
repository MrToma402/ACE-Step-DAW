import { useCallback, useEffect, useRef } from 'react';
import { useTransportStore } from '../store/transportStore';
import { useProjectStore } from '../store/projectStore';
import { useArrangementStore } from '../store/arrangementStore';
import { useUIStore } from '../store/uiStore';
import { getAudioEngine } from './useAudioEngine';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { isArrangementClipSelected } from '../features/arrangement/selection';
import type { Project } from '../types/project';
import type { ArrangementWorkspace } from '../types/arrangement';

function getReadyClipTokens(project: Project, workspace: ArrangementWorkspace | null): string[] {
  const tokens: string[] = [];

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (!isArrangementClipSelected(clip, workspace)) continue;
      if (clip.generationStatus !== 'ready' || !clip.isolatedAudioKey) continue;
      tokens.push([
        track.id,
        clip.id,
        clip.isolatedAudioKey,
        clip.startTime.toFixed(4),
        clip.duration.toFixed(4),
        (clip.audioOffset ?? 0).toFixed(4),
      ].join(':'));
    }
  }

  tokens.sort();
  return tokens;
}

function removeStaleTrackNodes(project: Project | null): void {
  const engine = getAudioEngine();
  if (!project) {
    for (const trackId of Array.from(engine.trackNodes.keys())) {
      engine.removeTrackNode(trackId);
    }
    engine.updateSoloState();
    return;
  }

  const validTrackIds = new Set(project.tracks.map((track) => track.id));
  let removedAny = false;
  for (const trackId of Array.from(engine.trackNodes.keys())) {
    if (!validTrackIds.has(trackId)) {
      engine.removeTrackNode(trackId);
      removedAny = true;
    }
  }
  if (removedAny) {
    engine.updateSoloState();
  }
}

export function useTransport() {
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const project = useProjectStore((s) => s.project);
  const isClipGestureActive = useUIStore((s) => s.isClipGestureActive);
  const workspace = useArrangementStore((s) =>
    project ? (s.workspacesByProjectId[project.id] ?? null) : null,
  );
  const lastReadyClipsRef = useRef<Set<string> | null>(null);
  const rescheduleTimerRef = useRef<number | null>(null);
  const rescheduleInFlightRef = useRef(false);
  const rescheduleQueuedRef = useRef(false);
  const decodedBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  const play = useCallback(async (fromTime?: number) => {
    const engine = getAudioEngine();
    await engine.resume();

    const proj = useProjectStore.getState().project;
    if (!proj) return;
    const workspace = useArrangementStore.getState().workspacesByProjectId[proj.id] ?? null;
    removeStaleTrackNodes(proj);

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
        if (!isArrangementClipSelected(clip, workspace)) continue;
        if (clip.generationStatus === 'ready' && clip.isolatedAudioKey) {
          let buffer = decodedBufferCacheRef.current.get(clip.isolatedAudioKey);
          if (!buffer) {
            const blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
            if (!blob) continue;
            buffer = await engine.decodeAudioData(blob);
            decodedBufferCacheRef.current.set(clip.isolatedAudioKey, buffer);
          }
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

      // Update track node state
      const trackNode = engine.getOrCreateTrackNode(track.id);
      trackNode.volume = track.volume;
      trackNode.muted = track.muted;
      trackNode.soloed = track.soloed;
    }
    engine.updateSoloState();

    const transportState = useTransportStore.getState();
    const hasLoopRegion = transportState.loopEnd > transportState.loopStart;
    const startFrom = fromTime ?? transportState.currentTime;
    const loopStart = hasLoopRegion ? transportState.loopStart : 0;
    const loopEnd = hasLoopRegion ? transportState.loopEnd : proj.totalDuration;
    const effectiveStart = transportState.loopEnabled && hasLoopRegion
      ? Math.max(loopStart, Math.min(startFrom, loopEnd))
      : startFrom;

    // When looping, end at the last clip's endpoint instead of the full timeline
    const { loopEnabled } = transportState;
    let effectiveEnd = proj.totalDuration;
    if (loopEnabled && hasLoopRegion) {
      effectiveEnd = loopEnd;
    } else if (loopEnabled && clipBuffers.length > 0) {
      const lastClipEnd = clipBuffers.reduce((max, cb) => Math.max(max, cb.startTime + cb.clipDuration), 0);
      if (lastClipEnd > 0) effectiveEnd = lastClipEnd;
    }

    engine.schedulePlayback(clipBuffers, effectiveStart, effectiveEnd);
    useTransportStore.getState().play();
  }, []);

  // Keep AudioEngine nodes in sync with project tracks so removed tracks cannot leave stale solo/mute state.
  useEffect(() => {
    removeStaleTrackNodes(project);
  }, [project]);

  // Keep cache bounded to stems still referenced by the current project.
  useEffect(() => {
    if (!project) {
      decodedBufferCacheRef.current.clear();
      return;
    }
    const validKeys = new Set<string>();
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.generationStatus === 'ready' && clip.isolatedAudioKey) {
          validKeys.add(clip.isolatedAudioKey);
        }
      }
    }
    for (const key of Array.from(decodedBufferCacheRef.current.keys())) {
      if (!validKeys.has(key)) {
        decodedBufferCacheRef.current.delete(key);
      }
    }
  }, [project]);

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
        const state = useTransportStore.getState();
        const hasLoopRegion = state.loopEnd > state.loopStart;
        const restartAt = hasLoopRegion ? state.loopStart : 0;
        useTransportStore.getState().setCurrentTime(restartAt);
        play(restartAt);
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

  // While transport is running, newly generated audio should join playback immediately.
  useEffect(() => {
    if (!project || !isPlaying) {
      lastReadyClipsRef.current = null;
      rescheduleInFlightRef.current = false;
      rescheduleQueuedRef.current = false;
      if (rescheduleTimerRef.current !== null) {
        window.clearTimeout(rescheduleTimerRef.current);
        rescheduleTimerRef.current = null;
      }
      return;
    }

    const nextReadyClips = new Set(getReadyClipTokens(project, workspace));
    const prevReadyClips = lastReadyClipsRef.current;

    if (prevReadyClips === null) {
      lastReadyClipsRef.current = nextReadyClips;
      return;
    }

    let hasReadyClipChange = false;
    for (const token of nextReadyClips) {
      if (!prevReadyClips.has(token)) {
        hasReadyClipChange = true;
        break;
      }
    }
    if (!hasReadyClipChange) {
      for (const token of prevReadyClips) {
        if (!nextReadyClips.has(token)) {
          hasReadyClipChange = true;
          break;
        }
      }
    }

    lastReadyClipsRef.current = nextReadyClips;
    const shouldReschedule = hasReadyClipChange || rescheduleQueuedRef.current;
    if (!shouldReschedule) return;
    if (isClipGestureActive) {
      // During move/resize gestures we keep playback stable and apply one update on mouse-up.
      rescheduleQueuedRef.current = true;
      return;
    }
    if (rescheduleInFlightRef.current) {
      // A reschedule is already decoding/loading; queue one more pass so edits during playback are not lost.
      rescheduleQueuedRef.current = true;
      return;
    }

    if (rescheduleTimerRef.current !== null) {
      window.clearTimeout(rescheduleTimerRef.current);
    }
    rescheduleQueuedRef.current = false;
    rescheduleTimerRef.current = window.setTimeout(() => {
      rescheduleTimerRef.current = null;
      if (!useTransportStore.getState().isPlaying) return;
      rescheduleInFlightRef.current = true;
      // Do not stop immediately. Let current audio continue while we load/decode
      // new ready clips, then play() will swap scheduling at current playhead.
      void play().finally(() => {
        rescheduleInFlightRef.current = false;
        if (rescheduleQueuedRef.current && useTransportStore.getState().isPlaying) {
          if (useUIStore.getState().isClipGestureActive) return;
          rescheduleQueuedRef.current = false;
          rescheduleInFlightRef.current = true;
          void play().finally(() => {
            rescheduleInFlightRef.current = false;
          });
        }
      });
    }, 180);

    return () => {
      if (rescheduleTimerRef.current !== null) {
        window.clearTimeout(rescheduleTimerRef.current);
        rescheduleTimerRef.current = null;
      }
    };
  }, [project, workspace, isPlaying, isClipGestureActive, play]);

  return { isPlaying, play, pause, stop, seek };
}
