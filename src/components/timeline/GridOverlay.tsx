import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { getBeatDuration, getBarDuration } from '../../utils/time';
import { getGridDivision } from '../../features/arrangement/snap';

export function GridOverlay() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] : undefined,
  );

  if (!project) return null;

  const beatDuration = getBeatDuration(project.bpm);
  const barDuration = getBarDuration(project.bpm, project.timeSignature);
  const snapResolution = workspace?.settings.snapResolution ?? '1_4';
  const gridStep = beatDuration * getGridDivision(snapResolution);
  const totalWidth = project.totalDuration * pixelsPerSecond;

  const lines: { x: number; isBar: boolean }[] = [];
  for (let t = 0; t <= project.totalDuration; t += gridStep) {
    const isBar = Math.abs(t % barDuration) < 0.001 || Math.abs((t % barDuration) - barDuration) < 0.001;
    lines.push({ x: t * pixelsPerSecond, isBar });
  }

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ width: totalWidth }}>
      {lines.map((line, i) => (
        <div
          key={i}
          className={`absolute top-0 bottom-0 w-px ${
            line.isBar ? 'bg-daw-grid-bar' : 'bg-daw-grid-beat'
          }`}
          style={{ left: line.x }}
        />
      ))}
      {workspace?.sections
        .slice()
        .sort((a, b) => a.startTime - b.startTime)
        .map((section) => (
          <div
            key={section.id}
            className="absolute top-0 bottom-0 w-px bg-daw-accent/25"
            style={{ left: section.startTime * pixelsPerSecond }}
          />
        ))}
    </div>
  );
}
