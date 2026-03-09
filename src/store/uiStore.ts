import { create } from 'zustand';

export type ActiveTab = 'daw' | 'composer' | 'analyze';

export interface ShortcutBindings {
  playPause: string;
  playSelectedIsolation: string;
  playSelectedIsolationLoop: string;
  deleteSelected: string;
  deleteSelectedTracks: string;
  mergeSelected: string;
}

export interface ClipDragPreview {
  clipId: string;
  sourceTrackId: string;
  hoverTrackId: string;
  startTime: number;
  duration: number;
  color: string;
}

export interface ExtendConfirmRequest {
  clipId: string;
  trackId: string;
  baseStartTime: number;
  baseDuration: number;
  extensionDuration: number;
  originalGenerationStatus: 'empty' | 'queued' | 'generating' | 'processing' | 'ready' | 'error' | 'stale';
}

export interface RepaintRequest {
  clipId: string;
  startTime: number;
  endTime: number;
}

export interface CoverRequest {
  clipId: string;
  referenceClipId: string;
}

interface UIState {
  activeTab: ActiveTab;
  pixelsPerSecond: number;
  scrollX: number;
  scrollY: number;
  isImportingAudio: boolean;
  selectedClipIds: Set<string>;
  selectedTrackIds: Set<string>;
  editingClipId: string | null;
  showNewProjectDialog: boolean;
  showInstrumentPicker: boolean;
  showExportDialog: boolean;
  showSettingsDialog: boolean;
  showProjectListDialog: boolean;
  showKeyboardShortcutsDialog: boolean;
  draftClipId: string | null;
  extendConfirmRequest: ExtendConfirmRequest | null;
  repaintRequest: RepaintRequest | null;
  coverRequest: CoverRequest | null;
  isShiftPressed: boolean;
  showMixer: boolean;
  shortcutBindings: ShortcutBindings;
  clipDragPreview: ClipDragPreview | null;
  isClipGestureActive: boolean;

  setActiveTab: (tab: ActiveTab) => void;
  setPixelsPerSecond: (pps: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollX: (x: number) => void;
  setScrollY: (y: number) => void;
  setIsImportingAudio: (v: boolean) => void;
  selectClip: (clipId: string, multi?: boolean) => void;
  selectTrack: (trackId: string, multi?: boolean) => void;
  setSelectedTracks: (trackIds: Iterable<string>) => void;
  clearSelectedTracks: () => void;
  deselectAll: () => void;
  setEditingClip: (clipId: string | null) => void;
  setShowNewProjectDialog: (v: boolean) => void;
  setShowInstrumentPicker: (v: boolean) => void;
  setShowExportDialog: (v: boolean) => void;
  setShowSettingsDialog: (v: boolean) => void;
  setShowProjectListDialog: (v: boolean) => void;
  setShowKeyboardShortcutsDialog: (v: boolean) => void;
  setDraftClipId: (clipId: string | null) => void;
  openExtendConfirmDialog: (request: ExtendConfirmRequest) => void;
  closeExtendConfirmDialog: () => void;
  openRepaintDialog: (request: RepaintRequest) => void;
  closeRepaintDialog: () => void;
  openCoverDialog: (request: CoverRequest) => void;
  closeCoverDialog: () => void;
  setShiftPressed: (pressed: boolean) => void;
  setShortcutBinding: (action: keyof ShortcutBindings, keyCode: string) => void;
  resetShortcutBindings: () => void;
  setClipDragPreview: (preview: ClipDragPreview | null) => void;
  setClipGestureActive: (active: boolean) => void;
  toggleMixer: () => void;
}

const ZOOM_LEVELS = [10, 25, 50, 100, 200, 500];
const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings = {
  playPause: 'Space',
  playSelectedIsolation: 'KeyP',
  playSelectedIsolationLoop: 'KeyR',
  deleteSelected: 'Backspace',
  deleteSelectedTracks: 'Shift+Delete',
  mergeSelected: 'KeyM',
};

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'composer',
  pixelsPerSecond: 50,
  scrollX: 0,
  scrollY: 0,
  isImportingAudio: false,
  selectedClipIds: new Set(),
  selectedTrackIds: new Set(),
  editingClipId: null,
  showNewProjectDialog: false,
  showInstrumentPicker: false,
  showExportDialog: false,
  showSettingsDialog: false,
  showProjectListDialog: false,
  showKeyboardShortcutsDialog: false,
  draftClipId: null,
  extendConfirmRequest: null,
  repaintRequest: null,
  coverRequest: null,
  isShiftPressed: false,
  showMixer: true,
  shortcutBindings: DEFAULT_SHORTCUT_BINDINGS,
  clipDragPreview: null,
  isClipGestureActive: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setPixelsPerSecond: (pps) => set({ pixelsPerSecond: pps }),

  zoomIn: () =>
    set((s) => {
      const idx = ZOOM_LEVELS.findIndex((z) => z >= s.pixelsPerSecond);
      const next = idx < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[idx + 1] : s.pixelsPerSecond;
      return { pixelsPerSecond: next };
    }),

  zoomOut: () =>
    set((s) => {
      const idx = ZOOM_LEVELS.findIndex((z) => z >= s.pixelsPerSecond);
      const prev = idx > 0 ? ZOOM_LEVELS[idx - 1] : s.pixelsPerSecond;
      return { pixelsPerSecond: prev };
    }),

  setScrollX: (x) => set({ scrollX: x }),
  setScrollY: (y) => set({ scrollY: y }),
  setIsImportingAudio: (v) => set({ isImportingAudio: v }),

  selectClip: (clipId, multi) =>
    set((s) => {
      if (multi) {
        const next = new Set(s.selectedClipIds);
        if (next.has(clipId)) next.delete(clipId);
        else next.add(clipId);
        return { selectedClipIds: next, selectedTrackIds: new Set() };
      }
      return { selectedClipIds: new Set([clipId]), selectedTrackIds: new Set() };
    }),

  selectTrack: (trackId, multi) =>
    set((s) => {
      if (multi) {
        const next = new Set(s.selectedTrackIds);
        if (next.has(trackId)) next.delete(trackId);
        else next.add(trackId);
        return { selectedTrackIds: next };
      }
      return { selectedTrackIds: new Set([trackId]) };
    }),

  setSelectedTracks: (trackIds) => set({ selectedTrackIds: new Set(trackIds) }),
  clearSelectedTracks: () => set({ selectedTrackIds: new Set() }),

  deselectAll: () => set({ selectedClipIds: new Set() }),

  setEditingClip: (clipId) => set({ editingClipId: clipId }),
  setShowNewProjectDialog: (v) => set({ showNewProjectDialog: v }),
  setShowInstrumentPicker: (v) => set({ showInstrumentPicker: v }),
  setShowExportDialog: (v) => set({ showExportDialog: v }),
  setShowSettingsDialog: (v) => set({ showSettingsDialog: v }),
  setShowProjectListDialog: (v) => set({ showProjectListDialog: v }),
  setShowKeyboardShortcutsDialog: (v) => set({ showKeyboardShortcutsDialog: v }),
  setDraftClipId: (clipId) => set({ draftClipId: clipId }),
  openExtendConfirmDialog: (request) => set({ extendConfirmRequest: request }),
  closeExtendConfirmDialog: () => set({ extendConfirmRequest: null }),
  openRepaintDialog: (request) => set({ repaintRequest: request }),
  closeRepaintDialog: () => set({ repaintRequest: null }),
  openCoverDialog: (request) => set({ coverRequest: request }),
  closeCoverDialog: () => set({ coverRequest: null }),
  setShiftPressed: (pressed) => set({ isShiftPressed: pressed }),
  setShortcutBinding: (action, keyCode) =>
    set((s) => ({
      shortcutBindings: {
        ...s.shortcutBindings,
        [action]: keyCode,
      },
    })),
  resetShortcutBindings: () => set({ shortcutBindings: DEFAULT_SHORTCUT_BINDINGS }),
  setClipDragPreview: (preview) => set({ clipDragPreview: preview }),
  setClipGestureActive: (active) => set({ isClipGestureActive: active }),
  toggleMixer: () => set((s) => ({ showMixer: !s.showMixer })),
}));
