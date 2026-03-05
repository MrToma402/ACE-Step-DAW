import type { SectionTake } from '../../features/arrangement/types';

interface SectionTakeRailProps {
  takes: SectionTake[];
  selectedTakeId: string | null;
  previewingTakeId: string | null;
  onSelectTake: (takeId: string) => void;
  onPreviewTake: (takeId: string) => void;
  onDeleteTake: (takeId: string) => void;
  onSetScore: (takeId: string, score: number | null) => void;
  onSetNote: (takeId: string, note: string) => void;
}

function renderStars(score: number | null): string {
  if (score == null) return '☆☆☆☆☆';
  const value = Math.max(0, Math.min(5, Math.round(score)));
  return `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`;
}

export function SectionTakeRail({
  takes,
  selectedTakeId,
  previewingTakeId,
  onSelectTake,
  onPreviewTake,
  onDeleteTake,
  onSetScore,
  onSetNote,
}: SectionTakeRailProps) {
  if (takes.length === 0) {
    return (
      <div className="text-[11px] text-slate-500 p-3 border border-daw-border rounded bg-black/20">
        No takes yet for this section.
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-56 overflow-auto pr-1">
      {takes.map((take, idx) => {
        const selected = selectedTakeId === take.id;
        return (
          <div
            key={take.id}
            className={`p-2 border rounded ${selected ? 'border-daw-accent bg-daw-accent/5' : 'border-daw-border bg-black/20'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold text-slate-300">Take {idx + 1}</div>
              <span className="text-[10px] text-slate-500 uppercase">{take.status}</span>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => onSelectTake(take.id)}
                className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider border border-daw-border rounded bg-black/20 hover:bg-white/5"
              >
                Use
              </button>
              <button
                onClick={() => onPreviewTake(take.id)}
                className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider border rounded ${
                  previewingTakeId === take.id
                    ? 'border-daw-accent text-daw-accent bg-daw-accent/10'
                    : 'border-daw-border bg-black/20 hover:bg-white/5'
                }`}
              >
                {previewingTakeId === take.id ? 'Playing' : 'Play'}
              </button>
              <button
                onClick={() => onDeleteTake(take.id)}
                className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider border border-red-500/30 text-red-400 rounded bg-red-900/20 hover:bg-red-900/30"
              >
                Delete
              </button>
              <select
                value={take.score == null ? '' : String(Math.round(take.score))}
                onChange={(e) => onSetScore(take.id, e.target.value ? Number(e.target.value) : null)}
                className="px-2 py-1 text-[10px] bg-black/20 border border-daw-border rounded"
              >
                <option value="">Rate</option>
                <option value="1">1 star</option>
                <option value="2">2 stars</option>
                <option value="3">3 stars</option>
                <option value="4">4 stars</option>
                <option value="5">5 stars</option>
              </select>
              <span className="text-[10px] text-amber-300">{renderStars(take.score)}</span>
            </div>

            <textarea
              value={take.note}
              onChange={(e) => onSetNote(take.id, e.target.value)}
              placeholder="Take notes"
              className="w-full h-14 px-2 py-1 text-[11px] bg-black/10 border border-daw-border rounded resize-none"
            />
          </div>
        );
      })}
    </div>
  );
}
