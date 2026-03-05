import { useTransportStore } from '../../store/transportStore';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { formatTime, formatBarsBeats } from '../../utils/time';

export function TimeDisplay() {
  const currentTime = useTransportStore((s) => s.currentTime);
  const project = useProjectStore((s) => s.project);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] : undefined,
  );
  const displayMode = workspace?.settings.timeDisplayMode ?? 'bars_beats';

  const barsBeats = project
    ? formatBarsBeats(currentTime, project.bpm, project.timeSignature)
    : '1.1.00';

  return (
    <div className="text-lg font-bold tracking-wider tabular-nums">
      {displayMode === 'seconds' ? formatTime(currentTime) : barsBeats}
    </div>
  );
}
