import { useEffect, useCallback } from 'react';
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
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import { useArrangementStore } from '../../store/arrangementStore';
import { useDawLayoutResize } from '../../hooks/useDawLayoutResize';

export function AppShell() {
  const { resumeOnGesture } = useAudioEngine();
  const project = useProjectStore((s) => s.project);
  const removeClip = useProjectStore((s) => s.removeClip);
  const activeTab = useUIStore((s) => s.activeTab);
  const showMixer = useUIStore((s) => s.showMixer);
  const showKeyboardShortcutsDialog = useUIStore((s) => s.showKeyboardShortcutsDialog);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const deselectAll = useUIStore((s) => s.deselectAll);
  const shortcutBindings = useUIStore((s) => s.shortcutBindings);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);
  const ensureProjectWorkspace = useArrangementStore((s) => s.ensureProjectWorkspace);
  const { isPlaying, play, pause } = useTransport();
  const { sidebarWidth, mixerHeight, startSidebarResize, startMixerResize } = useDawLayoutResize();

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
    const handler = (e: KeyboardEvent) => {
      if (
        showKeyboardShortcutsDialog ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
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
    selectedClipIds,
    showKeyboardShortcutsDialog,
    shortcutBindings,
  ]);

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
                  <TrackList />
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
              <Timeline />
              {project && <ArrangementPanel />}
            </div>
          </div>
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
      ) : (
        <div className="flex-1 min-h-0">
          <ComposerView />
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
    </div>
  );
}
