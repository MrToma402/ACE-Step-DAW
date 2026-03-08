import { useEffect, useCallback, useRef, type MutableRefObject } from 'react';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { TrackList } from '../tracks/TrackList';
import { Timeline } from '../timeline/Timeline';
import { GenerationPanel } from '../generation/GenerationPanel';
import { MixerConsole } from '../mixer/MixerConsole';
import { ArrangementPanel } from '../arrangement/ArrangementPanel';
import { ClipPromptEditor } from '../generation/ClipPromptEditor';
import { ComposerView } from '../composer/ComposerView';
import { NewProjectDialog } from '../dialogs/NewProjectDialog';
import { InstrumentPicker } from '../dialogs/InstrumentPicker';
import { ExportDialog } from '../dialogs/ExportDialog';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { ProjectListDialog } from '../dialogs/ProjectListDialog';
import { KeyboardShortcutsDialog } from '../dialogs/KeyboardShortcutsDialog';
import { ExtendConfirmDialog } from '../dialogs/ExtendConfirmDialog';
import { RepaintDialog } from '../dialogs/RepaintDialog';
import { CoverDialog } from '../dialogs/CoverDialog';
import { AnalyzeView } from '../analyze/AnalyzeView';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import { useArrangementStore } from '../../store/arrangementStore';
import { useDawLayoutResize } from '../../hooks/useDawLayoutResize';
import { resolveDuplicateShortcutAction } from '../../features/timeline/duplicateShortcut';

export function AppShell() {
  const { resumeOnGesture } = useAudioEngine();
  const project = useProjectStore((s) => s.project);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const addTrack = useProjectStore((s) => s.addTrack);
  const moveClipToTrack = useProjectStore((s) => s.moveClipToTrack);
  const getClipById = useProjectStore((s) => s.getClipById);
  const getTrackForClip = useProjectStore((s) => s.getTrackForClip);
  const activeTab = useUIStore((s) => s.activeTab);
  const showMixer = useUIStore((s) => s.showMixer);
  const showKeyboardShortcutsDialog = useUIStore((s) => s.showKeyboardShortcutsDialog);
  const showNewProjectDialog = useUIStore((s) => s.showNewProjectDialog);
  const showInstrumentPicker = useUIStore((s) => s.showInstrumentPicker);
  const showExportDialog = useUIStore((s) => s.showExportDialog);
  const showSettingsDialog = useUIStore((s) => s.showSettingsDialog);
  const showProjectListDialog = useUIStore((s) => s.showProjectListDialog);
  const editingClipId = useUIStore((s) => s.editingClipId);
  const extendConfirmRequest = useUIStore((s) => s.extendConfirmRequest);
  const repaintRequest = useUIStore((s) => s.repaintRequest);
  const coverRequest = useUIStore((s) => s.coverRequest);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const deselectAll = useUIStore((s) => s.deselectAll);
  const shortcutBindings = useUIStore((s) => s.shortcutBindings);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);
  const setShowInstrumentPicker = useUIStore((s) => s.setShowInstrumentPicker);
  const setShowExportDialog = useUIStore((s) => s.setShowExportDialog);
  const setShowSettingsDialog = useUIStore((s) => s.setShowSettingsDialog);
  const setShowProjectListDialog = useUIStore((s) => s.setShowProjectListDialog);
  const setShowKeyboardShortcutsDialog = useUIStore((s) => s.setShowKeyboardShortcutsDialog);
  const setEditingClip = useUIStore((s) => s.setEditingClip);
  const closeExtendConfirmDialog = useUIStore((s) => s.closeExtendConfirmDialog);
  const closeRepaintDialog = useUIStore((s) => s.closeRepaintDialog);
  const closeCoverDialog = useUIStore((s) => s.closeCoverDialog);
  const setShiftPressed = useUIStore((s) => s.setShiftPressed);
  const ensureProjectWorkspace = useArrangementStore((s) => s.ensureProjectWorkspace);
  const { isPlaying, play, pause } = useTransport();
  const { sidebarWidth, mixerHeight, startSidebarResize, startMixerResize } = useDawLayoutResize();
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollSourceRef = useRef<'sidebar' | 'timeline' | null>(null);

  const handleClick = useCallback(() => {
    resumeOnGesture();
  }, [resumeOnGesture]);

  useEffect(() => {
    if (!project) {
      setShowNewProjectDialog(true);
    }
  }, []);

  useEffect(() => {
    if (!project) return;
    ensureProjectWorkspace(project.id, project.totalDuration);
  }, [project?.id, project?.totalDuration, ensureProjectWorkspace]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftPressed(false);
    };
    const handleBlur = () => setShiftPressed(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      setShiftPressed(false);
    };
  }, [setShiftPressed]);

  useEffect(() => {
    const closeTopmostOverlay = (): boolean => {
      if (showKeyboardShortcutsDialog) {
        setShowKeyboardShortcutsDialog(false);
        return true;
      }
      if (extendConfirmRequest) {
        closeExtendConfirmDialog();
        return true;
      }
      if (repaintRequest) {
        closeRepaintDialog();
        return true;
      }
      if (coverRequest) {
        closeCoverDialog();
        return true;
      }
      if (editingClipId) {
        setEditingClip(null);
        return true;
      }
      if (showSettingsDialog) {
        setShowSettingsDialog(false);
        return true;
      }
      if (showExportDialog) {
        setShowExportDialog(false);
        return true;
      }
      if (showInstrumentPicker) {
        setShowInstrumentPicker(false);
        return true;
      }
      if (showProjectListDialog) {
        setShowProjectListDialog(false);
        return true;
      }
      if (showNewProjectDialog) {
        setShowNewProjectDialog(false);
        return true;
      }
      return false;
    };

    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (closeTopmostOverlay()) {
          e.preventDefault();
        }
        return;
      }

      if (
        showKeyboardShortcutsDialog ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const duplicateAction = resolveDuplicateShortcutAction(e);
      if (duplicateAction) {
        if (activeTab !== 'daw' || selectedClipIds.size === 0) return;
        e.preventDefault();
        const selectedIds = Array.from(selectedClipIds);
        if (duplicateAction === 'duplicate') {
          for (const clipId of selectedIds) {
            duplicateClip(clipId);
          }
        } else {
          for (const clipId of selectedIds) {
            const sourceClip = getClipById(clipId);
            if (!sourceClip) continue;
            const sourceTrack = getTrackForClip(clipId);
            const duplicatedClip = duplicateClip(clipId);
            if (!duplicatedClip) continue;
            const layerTrack = addTrack(sourceTrack?.trackName ?? 'custom');
            moveClipToTrack(duplicatedClip.id, layerTrack.id, { startTime: sourceClip.startTime });
          }
        }
        return;
      }

      if (e.code === shortcutBindings.playPause) {
        e.preventDefault();
        if (isPlaying) pause();
        else play();
        return;
      }

      if (e.code === shortcutBindings.deleteSelected) {
        if (activeTab !== 'daw' || selectedClipIds.size === 0) return;
        e.preventDefault();
        for (const clipId of selectedClipIds) {
          removeClip(clipId);
        }
        deselectAll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    activeTab,
    deselectAll,
    isPlaying,
    pause,
    play,
    removeClip,
    duplicateClip,
    addTrack,
    moveClipToTrack,
    getClipById,
    getTrackForClip,
    selectedClipIds,
    showKeyboardShortcutsDialog,
    showNewProjectDialog,
    showInstrumentPicker,
    showExportDialog,
    showSettingsDialog,
    showProjectListDialog,
    editingClipId,
    extendConfirmRequest,
    repaintRequest,
    coverRequest,
    shortcutBindings,
    closeExtendConfirmDialog,
    closeRepaintDialog,
    closeCoverDialog,
    setEditingClip,
    setShowExportDialog,
    setShowInstrumentPicker,
    setShowKeyboardShortcutsDialog,
    setShowProjectListDialog,
    setShowSettingsDialog,
    setShowNewProjectDialog,
  ]);

  const syncVerticalScroll = useCallback((
    source: 'sidebar' | 'timeline',
    targetRef: MutableRefObject<HTMLDivElement | null>,
    scrollTop: number,
  ) => {
    if (syncingScrollSourceRef.current && syncingScrollSourceRef.current !== source) return;
    syncingScrollSourceRef.current = source;
    const target = targetRef.current;
    if (target && Math.abs(target.scrollTop - scrollTop) > 1) {
      target.scrollTop = scrollTop;
    }
    requestAnimationFrame(() => {
      if (syncingScrollSourceRef.current === source) {
        syncingScrollSourceRef.current = null;
      }
    });
  }, []);

  const handleSidebarScroll = useCallback((scrollTop: number) => {
    syncVerticalScroll('sidebar', timelineScrollRef, scrollTop);
  }, [syncVerticalScroll]);

  const handleTimelineScroll = useCallback((scrollTop: number) => {
    syncVerticalScroll('timeline', sidebarScrollRef, scrollTop);
  }, [syncVerticalScroll]);

  return (
    <div className="flex flex-col h-screen bg-daw-bg" onClick={handleClick}>
      <Toolbar />

      {activeTab === 'daw' ? (
        <>
          <div className="flex flex-1 min-h-0 min-w-0">
            {project && (
              <>
                <div
                  className="shrink-0 h-full"
                  style={{ width: sidebarWidth, minWidth: 120, maxWidth: 360 }}
                >
                  <TrackList
                    scrollBodyRef={sidebarScrollRef}
                    onVerticalScroll={handleSidebarScroll}
                  />
                </div>
                <div className="w-0 shrink-0 relative">
                  <div
                    onMouseDown={startSidebarResize}
                    className="absolute inset-y-0 -left-0.5 w-1 cursor-col-resize bg-transparent hover:bg-daw-accent/30 transition-colors"
                    title="Drag to resize track panel"
                  />
                </div>
              </>
            )}
            <div className="flex-1 min-h-0 min-w-0 flex flex-col">
              <Timeline
                scrollBodyRef={timelineScrollRef}
                onVerticalScroll={handleTimelineScroll}
              />
            </div>
          </div>
          {project && <ArrangementPanel />}
          {project && showMixer && (
            <div
              className="relative shrink-0"
              style={{ height: mixerHeight, minHeight: 160, maxHeight: 520 }}
            >
              <div
                onMouseDown={startMixerResize}
                className="absolute top-0 left-0 right-0 h-2 -translate-y-1/2 cursor-row-resize z-20"
                title="Drag to resize mixer"
              >
                <div className="mx-auto mt-1 h-0.5 w-16 rounded bg-white/20 hover:bg-daw-accent/50 transition-colors" />
              </div>
              <MixerConsole />
            </div>
          )}
          {project && <GenerationPanel />}
        </>
      ) : activeTab === 'composer' ? (
        <div className="flex-1 min-h-0">
          <ComposerView />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <AnalyzeView />
        </div>
      )}

      <StatusBar />

      {/* Modals */}
      <ClipPromptEditor />
      <NewProjectDialog />
      <InstrumentPicker />
      <ExportDialog />
      <SettingsDialog />
      <KeyboardShortcutsDialog />
      <ProjectListDialog />
      <ExtendConfirmDialog />
      <RepaintDialog />
      <CoverDialog />
    </div>
  );
}
