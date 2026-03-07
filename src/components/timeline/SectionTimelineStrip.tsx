import { memo, useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useTransportStore } from '../../store/transportStore';
import { focusSection } from '../../features/arrangement/focusSection';
import { getSectionColorTone } from '../../features/arrangement/sectionColors';
import { clampSectionBoundaryTime } from '../../features/arrangement/sectionBoundary';

function sectionLabel(name: string): string {
  return name.length > 18 ? `${name.slice(0, 18)}...` : name;
}

interface SectionStripPlayheadProps {
  totalWidth: number;
  pixelsPerSecond: number;
}

const SectionStripPlayhead = memo(function SectionStripPlayhead({
  totalWidth,
  pixelsPerSecond,
}: SectionStripPlayheadProps) {
  const currentTime = useTransportStore((s) => s.currentTime);
  const playheadX = Math.max(0, Math.min(currentTime * pixelsPerSecond, totalWidth));

  return (
    <div
      className="absolute inset-y-0 z-20 pointer-events-none"
      style={{ left: playheadX }}
    >
      <div className="absolute inset-y-0 w-px -translate-x-1/2 bg-daw-accent/70" />
    </div>
  );
});

export function SectionTimelineStrip() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const updateSection = useArrangementStore((s) => s.updateSection);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] ?? null : null,
  );
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [activeBoundaryId, setActiveBoundaryId] = useState<string | null>(null);
  const totalDuration = project?.totalDuration ?? 0;
  const totalWidth = totalDuration * pixelsPerSecond;

  if (!project || !workspace || workspace.sections.length === 0) return null;

  const sortedSections = [...workspace.sections].sort((a, b) => a.startTime - b.startTime);
  const beginBoundaryDrag = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    leftSectionId: string,
    rightSectionId: string,
    leftSectionStart: number,
    rightSectionEnd: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const stripNode = stripRef.current;
    if (!stripNode) return;
    const boundaryId = `${leftSectionId}:${rightSectionId}`;
    setActiveBoundaryId(boundaryId);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const rect = stripNode.getBoundingClientRect();
      const nextTime = (moveEvent.clientX - rect.left) / pixelsPerSecond;
      const clampedBoundary = clampSectionBoundaryTime(
        nextTime,
        leftSectionStart,
        rightSectionEnd,
      );
      updateSection(project.id, leftSectionId, { endTime: clampedBoundary });
      updateSection(project.id, rightSectionId, { startTime: clampedBoundary });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setActiveBoundaryId(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [pixelsPerSecond, project.id, updateSection]);

  return (
    <div
      ref={stripRef}
      className="relative h-5 border-b border-daw-border/80 bg-black/15 overflow-hidden"
      style={{ width: totalWidth }}
    >
      {sortedSections.map((section, index) => {
        const sectionDuration = Math.max(0.1, section.endTime - section.startTime);
        const left = section.startTime * pixelsPerSecond;
        const width = sectionDuration * pixelsPerSecond;
        const tone = getSectionColorTone(section.id);
        const isSelected = workspace.selectedSectionId === section.id;
        const rightNeighbor = sortedSections[index + 1] ?? null;
        const hasRightNeighbor = rightNeighbor !== null;
        const boundaryId = hasRightNeighbor ? `${section.id}:${rightNeighbor.id}` : null;
        const isBoundaryActive = boundaryId !== null && activeBoundaryId === boundaryId;
        return (
          <button
            key={section.id}
            onClick={() => focusSection(project.id, section.id)}
            className={`absolute top-0 bottom-0 border-r ${isSelected ? 'ring-1 ring-daw-accent/60 z-10' : ''}`}
            style={{ left, width, backgroundColor: tone.fill, borderColor: tone.border }}
            title={`${section.name} (${section.startTime.toFixed(1)}s - ${section.endTime.toFixed(1)}s)`}
          >
            <div
              className="absolute left-1 top-1 text-[9px] uppercase tracking-[0.08em] pointer-events-none"
              style={{ color: tone.label }}
            >
              {sectionLabel(section.name)}
            </div>
            {hasRightNeighbor && (
              <div
                onMouseDown={(event) => beginBoundaryDrag(
                  event,
                  section.id,
                  rightNeighbor.id,
                  section.startTime,
                  rightNeighbor.endTime,
                )}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                className={`absolute top-0 -right-[2px] h-full w-1 cursor-ew-resize z-20 ${
                  isBoundaryActive ? 'bg-white/80' : 'bg-white/35 hover:bg-white/70'
                }`}
                title="Drag to resize adjacent sections"
                aria-label="Resize section boundary"
                role="separator"
                aria-orientation="vertical"
              />
            )}
          </button>
        );
      })}
      <SectionStripPlayhead totalWidth={totalWidth} pixelsPerSecond={pixelsPerSecond} />
    </div>
  );
}
