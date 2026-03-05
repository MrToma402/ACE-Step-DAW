import type { SongSection, SectionGenerationPlan, StyleLockStrength } from '../../features/arrangement/types';
import type { Track } from '../../types/project';

interface SectionInspectorProps {
  section: SongSection | null;
  plan: SectionGenerationPlan | null;
  tracks: Track[];
  isRunning: boolean;
  warnings: string[];
  onPatchSection: (patch: Partial<SongSection>) => void;
  onPatchPlan: (patch: Partial<SectionGenerationPlan>) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onRemoveSection: () => void;
}

const KINDS: SongSection['kind'][] = ['intro', 'verse', 'pre_chorus', 'chorus', 'bridge', 'outro', 'custom'];
const STYLE_LOCKS: StyleLockStrength[] = ['soft', 'balanced', 'strict'];

export function SectionInspector({
  section,
  plan,
  tracks,
  isRunning,
  warnings,
  onPatchSection,
  onPatchPlan,
  onGenerate,
  onCancel,
  onRemoveSection,
}: SectionInspectorProps) {
  if (!section || !plan) {
    return (
      <div className="h-full border border-daw-border rounded bg-black/20 p-3 text-[11px] text-slate-500">
        Select a section to edit generation intent, lyrics, and take settings.
      </div>
    );
  }

  const duration = Math.max(0.1, section.endTime - section.startTime);

  return (
    <div className="border border-daw-border rounded bg-black/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-300">Section Inspector</h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPatchSection({ locked: !section.locked })}
            className="px-2 py-1 text-[10px] border border-daw-border rounded bg-black/20 hover:bg-white/5"
          >
            {section.locked ? 'Unlock' : 'Lock'}
          </button>
          <button
            onClick={onRemoveSection}
            className="px-2 py-1 text-[10px] border border-red-500/30 text-red-400 rounded bg-red-900/20 hover:bg-red-900/30"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        <input
          value={section.name}
          onChange={(e) => onPatchSection({ name: e.target.value })}
          className="col-span-2 px-2 py-1 text-[11px] bg-black/20 border border-daw-border rounded"
        />
        <select
          value={section.kind}
          onChange={(e) => onPatchSection({ kind: e.target.value as SongSection['kind'] })}
          className="px-2 py-1 text-[11px] bg-black/20 border border-daw-border rounded"
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>{kind.replace('_', ' ')}</option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          step={0.1}
          value={section.startTime}
          onChange={(e) => onPatchSection({ startTime: Number(e.target.value) || 0 })}
          className="px-2 py-1 text-[11px] bg-black/20 border border-daw-border rounded"
          title="Start (s)"
        />
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={section.endTime}
          onChange={(e) => onPatchSection({ endTime: Number(e.target.value) || section.endTime })}
          className="px-2 py-1 text-[11px] bg-black/20 border border-daw-border rounded"
          title="End (s)"
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={section.targetEnergy}
          onChange={(e) => onPatchSection({ targetEnergy: Number(e.target.value) || 0 })}
          className="px-2 py-1 text-[11px] bg-black/20 border border-daw-border rounded"
          title="Target energy"
        />
        <select
          value={plan.styleLock}
          onChange={(e) => onPatchPlan({ styleLock: e.target.value as StyleLockStrength })}
          className="px-2 py-1 text-[11px] bg-black/20 border border-daw-border rounded"
          title="Style lock"
        >
          {STYLE_LOCKS.map((lock) => (
            <option key={lock} value={lock}>{lock}</option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={5}
          step={1}
          value={plan.takesPerSection}
          onChange={(e) => onPatchPlan({ takesPerSection: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })}
          className="px-2 py-1 text-[11px] bg-black/20 border border-daw-border rounded"
          title="Takes"
        />
        <div className="px-2 py-1 text-[11px] border border-daw-border rounded bg-black/20 text-slate-500">
          {duration.toFixed(1)}s
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Enabled Tracks</div>
        <div className="flex flex-wrap gap-2">
          {tracks.map((track) => {
            const enabled = plan.enabledTrackIds.includes(track.id);
            return (
              <label key={track.id} className="flex items-center gap-1 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...plan.enabledTrackIds, track.id]
                      : plan.enabledTrackIds.filter((id) => id !== track.id);
                    onPatchPlan({ enabledTrackIds: next });
                  }}
                />
                {track.displayName}
              </label>
            );
          })}
        </div>
      </div>

      <textarea
        value={section.lyricBlock}
        onChange={(e) => onPatchSection({ lyricBlock: e.target.value })}
        placeholder="Lyrics block for this section"
        className="w-full h-20 px-2 py-1 text-[11px] bg-black/10 border border-daw-border rounded resize-none"
      />

      {warnings.length > 0 && (
        <div className="border border-amber-500/20 bg-amber-900/10 rounded p-2 space-y-1">
          {warnings.map((warning) => (
            <div key={warning} className="text-[10px] text-amber-300">{warning}</div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onGenerate}
          disabled={section.locked || isRunning}
          className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded bg-daw-accent hover:bg-daw-accent-hover text-white disabled:opacity-50"
        >
          {isRunning ? 'Generating...' : 'Generate Section'}
        </button>
        <button
          onClick={onCancel}
          disabled={!isRunning}
          className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded border border-daw-border bg-black/20 hover:bg-white/5 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
