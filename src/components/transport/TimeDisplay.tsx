import { useCallback, useRef, type MouseEvent } from 'react';
import { useTransportStore } from '../../store/transportStore';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useTransport } from '../../hooks/useTransport';
import { formatTime, formatBarsBeats } from '../../utils/time';

export function TimeDisplay() {
  const currentTime = useTransportStore((s) => s.currentTime);
  const project = useProjectStore((s) => s.project);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] : undefined,
  );
  const displayMode = workspace?.settings.timeDisplayMode ?? 'bars_beats';
  const { seek } = useTransport();
  const scrubberRef = useRef<HTMLDivElement>(null);
  const totalDuration = project?.totalDuration ?? 0;
  const clampedTime = Math.max(0, Math.min(currentTime, totalDuration || 0));
  const playheadRatio = totalDuration > 0 ? clampedTime / totalDuration : 0;

  const barsBeats = project
    ? formatBarsBeats(currentTime, project.bpm, project.timeSignature)
    : '1.1.00';

  const seekFromClientX = useCallback((clientX: number) => {
    if (!project || totalDuration <= 0) return;
    const rect = scrubberRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const nextTime = (x / rect.width) * totalDuration;
    seek(Math.max(0, Math.min(nextTime, totalDuration)));
  }, [project, seek, totalDuration]);

  const beginScrub = useCallback((clientX: number) => {
    seekFromClientX(clientX);
    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      moveEvent.preventDefault();
      seekFromClientX(moveEvent.clientX);
    };
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [seekFromClientX]);

  const handleTrackMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    beginScrub(event.clientX);
  }, [beginScrub]);

  const handleKnobMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    beginScrub(event.clientX);
  }, [beginScrub]);

  return (
    <div className="flex items-center gap-2">
      <div className="text-lg font-bold tracking-wider tabular-nums">
        {displayMode === 'seconds' ? formatTime(currentTime) : barsBeats}
      </div>
      {project && (
        <div
          ref={scrubberRef}
          onMouseDown={handleTrackMouseDown}
          className="relative ml-3 w-32 h-5 shrink-0 cursor-ew-resize overflow-visible z-20"
          title="Drag playhead"
        >
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-white/15 border border-white/10" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-daw-accent/40 pointer-events-none"
            style={{ width: `${playheadRatio * 100}%` }}
          />
          <button
            type="button"
            onMouseDown={handleKnobMouseDown}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border border-white/80 bg-daw-accent shadow-[0_0_8px_rgba(59,130,246,0.9)] z-30"
            style={{ left: `${playheadRatio * 100}%` }}
            aria-label="Playhead"
          />
        </div>
      )}
    </div>
  );
}
