import { useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { exportMixToWav } from '../../engine/exportMix';
import { isArrangementClipSelected } from '../../features/arrangement/selection';

export function ExportDialog() {
  const show = useUIStore((s) => s.showExportDialog);
  const setShow = useUIStore((s) => s.setShowExportDialog);
  const project = useProjectStore((s) => s.project);
  const setArrangementSettings = useArrangementStore((s) => s.setSettings);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] ?? null : null,
  );
  const [exporting, setExporting] = useState(false);
  const [exportType, setExportType] = useState<'mix' | 'stems'>('mix');

  if (!show || !project) return null;

  const collectTrackClips = async (
    trackFilter?: (trackId: string) => boolean,
  ): Promise<Array<{ startTime: number; buffer: AudioBuffer; volume: number }>> => {
    const engine = getAudioEngine();
    const clips: Array<{ startTime: number; buffer: AudioBuffer; volume: number }> = [];
    const anySoloed = project.tracks.some((t) => !t.hidden && t.soloed);
    for (const track of project.tracks) {
      if (trackFilter && !trackFilter(track.id)) continue;
      if (track.hidden) continue;
      if (track.muted) continue;
      if (!trackFilter && anySoloed && !track.soloed) continue;
      for (const clip of track.clips) {
        if (!isArrangementClipSelected(clip, workspace)) continue;
        if (clip.generationStatus !== 'ready' || !clip.isolatedAudioKey) continue;
        const blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
        if (!blob) continue;
        const buffer = await engine.decodeAudioData(blob);
        clips.push({ startTime: clip.startTime, buffer, volume: track.volume });
      }
    }
    return clips;
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      if (exportType === 'mix') {
        const clips = await collectTrackClips();
        const wavBlob = await exportMixToWav(clips, project.totalDuration, 48000, {
          tonePreset: workspace?.settings.masterTonePreset ?? 'clean',
          loudnessTarget: workspace?.settings.loudnessTarget ?? '-14',
        });
        downloadBlob(wavBlob, `${project.name}.wav`);
      } else {
        for (const track of project.tracks) {
          if (track.hidden) continue;
          const clips = await collectTrackClips((trackId) => trackId === track.id);
          if (clips.length === 0) continue;
          const stemBlob = await exportMixToWav(clips, project.totalDuration, 48000, {
            tonePreset: 'clean',
            loudnessTarget: '-18',
          });
          downloadBlob(stemBlob, `${project.name}-${track.displayName.replace(/\s+/g, '_').toLowerCase()}.wav`);
        }
      }
      setShow(false);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  const visibleTracks = project.tracks.filter((track) => !track.hidden);
  const readyClips = visibleTracks.flatMap((t) =>
    t.clips.filter((c) => c.generationStatus === 'ready' && isArrangementClipSelected(c, workspace)),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[360px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Export Mix</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-zinc-400">
            Export selected arrangement takes as a stereo WAV or per-track stems.
          </p>
          <p className="text-xs text-zinc-500">
            {readyClips.length} clip{readyClips.length !== 1 ? 's' : ''} ready across{' '}
            {visibleTracks.length} track{visibleTracks.length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setExportType('mix')}
              className={`px-2 py-1 text-[10px] uppercase border rounded ${exportType === 'mix' ? 'border-daw-accent text-daw-accent bg-daw-accent/10' : 'border-daw-border text-slate-400'}`}
            >
              Full Mix
            </button>
            <button
              onClick={() => setExportType('stems')}
              className={`px-2 py-1 text-[10px] uppercase border rounded ${exportType === 'stems' ? 'border-daw-accent text-daw-accent bg-daw-accent/10' : 'border-daw-border text-slate-400'}`}
            >
              Stems (WAV)
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Master Tone
              </label>
              <select
                value={workspace?.settings.masterTonePreset ?? 'clean'}
                onChange={(e) =>
                  project &&
                  setArrangementSettings(project.id, {
                    masterTonePreset: e.target.value as 'clean' | 'punch' | 'warm',
                  })
                }
                className="w-full px-2 py-1 text-[10px] uppercase bg-black/20 border border-daw-border rounded"
              >
                <option value="clean">Clean</option>
                <option value="punch">Punch</option>
                <option value="warm">Warm</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Target LUFS
              </label>
              <select
                value={workspace?.settings.loudnessTarget ?? '-14'}
                onChange={(e) =>
                  project &&
                  setArrangementSettings(project.id, {
                    loudnessTarget: e.target.value as '-18' | '-14' | '-10',
                  })
                }
                className="w-full px-2 py-1 text-[10px] uppercase bg-black/20 border border-daw-border rounded"
              >
                <option value="-18">-18 LUFS</option>
                <option value="-14">-14 LUFS</option>
                <option value="-10">-10 LUFS</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-daw-border gap-2">
          <button
            onClick={() => setShow(false)}
            className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || readyClips.length === 0}
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : exportType === 'mix' ? 'Export Mix WAV' : 'Export Stems'}
          </button>
        </div>
      </div>
    </div>
  );
}
