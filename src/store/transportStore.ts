import { create } from 'zustand';

export type PlaybackScope =
  | { type: 'all' }
  | { type: 'selection'; clipIds: string[]; loop: boolean };

interface TransportState {
  isPlaying: boolean;
  currentTime: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  playbackScope: PlaybackScope;

  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setCurrentTime: (time: number) => void;
  setPlaybackScope: (scope: PlaybackScope) => void;
  toggleLoop: () => void;
  setLoopRegion: (start: number, end: number) => void;
}

export const useTransportStore = create<TransportState>((set) => ({
  isPlaying: false,
  currentTime: 0,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0,
  playbackScope: { type: 'all' },

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentTime: 0, playbackScope: { type: 'all' } }),
  seek: (time) => set({ currentTime: Math.max(0, time) }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setPlaybackScope: (scope) => set({ playbackScope: scope }),
  toggleLoop: () => set((s) => ({ loopEnabled: !s.loopEnabled })),
  setLoopRegion: (start, end) => set({ loopStart: start, loopEnd: end }),
}));
