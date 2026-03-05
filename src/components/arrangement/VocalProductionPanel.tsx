import { useAudioImport } from '../../hooks/useAudioImport';
import type { Project } from '../../types/project';
import type { VocalProductionProfile } from '../../features/arrangement/types';

interface VocalProductionPanelProps {
  project: Project;
  profile: VocalProductionProfile;
  onPatch: (patch: Partial<VocalProductionProfile>) => void;
}

export function VocalProductionPanel({ project, profile, onPatch }: VocalProductionPanelProps) {
  const { importAudioToTrack } = useAudioImport();
  const vocalTrack = project.tracks.find((track) => track.trackName === 'vocals') ?? null;

  const handleImportVocal = () => {
    if (!vocalTrack) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await importAudioToTrack(file, vocalTrack.id);
      onPatch({
        enabled: true,
        sourceFileName: file.name,
      });
    };
    input.click();
  };

  return (
    <div className="px-3 py-2 border-b border-daw-border bg-black/10">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-300">Vocal-First Profile</h4>
        <label className="flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-wider">
          <input
            type="checkbox"
            checked={profile.enabled}
            onChange={(e) => onPatch({ enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleImportVocal}
          disabled={!vocalTrack}
          className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider rounded border border-daw-border bg-black/20 hover:bg-white/5 disabled:opacity-50"
        >
          Import Vocal
        </button>
        <input
          value={profile.languageHint}
          onChange={(e) => onPatch({ languageHint: e.target.value })}
          placeholder="Language hint"
          className="px-2 py-1 text-[11px] bg-black/20 border border-daw-border rounded"
        />
        <label className="flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-wider">
          <input
            type="checkbox"
            checked={profile.preserveLyrics}
            onChange={(e) => onPatch({ preserveLyrics: e.target.checked })}
          />
          Preserve Lyrics
        </label>
        {profile.sourceFileName && (
          <span className="text-[10px] text-slate-500 truncate max-w-[240px]">{profile.sourceFileName}</span>
        )}
      </div>
    </div>
  );
}
