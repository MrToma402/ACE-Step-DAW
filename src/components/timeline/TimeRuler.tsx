import { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useTransport } from '../../hooks/useTransport';
import { getBarDuration } from '../../utils/time';

export function TimeRuler() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] : undefined,
  );
  const displayMode = workspace?.settings.timeDisplayMode ?? 'bars_beats';
  const { seek } = useTransport();

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!project) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(x / pixelsPerSecond, project.totalDuration));
    seek(time);
  }, [project, pixelsPerSecond, seek]);

  if (!project) return <div className="h-8 bg-daw-panel border-b border-daw-border" />;

  const totalWidth = project.totalDuration * pixelsPerSecond;

  if (displayMode === 'seconds') {
    const secondStep = project.totalDuration > 120 ? 5 : 1;
    const seconds = Array.from(
      { length: Math.floor(project.totalDuration / secondStep) + 1 },
      (_, idx) => idx * secondStep,
    );
    return (
      <div
        className="relative h-8 bg-daw-panel border-b border-daw-border overflow-hidden select-none cursor-pointer"
        style={{ width: totalWidth }}
        onClick={handleClick}
      >
        {seconds.map((second) => (
          <div
            key={second}
            className="absolute top-0 h-full flex items-end pb-1.5 pointer-events-none"
            style={{ left: second * pixelsPerSecond }}
          >
            <div className="w-px h-3 bg-white/10 mr-1" />
            <span className="text-[9px] font-bold text-slate-600">{second}s</span>
          </div>
        ))}
      </div>
    );
  }

  const barDuration = getBarDuration(project.bpm, project.timeSignature);
  const totalBars = Math.ceil(project.totalDuration / barDuration);
  const beatDuration = barDuration / project.timeSignature;
  const markers: { bar: number; beat: number; x: number; isBeat: boolean }[] = [];
  for (let bar = 1; bar <= totalBars; bar++) {
    const barX = (bar - 1) * barDuration * pixelsPerSecond;
    markers.push({ bar, beat: 1, x: barX, isBeat: false });
    for (let beat = 2; beat <= project.timeSignature; beat++) {
      const beatX = barX + (beat - 1) * beatDuration * pixelsPerSecond;
      markers.push({ bar, beat, x: beatX, isBeat: true });
    }
  }

  return (
    <div
      className="relative h-8 bg-daw-panel border-b border-daw-border overflow-hidden select-none cursor-pointer"
      style={{ width: totalWidth }}
      onClick={handleClick}
    >
      {markers.map(({ bar, beat, x, isBeat }) => (
        <div
          key={`${bar}.${beat}`}
          className="absolute top-0 h-full flex items-end pb-1.5 pointer-events-none"
          style={{ left: x }}
        >
          {isBeat ? (
            <div className="w-px h-1.5 bg-white/5" />
          ) : (
            <>
              <div className="w-px h-3 bg-white/10 mr-1" />
              <span className="text-[9px] font-bold text-slate-600">{bar}.1</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
