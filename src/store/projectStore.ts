import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Project, Track, Clip, TrackName, ClipGenerationStatus } from '../types/project';
import { TRACK_CATALOG } from '../constants/tracks';
import {
  DEFAULT_BPM,
  DEFAULT_KEY_SCALE,
  DEFAULT_TIME_SIGNATURE,
  DEFAULT_PROJECT_NAME,
  DEFAULT_GENERATION,
} from '../constants/defaults';
import { saveProject as saveProjectToIDB } from '../services/projectStorage';
import { deleteAudioBlob, saveAudioBlob } from '../services/audioFileManager';
import { reorderTracksByTarget } from './trackOrder';
import { resolveClipMusicalOverrides } from './clipMusicalDefaults';
import { buildClipMergePlan } from '../features/timeline/clipMergePlan';
import { buildMergedClipAudio } from '../features/timeline/clipMergeAudio';

const MIN_TIMELINE_DURATION = 30; // seconds
const TIMELINE_PADDING = 10;      // seconds beyond last clip

interface ProjectState {
  project: Project | null;

  setProject: (project: Project) => void;
  createProject: (params?: {
    name?: string;
    bpm?: number;
    keyScale?: string;
    timeSignature?: number;
  }) => void;

  addTrack: (trackName: TrackName) => Track;
  removeTrack: (trackId: string) => void;
  reorderTrack: (draggedTrackId: string, targetTrackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Pick<Track, 'displayName' | 'volume' | 'muted' | 'soloed' | 'hidden'>>) => void;

  addClip: (trackId: string, clip: Omit<Clip, 'id' | 'trackId' | 'generationStatus' | 'generationJobId' | 'cumulativeMixKey' | 'isolatedAudioKey' | 'waveformPeaks'>) => Clip;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  moveClipToTrack: (clipId: string, targetTrackId: string, updates?: Partial<Clip>) => void;
  removeClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => Clip | undefined;
  mergeClips: (clipIds: string[]) => Promise<{ clip: Clip | null; reason: string | null }>;
  updateClipStatus: (clipId: string, status: ClipGenerationStatus, extra?: Partial<Clip>) => void;

  getTrackById: (trackId: string) => Track | undefined;
  getClipById: (clipId: string) => Clip | undefined;
  getTrackForClip: (clipId: string) => Track | undefined;
  getTracksInGenerationOrder: () => Track[];
  /** Computed total duration: max(clip ends) + padding, minimum MIN_TIMELINE_DURATION */
  getTotalDuration: () => number;
}

function computeTotalDuration(tracks: Track[]): number {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > maxEnd) maxEnd = end;
    }
  }
  return Math.max(MIN_TIMELINE_DURATION, maxEnd + TIMELINE_PADDING);
}

function getTrackGenerationPriority(track: Track): number {
  return TRACK_CATALOG[track.trackName]?.defaultOrder ?? track.order;
}

function findNextDuplicateStart(sourceClip: Clip, trackClips: Clip[]): number {
  let candidateStart = sourceClip.startTime + sourceClip.duration;
  const duration = sourceClip.duration;

  while (true) {
    const candidateEnd = candidateStart + duration;
    const blockingClip = trackClips.find((clip) =>
      clip.id !== sourceClip.id
      && clip.startTime < candidateEnd
      && (clip.startTime + clip.duration) > candidateStart,
    );
    if (!blockingClip) return candidateStart;
    candidateStart = blockingClip.startTime + blockingClip.duration;
  }
}

function mapProjectClipsById(project: Project): Map<string, Clip> {
  const byId = new Map<string, Clip>();
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      byId.set(clip.id, clip);
    }
  }
  return byId;
}

function buildMergedPrompt(clips: Clip[]): string {
  return clips
    .map((clip) => clip.prompt.trim())
    .filter((prompt) => prompt.length > 0)
    .join(' | ');
}

function buildMergedLyrics(clips: Clip[]): string {
  return clips
    .map((clip) => clip.lyrics.trim())
    .filter((lyrics) => lyrics.length > 0)
    .join('\n\n');
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      project: null,

      setProject: (project) => set({ project }),

      createProject: (params) => {
        const project: Project = {
          id: uuidv4(),
          name: params?.name ?? DEFAULT_PROJECT_NAME,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          bpm: params?.bpm ?? DEFAULT_BPM,
          keyScale: params?.keyScale ?? DEFAULT_KEY_SCALE,
          timeSignature: params?.timeSignature ?? DEFAULT_TIME_SIGNATURE,
          totalDuration: MIN_TIMELINE_DURATION,
          tracks: [],
          generationDefaults: { ...DEFAULT_GENERATION },
        };
        set({ project });
      },

      addTrack: (trackName) => {
        const state = get();
        if (!state.project) throw new Error('No project');

        const info = TRACK_CATALOG[trackName];
        const existingOrders = state.project.tracks.map((t) => t.order);
        const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : 0;

        // Auto-number duplicate track types (e.g. "Drums 2", "Drums 3")
        const sameTypeCount = state.project.tracks.filter((t) => t.trackName === trackName).length;
        const displayName = sameTypeCount > 0
          ? `${info.displayName} ${sameTypeCount + 1}`
          : info.displayName;

        const track: Track = {
          id: uuidv4(),
          trackName,
          displayName,
          color: info.color,
          order: maxOrder + 1,
          volume: 0.8,
          muted: false,
          soloed: false,
          hidden: false,
          clips: [],
        };

        const newTracks = [...state.project.tracks, track];
        set({
          project: {
            ...state.project,
            updatedAt: Date.now(),
            totalDuration: computeTotalDuration(newTracks),
            tracks: newTracks,
          },
        });

        return track;
      },

      removeTrack: (trackId) => {
        const state = get();
        if (!state.project) return;
        const removedTrack = state.project.tracks.find((t) => t.id === trackId) ?? null;
        if (removedTrack) {
          for (const clip of removedTrack.clips) {
            void deleteAudioBlob(state.project.id, clip.id, 'cumulative');
            void deleteAudioBlob(state.project.id, clip.id, 'isolated');
          }
        }
        const newTracks = state.project.tracks.filter((t) => t.id !== trackId);
        set({
          project: {
            ...state.project,
            updatedAt: Date.now(),
            totalDuration: computeTotalDuration(newTracks),
            tracks: newTracks,
          },
        });
      },

      reorderTrack: (draggedTrackId, targetTrackId) => {
        const state = get();
        if (!state.project) return;

        const reorderedTracks = reorderTracksByTarget(
          state.project.tracks,
          draggedTrackId,
          targetTrackId,
        );
        if (reorderedTracks === state.project.tracks) return;

        set({
          project: {
            ...state.project,
            updatedAt: Date.now(),
            tracks: reorderedTracks,
          },
        });
      },

      updateTrack: (trackId, updates) => {
        const state = get();
        if (!state.project) return;
        set({
          project: {
            ...state.project,
            updatedAt: Date.now(),
            tracks: state.project.tracks.map((t) =>
              t.id === trackId ? { ...t, ...updates } : t,
            ),
          },
        });
      },

      addClip: (trackId, clipData) => {
        const state = get();
        if (!state.project) throw new Error('No project');
        const musicalOverrides = resolveClipMusicalOverrides(clipData);

        const clip: Clip = {
          id: uuidv4(),
          trackId,
          startTime: clipData.startTime,
          duration: clipData.duration,
          arrangementSectionId: clipData.arrangementSectionId,
          arrangementTakeId: clipData.arrangementTakeId,
          prompt: clipData.prompt,
          lyrics: clipData.lyrics,
          generationStatus: 'empty',
          generationJobId: null,
          cumulativeMixKey: null,
          isolatedAudioKey: null,
          waveformPeaks: null,
          bpm: musicalOverrides.bpm,
          keyScale: musicalOverrides.keyScale,
          timeSignature: musicalOverrides.timeSignature,
        };

        const newTracks = state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t,
        );

        set({
          project: {
            ...state.project,
            updatedAt: Date.now(),
            totalDuration: computeTotalDuration(newTracks),
            tracks: newTracks,
          },
        });

        return clip;
      },

      updateClip: (clipId, updates) => {
        const state = get();
        if (!state.project) return;
        const newTracks = state.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, ...updates } : c,
          ),
        }));
        set({
          project: {
            ...state.project,
            updatedAt: Date.now(),
            totalDuration: computeTotalDuration(newTracks),
            tracks: newTracks,
          },
        });
      },

      moveClipToTrack: (clipId, targetTrackId, updates) => {
        const state = get();
        if (!state.project) return;

        let sourceTrackId: string | null = null;
        let sourceClip: Clip | null = null;
        for (const track of state.project.tracks) {
          const candidate = track.clips.find((c) => c.id === clipId);
          if (candidate) {
            sourceTrackId = track.id;
            sourceClip = candidate;
            break;
          }
        }
        if (!sourceTrackId || !sourceClip) return;

        const movedClip: Clip = {
          ...sourceClip,
          ...updates,
          trackId: targetTrackId,
        };

        const newTracks = state.project.tracks.map((track) => {
          if (track.id === sourceTrackId && track.id === targetTrackId) {
            return {
              ...track,
              clips: track.clips.map((c) => (c.id === clipId ? movedClip : c)),
            };
          }
          if (track.id === sourceTrackId) {
            return {
              ...track,
              clips: track.clips.filter((c) => c.id !== clipId),
            };
          }
          if (track.id === targetTrackId) {
            return {
              ...track,
              clips: [...track.clips, movedClip],
            };
          }
          return track;
        });

        set({
          project: {
            ...state.project,
            updatedAt: Date.now(),
            totalDuration: computeTotalDuration(newTracks),
            tracks: newTracks,
          },
        });
      },

      removeClip: (clipId) => {
        const state = get();
        if (!state.project) return;
        const clipExists = state.project.tracks.some((t) => t.clips.some((c) => c.id === clipId));
        if (clipExists) {
          void deleteAudioBlob(state.project.id, clipId, 'cumulative');
          void deleteAudioBlob(state.project.id, clipId, 'isolated');
        }
        const newTracks = state.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.filter((c) => c.id !== clipId),
        }));
        set({
          project: {
            ...state.project,
            updatedAt: Date.now(),
            totalDuration: computeTotalDuration(newTracks),
            tracks: newTracks,
          },
        });
      },

      duplicateClip: (clipId) => {
        const state = get();
        if (!state.project) return undefined;

        let sourceClip: Clip | undefined;
        let trackId: string | undefined;
        for (const t of state.project.tracks) {
          const c = t.clips.find((c) => c.id === clipId);
          if (c) { sourceClip = c; trackId = t.id; break; }
        }
        if (!sourceClip || !trackId) return undefined;
        const track = state.project.tracks.find((t) => t.id === trackId);
        if (!track) return undefined;

        const isReady = sourceClip.generationStatus === 'ready' && !!sourceClip.isolatedAudioKey;
        const nextStartTime = findNextDuplicateStart(sourceClip, track.clips);
        const newClip: Clip = {
          ...sourceClip,
          id: uuidv4(),
          startTime: nextStartTime,
          generationStatus: isReady ? 'ready' : 'empty',
          generationJobId: null,
          cumulativeMixKey: sourceClip.cumulativeMixKey,
          isolatedAudioKey: isReady ? sourceClip.isolatedAudioKey : null,
          waveformPeaks: isReady && sourceClip.waveformPeaks ? [...sourceClip.waveformPeaks] : null,
        };

        const newTracks = state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t,
        );

        set({
          project: {
            ...state.project,
            updatedAt: Date.now(),
            totalDuration: computeTotalDuration(newTracks),
            tracks: newTracks,
          },
        });

        return newClip;
      },

      mergeClips: async (clipIds) => {
        const state = get();
        if (!state.project) return { clip: null, reason: 'No project is loaded.' };
        if (clipIds.length < 2) return { clip: null, reason: 'Select at least two clips to merge.' };

        const clipById = mapProjectClipsById(state.project);
        const candidateClips = clipIds
          .map((clipId) => clipById.get(clipId))
          .filter((clip): clip is Clip => Boolean(clip));

        if (candidateClips.length !== clipIds.length) {
          return { clip: null, reason: 'Some selected clips no longer exist.' };
        }

        const mergePlan = buildClipMergePlan(candidateClips);
        if (!mergePlan) {
          return {
            clip: null,
            reason: 'Merge requires clips on the same track with no timeline gap between them.',
          };
        }

        const orderedClips = mergePlan.orderedClipIds
          .map((clipId) => clipById.get(clipId))
          .filter((clip): clip is Clip => Boolean(clip));
        if (orderedClips.length < 2) {
          return { clip: null, reason: 'Not enough valid clips to merge.' };
        }

        const firstClip = orderedClips[0];
        const mergedClip: Clip = {
          ...firstClip,
          id: uuidv4(),
          trackId: mergePlan.trackId,
          startTime: mergePlan.startTime,
          duration: mergePlan.endTime - mergePlan.startTime,
          prompt: buildMergedPrompt(orderedClips),
          lyrics: buildMergedLyrics(orderedClips),
          generationJobId: null,
          errorMessage: undefined,
        };

        const allSourcesWithAudio = orderedClips.every(
          (clip) => typeof clip.isolatedAudioKey === 'string' && clip.isolatedAudioKey.length > 0,
        );
        const containsAnyAudio = orderedClips.some(
          (clip) => typeof clip.isolatedAudioKey === 'string' && clip.isolatedAudioKey.length > 0,
        );

        if (containsAnyAudio && !allSourcesWithAudio) {
          return {
            clip: null,
            reason: 'For audio merge, every selected clip must have stored audio.',
          };
        }

        const latestProjectBeforeSave = get().project;
        if (!latestProjectBeforeSave || latestProjectBeforeSave.id !== state.project.id) {
          return { clip: null, reason: 'Project changed while merging. Please retry.' };
        }

        if (allSourcesWithAudio) {
          const audioSources = orderedClips.map((clip) => ({
            isolatedAudioKey: clip.isolatedAudioKey as string,
            startTime: clip.startTime,
            duration: clip.duration,
            audioOffset: clip.audioOffset ?? 0,
          }));
          const { merged, reason } = await buildMergedClipAudio(
            audioSources,
            mergePlan.startTime,
            mergePlan.endTime,
          );
          if (!merged) {
            return {
              clip: null,
              reason: reason ?? 'Failed to merge clip audio.',
            };
          }

          const isolatedKey = await saveAudioBlob(
            latestProjectBeforeSave.id,
            mergedClip.id,
            'isolated',
            merged.blob,
          );
          mergedClip.generationStatus = 'ready';
          mergedClip.cumulativeMixKey = null;
          mergedClip.isolatedAudioKey = isolatedKey;
          mergedClip.waveformPeaks = merged.waveformPeaks;
          mergedClip.audioDuration = merged.audioDuration;
          mergedClip.audioOffset = 0;
        } else {
          mergedClip.generationStatus = 'empty';
          mergedClip.generationJobId = null;
          mergedClip.cumulativeMixKey = null;
          mergedClip.isolatedAudioKey = null;
          mergedClip.waveformPeaks = null;
          mergedClip.audioDuration = undefined;
          mergedClip.audioOffset = undefined;
        }

        for (const clip of orderedClips) {
          void deleteAudioBlob(latestProjectBeforeSave.id, clip.id, 'cumulative');
          void deleteAudioBlob(latestProjectBeforeSave.id, clip.id, 'isolated');
        }

        const selectedClipIdSet = new Set(mergePlan.orderedClipIds);
        set((current) => {
          const currentProject = current.project;
          if (!currentProject || currentProject.id !== latestProjectBeforeSave.id) {
            return current;
          }
          const newTracks = currentProject.tracks.map((track) => {
            if (track.id !== mergePlan.trackId) return track;
            const remaining = track.clips.filter((clip) => !selectedClipIdSet.has(clip.id));
            return {
              ...track,
              clips: [...remaining, mergedClip],
            };
          });
          return {
            project: {
              ...currentProject,
              updatedAt: Date.now(),
              totalDuration: computeTotalDuration(newTracks),
              tracks: newTracks,
            },
          };
        });

        return { clip: mergedClip, reason: null };
      },

      updateClipStatus: (clipId, status, extra) => {
        const state = get();
        if (!state.project) return;
        set({
          project: {
            ...state.project,
            updatedAt: Date.now(),
            tracks: state.project.tracks.map((t) => ({
              ...t,
              clips: t.clips.map((c) =>
                c.id === clipId ? { ...c, generationStatus: status, ...extra } : c,
              ),
            })),
          },
        });
      },

      getTrackById: (trackId) => {
        return get().project?.tracks.find((t) => t.id === trackId);
      },

      getClipById: (clipId) => {
        const project = get().project;
        if (!project) return undefined;
        for (const track of project.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) return clip;
        }
        return undefined;
      },

      getTrackForClip: (clipId) => {
        const project = get().project;
        if (!project) return undefined;
        return project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
      },

      getTracksInGenerationOrder: () => {
        const project = get().project;
        if (!project) return [];
        return project.tracks
          .filter((track) => !track.hidden)
          .sort((a, b) => {
            const priorityDelta = getTrackGenerationPriority(b) - getTrackGenerationPriority(a);
            if (priorityDelta !== 0) return priorityDelta;
            return b.order - a.order;
          });
      },

      getTotalDuration: () => {
        const project = get().project;
        if (!project) return MIN_TIMELINE_DURATION;
        return project.totalDuration;
      },
    }),
    {
      name: 'ace-step-daw-project',
      partialize: (state) => ({ project: state.project }),
      // Migrate old projects that don't have newer fields
      merge: (persisted: unknown, current: ProjectState) => {
        const state = persisted as Partial<ProjectState>;
        if (state?.project) {
          // Ensure generationDefaults has all fields
          if (state.project.generationDefaults) {
            if (state.project.generationDefaults.useModal === undefined) {
              state.project.generationDefaults.useModal = true;
            }
          } else {
            state.project.generationDefaults = { ...DEFAULT_GENERATION };
          }
          state.project.tracks = (state.project.tracks ?? []).map((track) => ({
            ...track,
            hidden: track.hidden ?? false,
          }));
        }
        return { ...current, ...state };
      },
    },
  ),
);

// Auto-save to project library (IDB) on changes, debounced
let _saveTimer: ReturnType<typeof setTimeout>;
useProjectStore.subscribe((state) => {
  if (!state.project) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    const proj = useProjectStore.getState().project;
    if (proj) saveProjectToIDB(proj);
  }, 1000);
});
