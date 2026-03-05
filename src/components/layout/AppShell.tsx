import { useEffect, useCallback } from 'react';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { TrackList } from '../tracks/TrackList';
import { Timeline } from '../timeline/Timeline';
import { GenerationPanel } from '../generation/GenerationPanel';
import { MixerConsole } from '../mixer/MixerConsole';
import { ClipPromptEditor } from '../generation/ClipPromptEditor';
import { ComposerView } from '../composer/ComposerView';
import { NewProjectDialog } from '../dialogs/NewProjectDialog';
import { InstrumentPicker } from '../dialogs/InstrumentPicker';
import { ExportDialog } from '../dialogs/ExportDialog';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { ProjectListDialog } from '../dialogs/ProjectListDialog';
import { KeyboardShortcutsDialog } from '../dialogs/KeyboardShortcutsDialog';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';

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
  const { isPlaying, play, pause } = useTransport();

  const handleClick = useCallback(() => {
    resumeOnGesture();
  }, [resumeOnGesture]);

  useEffect(() => {
    if (!project) {
      setShowNewProjectDialog(true);
    }
  }, []);

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
          <div className="flex flex-1 min-h-0">
            {project && <TrackList />}
            <Timeline />
          </div>
          {project && showMixer && <MixerConsole />}
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
    </div>
  );
}
