import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { focusSection } from '../../features/arrangement/focusSection';

function sectionLabel(name: string): string {
  return name.length > 18 ? `${name.slice(0, 18)}...` : name;
}

export function SectionTimelineStrip() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] ?? null : null,
  );

  if (!project || !workspace || workspace.sections.length === 0) return null;

  const sortedSections = [...workspace.sections].sort((a, b) => a.startTime - b.startTime);
  const totalWidth = project.totalDuration * pixelsPerSecond;

  return (
    <div
      className="relative h-5 border-b border-daw-border/80 bg-black/15 overflow-hidden"
      style={{ width: totalWidth }}
    >
      {sortedSections.map((section, index) => {
        const sectionDuration = Math.max(0.1, section.endTime - section.startTime);
        const left = section.startTime * pixelsPerSecond;
        const width = sectionDuration * pixelsPerSecond;
        const tone = index % 2 === 0 ? 'bg-white/[0.02]' : 'bg-white/[0.01]';
        const isSelected = workspace.selectedSectionId === section.id;
        return (
          <button
            key={section.id}
            onClick={() => focusSection(project.id, section.id)}
            className={`absolute top-0 bottom-0 border-r border-white/8 ${tone} ${isSelected ? 'ring-1 ring-daw-accent/60 z-10' : ''}`}
            style={{ left, width }}
            title={`${section.name} (${section.startTime.toFixed(1)}s - ${section.endTime.toFixed(1)}s)`}
          >
            <div className="absolute left-1 top-1 text-[9px] uppercase tracking-[0.08em] text-slate-500 pointer-events-none">
              {sectionLabel(section.name)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
