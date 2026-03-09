import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import { useTransportStore } from '../../store/transportStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { TimeDisplay } from '../transport/TimeDisplay';
import { TempoDisplay } from '../transport/TempoDisplay';
import { IconDropdownControl } from '../transport/IconDropdownControl';
import type { ActiveTab } from '../../store/uiStore';
import type { GridResolution, TimeDisplayMode } from '../../features/arrangement/types';

const GRID_OPTIONS: Array<{ id: GridResolution; label: string }> = [
  { id: '1_bar', label: '1 Bar' },
  { id: '1_2', label: '1/2' },
  { id: '1_4', label: '1/4' },
  { id: '1_8', label: '1/8' },
  { id: '1_16', label: '1/16' },
  { id: '1_32', label: '1/32' },
];

const DISPLAY_OPTIONS: Array<{ id: TimeDisplayMode; label: string }> = [
  { id: 'bars_beats', label: 'Bars+Beats' },
  { id: 'seconds', label: 'Min:Sec' },
];

export function Toolbar() {
  const project = useProjectStore((s) => s.project);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);
  const setShowSettingsDialog = useUIStore((s) => s.setShowSettingsDialog);
  const setShowExportDialog = useUIStore((s) => s.setShowExportDialog);
  const setShowProjectListDialog = useUIStore((s) => s.setShowProjectListDialog);
  const setArrangementSettings = useArrangementStore((s) => s.setSettings);
  const arrangementWorkspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] ?? null : null,
  );
  const { isPlaying, play, pause, stop } = useTransport();
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const playbackScope = useTransportStore((s) => s.playbackScope);
  const toggleLoop = useTransportStore((s) => s.toggleLoop);
  const snapEnabled = arrangementWorkspace?.settings.snapEnabled ?? true;
  const snapResolution = arrangementWorkspace?.settings.snapResolution ?? '1_4';
  const isSelectionLooping = isPlaying && playbackScope.type === 'selection' && playbackScope.loop;

  const tabs: { id: ActiveTab; label: string; icon: string }[] = [
    { id: 'composer', label: 'Composer', icon: 'auto_awesome' },
    { id: 'daw', label: 'DAW', icon: 'tune' },
    { id: 'analyze', label: 'Analyze', icon: 'analytics' },
  ];

  return (
    <header className="h-14 border-b border-daw-border bg-daw-panel flex items-center justify-between px-4 z-50 shrink-0">
      {/* Left section: Logo + Actions + Tabs */}
      <div className="flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="logo-box">
            <div>COM<br />PLEX</div>
          </div>
          <span className="text-xl font-bold tracking-[-0.04em] uppercase text-white" style={{ fontFamily: "'Roboto Condensed', sans-serif" }}>
            COMPOSER
          </span>
        </div>

        <div className="h-5 w-px bg-white/10" />

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold tracking-wider text-slate-500">
          <button
            onClick={() => setShowProjectListDialog(true)}
            className="px-2 py-1 bg-black/20 border border-daw-border rounded hover:text-slate-300 transition-colors"
          >
            Projects
          </button>
          <button
            onClick={() => setShowNewProjectDialog(true)}
            className="px-2 py-1 bg-black/20 border border-daw-border rounded hover:text-slate-300 transition-colors"
          >
            New
          </button>
          <button
            onClick={() => setShowExportDialog(true)}
            className="px-2 py-1 bg-black/20 border border-daw-border rounded hover:text-slate-300 transition-colors"
            disabled={!project}
          >
            Export
          </button>
          <button
            onClick={() => setShowSettingsDialog(true)}
            className="px-2 py-1 bg-black/20 border border-daw-border rounded hover:text-slate-300 transition-colors"
          >
            Settings
          </button>
        </div>

        <div className="h-5 w-px bg-white/10" />

        {/* Tab switcher */}
        <div className="flex items-center bg-black/20 border border-daw-border rounded p-0.5 gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] rounded transition-colors ${activeTab === tab.id
                ? 'bg-daw-accent text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
            >
              <span className="material-symbols-outlined text-sm">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right section: Transport + Time */}
      <div className="flex items-center gap-4">
        {/* Transport Controls */}
        <div className="flex items-center gap-0.5 bg-black/30 p-1 rounded border border-daw-border">
          <button
            onClick={stop}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/5 rounded transition-colors"
            title="Stop"
          >
            <span className="material-symbols-outlined text-lg">stop</span>
          </button>
          <button
            onClick={() => isPlaying ? pause() : play()}
            className={`w-10 h-8 flex items-center justify-center rounded transition-colors ${isPlaying ? 'bg-white/10 text-daw-accent' : 'hover:bg-white/5 text-daw-accent'}`}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <span className="material-symbols-outlined text-xl">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button
            onClick={toggleLoop}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${loopEnabled ? 'text-daw-accent' : 'hover:bg-white/5 text-slate-500'}`}
            title={loopEnabled ? 'Loop On' : 'Loop Off'}
          >
            <span className="material-symbols-outlined text-lg">loop</span>
          </button>
          {isSelectionLooping && (
            <div
              className="h-8 px-2 flex items-center rounded text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-400/30"
              title="Selected clips are repeating continuously"
            >
              Repeat On
            </div>
          )}
        </div>

        {/* Time / BPM Display */}
        <div className="hidden lg:flex items-center gap-4 bg-black/40 border border-daw-border px-4 h-9 rounded font-mono text-daw-accent">
          <TimeDisplay />
          <div className="h-3 w-px bg-white/10" />
          <TempoDisplay />
          {activeTab === 'daw' && (
            <>
              <div className="h-3 w-px bg-white/10" />
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded border border-daw-border overflow-hidden bg-black/30">
                  <button
                    onClick={() =>
                      project &&
                      setArrangementSettings(project.id, {
                        viewMode: 'track',
                      })
                    }
                    disabled={!project}
                    title="Track view"
                    className={`px-2 py-1 text-[10px] uppercase font-sans tracking-wider border-r border-daw-border transition-colors ${
                      (arrangementWorkspace?.settings.viewMode ?? 'track') === 'track'
                        ? 'bg-daw-accent/15 text-daw-accent'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Track
                  </button>
                  <button
                    onClick={() =>
                      project &&
                      setArrangementSettings(project.id, {
                        viewMode: 'arrangement',
                      })
                    }
                    disabled={!project}
                    title="Song arrangement view"
                    className={`px-2 py-1 text-[10px] uppercase font-sans tracking-wider transition-colors ${
                      (arrangementWorkspace?.settings.viewMode ?? 'track') === 'arrangement'
                        ? 'bg-daw-accent/15 text-daw-accent'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Song
                  </button>
                </div>

                <button
                  onClick={() =>
                    project &&
                    setArrangementSettings(project.id, {
                      snapEnabled: !snapEnabled,
                    })
                  }
                  disabled={!project}
                  className={`flex items-center gap-1 px-2 py-1 rounded border border-daw-border transition-colors ${
                    snapEnabled
                      ? 'bg-daw-accent/15 text-daw-accent'
                      : 'bg-black/30 text-slate-500 hover:text-slate-300'
                  }`}
                  title={snapEnabled ? 'Disable snap' : 'Enable snap'}
                >
                  <span className="material-symbols-outlined text-[14px] leading-none">grid_on</span>
                  <span className="text-[10px] uppercase tracking-wider font-sans">Snap</span>
                </button>
                <IconDropdownControl
                  icon="tune"
                  title="Grid resolution"
                  value={snapResolution}
                  options={GRID_OPTIONS}
                  disabled={!project}
                  onChange={(value) =>
                    project &&
                    setArrangementSettings(project.id, {
                      snapResolution: value,
                      snapEnabled: true,
                    })
                  }
                />
                <IconDropdownControl
                  icon="schedule"
                  title="Display mode"
                  value={arrangementWorkspace?.settings.timeDisplayMode ?? 'bars_beats'}
                  options={DISPLAY_OPTIONS}
                  disabled={!project}
                  onChange={(value) =>
                    project &&
                    setArrangementSettings(project.id, {
                      timeDisplayMode: value,
                    })
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
