import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type {
  ArrangementSettings,
  ArrangementWorkspace,
  SectionGenerationPlan,
  SectionTake,
  SongSection,
  SongSectionKind,
  VocalProductionProfile,
} from '../features/arrangement/types';

const DEFAULT_SETTINGS: ArrangementSettings = {
  viewMode: 'track',
  hideInactiveTakes: false,
  snapEnabled: true,
  snapResolution: '1_4',
  timeDisplayMode: 'bars_beats',
  sectionCrossfadeSeconds: 0.2,
  masterTonePreset: 'clean',
  loudnessTarget: '-14',
};

const DEFAULT_VOCAL_PROFILE: VocalProductionProfile = {
  enabled: false,
  sourceFileName: null,
  languageHint: '',
  preserveLyrics: true,
};

function makeDefaultSections(totalDuration: number): SongSection[] {
  const length = Math.max(30, totalDuration);
  const quarter = length / 4;
  return [
    {
      id: uuidv4(),
      name: 'Intro',
      kind: 'intro',
      startTime: 0,
      endTime: quarter,
      targetEnergy: 0.35,
      lyricBlock: '',
      status: 'idle',
      locked: false,
    },
    {
      id: uuidv4(),
      name: 'Verse',
      kind: 'verse',
      startTime: quarter,
      endTime: quarter * 2,
      targetEnergy: 0.55,
      lyricBlock: '',
      status: 'idle',
      locked: false,
    },
    {
      id: uuidv4(),
      name: 'Chorus',
      kind: 'chorus',
      startTime: quarter * 2,
      endTime: quarter * 3,
      targetEnergy: 0.85,
      lyricBlock: '',
      status: 'idle',
      locked: false,
    },
    {
      id: uuidv4(),
      name: 'Outro',
      kind: 'outro',
      startTime: quarter * 3,
      endTime: length,
      targetEnergy: 0.4,
      lyricBlock: '',
      status: 'idle',
      locked: false,
    },
  ];
}

function createWorkspace(totalDuration: number): ArrangementWorkspace {
  return {
    sections: makeDefaultSections(totalDuration),
    takesBySectionId: {},
    selectedTakeBySectionId: {},
    generationPlanBySectionId: {},
    selectedSectionId: null,
    settings: { ...DEFAULT_SETTINGS },
    vocalProfile: { ...DEFAULT_VOCAL_PROFILE },
  };
}

function normalizeWorkspace(workspace: ArrangementWorkspace): ArrangementWorkspace {
  const rawSettings = (workspace.settings ?? {}) as Partial<ArrangementSettings> & {
    snapMode?: 'off' | 'bar' | 'beat' | 'half_beat' | 'quarter_beat';
  };
  const snapEnabledFromLegacy =
    rawSettings.snapMode == null ? DEFAULT_SETTINGS.snapEnabled : rawSettings.snapMode !== 'off';
  const snapResolutionFromLegacy =
    rawSettings.snapMode === 'bar'
      ? '1_bar'
      : rawSettings.snapMode === 'half_beat'
        ? '1_8'
        : rawSettings.snapMode === 'quarter_beat'
          ? '1_16'
          : '1_4';

  return {
    ...workspace,
    settings: {
      ...DEFAULT_SETTINGS,
      ...rawSettings,
      snapEnabled: rawSettings.snapEnabled ?? snapEnabledFromLegacy,
      snapResolution: rawSettings.snapResolution ?? snapResolutionFromLegacy,
    },
    vocalProfile: {
      ...DEFAULT_VOCAL_PROFILE,
      ...workspace.vocalProfile,
    },
  };
}

interface ArrangementState {
  workspacesByProjectId: Record<string, ArrangementWorkspace>;
  ensureProjectWorkspace: (projectId: string, totalDuration: number) => void;
  clearProjectWorkspace: (projectId: string) => void;
  createSection: (projectId: string, kind?: SongSectionKind) => void;
  updateSection: (projectId: string, sectionId: string, patch: Partial<SongSection>) => void;
  removeSection: (projectId: string, sectionId: string) => void;
  selectSection: (projectId: string, sectionId: string | null) => void;
  setSectionStatus: (
    projectId: string,
    sectionId: string,
    status: SongSection['status'],
    errorMessage?: string,
  ) => void;
  setSectionGenerationPlan: (
    projectId: string,
    sectionId: string,
    patch: Partial<SectionGenerationPlan>,
  ) => void;
  upsertTake: (projectId: string, sectionId: string, take: SectionTake) => void;
  setTakeSelected: (projectId: string, sectionId: string, takeId: string) => void;
  updateTake: (
    projectId: string,
    sectionId: string,
    takeId: string,
    patch: Partial<SectionTake>,
  ) => void;
  removeTake: (projectId: string, sectionId: string, takeId: string) => void;
  setSettings: (projectId: string, patch: Partial<ArrangementSettings>) => void;
  setVocalProfile: (projectId: string, patch: Partial<VocalProductionProfile>) => void;
}

export const useArrangementStore = create<ArrangementState>()(
  persist(
    (set, get) => ({
      workspacesByProjectId: {},

      ensureProjectWorkspace: (projectId, totalDuration) => {
        const existing = get().workspacesByProjectId[projectId];
        if (existing) return;
        set((s) => ({
          workspacesByProjectId: {
            ...s.workspacesByProjectId,
            [projectId]: createWorkspace(totalDuration),
          },
        }));
      },

      clearProjectWorkspace: (projectId) =>
        set((s) => {
          const next = { ...s.workspacesByProjectId };
          delete next[projectId];
          return { workspacesByProjectId: next };
        }),

      createSection: (projectId, kind = 'custom') =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          const lastEnd = ws.sections.length > 0 ? ws.sections[ws.sections.length - 1].endTime : 0;
          const nextSection: SongSection = {
            id: uuidv4(),
            name: kind === 'custom' ? 'Section' : kind.replace('_', ' '),
            kind,
            startTime: lastEnd,
            endTime: lastEnd + 8,
            targetEnergy: 0.6,
            lyricBlock: '',
            status: 'idle',
            locked: false,
          };
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: { ...ws, sections: [...ws.sections, nextSection], selectedSectionId: nextSection.id },
            },
          };
        }),

      updateSection: (projectId, sectionId, patch) =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: {
                ...ws,
                sections: ws.sections.map((section) =>
                  section.id === sectionId ? { ...section, ...patch } : section,
                ),
              },
            },
          };
        }),

      removeSection: (projectId, sectionId) =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          const nextSections = ws.sections.filter((section) => section.id !== sectionId);
          const nextTakes = { ...ws.takesBySectionId };
          const nextSelected = { ...ws.selectedTakeBySectionId };
          const nextPlans = { ...ws.generationPlanBySectionId };
          delete nextTakes[sectionId];
          delete nextSelected[sectionId];
          delete nextPlans[sectionId];
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: {
                ...ws,
                sections: nextSections,
                takesBySectionId: nextTakes,
                selectedTakeBySectionId: nextSelected,
                generationPlanBySectionId: nextPlans,
                selectedSectionId: ws.selectedSectionId === sectionId ? null : ws.selectedSectionId,
              },
            },
          };
        }),

      selectSection: (projectId, sectionId) =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: { ...ws, selectedSectionId: sectionId },
            },
          };
        }),

      setSectionStatus: (projectId, sectionId, status, errorMessage) =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: {
                ...ws,
                sections: ws.sections.map((section) =>
                  section.id === sectionId ? { ...section, status, errorMessage } : section,
                ),
              },
            },
          };
        }),

      setSectionGenerationPlan: (projectId, sectionId, patch) =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          const current = ws.generationPlanBySectionId[sectionId] ?? {
            enabledTrackIds: [],
            styleLock: 'balanced',
            takesPerSection: 3,
          };
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: {
                ...ws,
                generationPlanBySectionId: {
                  ...ws.generationPlanBySectionId,
                  [sectionId]: { ...current, ...patch },
                },
              },
            },
          };
        }),

      upsertTake: (projectId, sectionId, take) =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          const existing = ws.takesBySectionId[sectionId] ?? [];
          const idx = existing.findIndex((item) => item.id === take.id);
          const next =
            idx === -1
              ? [...existing, take]
              : existing.map((item, itemIndex) => (itemIndex === idx ? take : item));
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: {
                ...ws,
                takesBySectionId: { ...ws.takesBySectionId, [sectionId]: next },
              },
            },
          };
        }),

      setTakeSelected: (projectId, sectionId, takeId) =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          const nextTakes = (ws.takesBySectionId[sectionId] ?? []).map((take) => ({
            ...take,
            selected: take.id === takeId,
          }));
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: {
                ...ws,
                takesBySectionId: { ...ws.takesBySectionId, [sectionId]: nextTakes },
                selectedTakeBySectionId: { ...ws.selectedTakeBySectionId, [sectionId]: takeId },
              },
            },
          };
        }),

      updateTake: (projectId, sectionId, takeId, patch) =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: {
                ...ws,
                takesBySectionId: {
                  ...ws.takesBySectionId,
                  [sectionId]: (ws.takesBySectionId[sectionId] ?? []).map((take) =>
                    take.id === takeId ? { ...take, ...patch } : take,
                  ),
                },
              },
            },
          };
        }),

      removeTake: (projectId, sectionId, takeId) =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          const nextTakes = (ws.takesBySectionId[sectionId] ?? []).filter((take) => take.id !== takeId);
          const selectedTakeId = ws.selectedTakeBySectionId[sectionId] ?? null;
          const fallbackSelected = nextTakes.find((take) => take.selected)?.id ?? nextTakes[0]?.id ?? null;
          const nextSelectedTakeId = selectedTakeId === takeId ? fallbackSelected : selectedTakeId;
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: {
                ...ws,
                takesBySectionId: {
                  ...ws.takesBySectionId,
                  [sectionId]: nextTakes.map((take) => ({
                    ...take,
                    selected: nextSelectedTakeId != null && take.id === nextSelectedTakeId,
                  })),
                },
                selectedTakeBySectionId: {
                  ...ws.selectedTakeBySectionId,
                  [sectionId]: nextSelectedTakeId,
                },
              },
            },
          };
        }),

      setSettings: (projectId, patch) =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: { ...ws, settings: { ...ws.settings, ...patch } },
            },
          };
        }),

      setVocalProfile: (projectId, patch) =>
        set((s) => {
          const ws = s.workspacesByProjectId[projectId];
          if (!ws) return s;
          return {
            workspacesByProjectId: {
              ...s.workspacesByProjectId,
              [projectId]: { ...ws, vocalProfile: { ...ws.vocalProfile, ...patch } },
            },
          };
        }),
    }),
    {
      name: 'ace-step-arrangement-workspaces',
      partialize: (state) => ({ workspacesByProjectId: state.workspacesByProjectId }),
      merge: (persistedState: unknown, currentState) => {
        const persisted = persistedState as Partial<ArrangementState> | undefined;
        const persistedWorkspaces = persisted?.workspacesByProjectId ?? {};
        const normalized = Object.fromEntries(
          Object.entries(persistedWorkspaces).map(([projectId, workspace]) => [
            projectId,
            normalizeWorkspace(workspace),
          ]),
        );
        return {
          ...currentState,
          ...persisted,
          workspacesByProjectId: normalized,
        };
      },
    },
  ),
);

export function getArrangementWorkspace(projectId: string | null): ArrangementWorkspace | null {
  if (!projectId) return null;
  return useArrangementStore.getState().workspacesByProjectId[projectId] ?? null;
}

export function getSelectedTakeIdForSection(
  projectId: string | null,
  sectionId: string | null,
): string | null {
  if (!projectId || !sectionId) return null;
  const ws = getArrangementWorkspace(projectId);
  if (!ws) return null;
  return ws.selectedTakeBySectionId[sectionId] ?? null;
}
