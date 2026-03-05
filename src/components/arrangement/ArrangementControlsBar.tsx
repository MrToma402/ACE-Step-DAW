import type { ArrangementSettings } from '../../features/arrangement/types';

interface ArrangementControlsBarProps {
  settings: ArrangementSettings;
  onPatchSettings: (patch: Partial<ArrangementSettings>) => void;
  onGenerateAll: () => void;
  onPlayArrangement: () => void;
}

export function ArrangementControlsBar({
  settings,
  onPatchSettings,
  onGenerateAll,
  onPlayArrangement,
}: ArrangementControlsBarProps) {
  return (
    <div className="px-3 py-2 border-b border-daw-border flex items-center gap-2 flex-wrap">
      <div className="inline-flex rounded border border-daw-border overflow-hidden">
        <button
          onClick={() => onPatchSettings({ viewMode: 'track' })}
          className={`px-3 py-1 text-[10px] uppercase font-bold tracking-wider ${
            settings.viewMode === 'track' ? 'bg-daw-accent/15 text-daw-accent' : 'bg-black/20 text-slate-500'
          }`}
        >
          Track View
        </button>
        <button
          onClick={() => onPatchSettings({ viewMode: 'arrangement' })}
          className={`px-3 py-1 text-[10px] uppercase font-bold tracking-wider ${
            settings.viewMode === 'arrangement' ? 'bg-daw-accent/15 text-daw-accent' : 'bg-black/20 text-slate-500'
          }`}
        >
          Arrangement View
        </button>
      </div>

      <button
        onClick={onGenerateAll}
        className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider rounded bg-daw-accent hover:bg-daw-accent-hover text-white"
      >
        Generate All Sections
      </button>
      <button
        onClick={onPlayArrangement}
        className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider rounded border border-daw-border bg-black/20 hover:bg-white/5"
      >
        Play Arrangement
      </button>

      <label className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider border border-daw-border rounded bg-black/20 text-slate-400">
        <input
          type="checkbox"
          checked={settings.hideInactiveTakes}
          onChange={(e) => onPatchSettings({ hideInactiveTakes: e.target.checked })}
        />
        Hide Inactive Takes
      </label>
    </div>
  );
}
