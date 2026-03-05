import type { SongSection } from '../../features/arrangement/types';
import type { ContinuityBoundaryMeter } from './continuityWarnings';

interface ArrangementRulerProps {
  totalDuration: number;
  sections: SongSection[];
  selectedSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
  onAddSection?: () => void;
  compact?: boolean;
  boundaryMeters?: ContinuityBoundaryMeter[];
}

function sectionStatusClass(status: SongSection['status']): string {
  if (status === 'running') return 'bg-daw-accent/10 border-daw-accent/50';
  if (status === 'succeeded') return 'bg-emerald-900/20 border-emerald-500/40';
  if (status === 'failed') return 'bg-red-900/20 border-red-500/40';
  if (status === 'canceled') return 'bg-zinc-800 border-zinc-600';
  return 'bg-black/20 border-daw-border';
}

export function ArrangementRuler({
  totalDuration,
  sections,
  selectedSectionId,
  onSelectSection,
  onAddSection,
  compact = false,
  boundaryMeters = [],
}: ArrangementRulerProps) {
  const boundaryBySectionId = Object.fromEntries(
    boundaryMeters.map((meter) => [meter.toSectionId, meter]),
  );

  return (
    <div className="px-3 pt-2 pb-1 border-b border-daw-border">
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-300">Song Structure</h3>
          {onAddSection && (
            <button
              onClick={onAddSection}
              className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider border border-daw-border rounded bg-black/20 hover:bg-white/5"
            >
              Add Section
            </button>
          )}
        </div>
      )}
      <div className={`flex ${compact ? 'h-10' : 'h-14'} rounded overflow-hidden border border-daw-border bg-black/10`}>
        {sections.map((section) => {
          const sectionDuration = Math.max(0.1, section.endTime - section.startTime);
          const widthPercent = (sectionDuration / Math.max(1, totalDuration)) * 100;
          const selected = selectedSectionId === section.id;
          const boundary = boundaryBySectionId[section.id] ?? null;
          const boundaryClass =
            boundary?.level === 'high'
              ? 'bg-emerald-400'
              : boundary?.level === 'medium'
                ? 'bg-amber-400'
                : boundary?.level === 'low'
                  ? 'bg-red-400'
                  : 'bg-transparent';
          return (
            <button
              key={section.id}
              onClick={() => onSelectSection(section.id)}
              style={{ width: `${widthPercent}%` }}
              className={`relative h-full px-2 text-left border-r border-black/40 transition-colors ${
                selected ? 'ring-1 ring-daw-accent z-10' : ''
              } ${sectionStatusClass(section.status)}`}
            >
              <div className="text-[10px] font-semibold text-slate-200 truncate">{section.name}</div>
              {!compact && (
                <>
                  <div className="text-[9px] text-slate-500 mt-0.5 truncate">{section.kind.replace('_', ' ')}</div>
                  <div className="text-[9px] text-slate-600 mt-0.5">
                    {section.startTime.toFixed(1)}s - {section.endTime.toFixed(1)}s
                  </div>
                </>
              )}
              {section.locked && (
                <span className="absolute top-1 right-1 text-[9px] text-slate-400">LOCK</span>
              )}
              {boundary && (
                <span
                  className={`absolute -left-[2px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${boundaryClass}`}
                  title={boundary.label}
                />
              )}
            </button>
          );
        })}
        {sections.length === 0 && (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">
            Add sections to build an arrangement.
          </div>
        )}
      </div>
    </div>
  );
}
