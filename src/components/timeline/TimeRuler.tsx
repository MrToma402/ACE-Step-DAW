import { memo, useCallback, useMemo, useRef, type MouseEvent } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useTransportStore } from '../../store/transportStore';
import { useTransport } from '../../hooks/useTransport';
import { getBarDuration } from '../../utils/time';
import { getSelectionLoopRange } from '../../features/transport/selectionLoopRange';

interface RulerMarker {
  key: string;
  x: number;
  label: string | null;
  major: boolean;
}

interface RulerMarkersLayerProps {
  markers: RulerMarker[];
}

const RulerMarkersLayer = memo(function RulerMarkersLayer({ markers }: RulerMarkersLayerProps) {
  return (
    <>
      {markers.map((marker) => (
        <div
          key={marker.key}
          className="absolute top-0 h-full flex items-end pb-1.5 pointer-events-none"
          style={{ left: marker.x }}
        >
          {marker.major ? (
            <>
              <div className="w-px h-3 bg-white/10 mr-1" />
              <span className="text-[9px] font-bold text-slate-600">{marker.label}</span>
            </>
          ) : (
            <div className="w-px h-1.5 bg-white/5" />
          )}
        </div>
      ))}
    </>
  );
});

interface RulerPlayheadProps {
  totalWidth: number;
  pixelsPerSecond: number;
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
}

const RulerPlayhead = memo(function RulerPlayhead({
  totalWidth,
  pixelsPerSecond,
  onMouseDown,
}: RulerPlayheadProps) {
  const currentTime = useTransportStore((s) => s.currentTime);
  const playheadX = Math.max(0, Math.min(currentTime * pixelsPerSecond, totalWidth));

  return (
    <>
      <div className="absolute inset-y-0 pointer-events-none z-20" style={{ left: playheadX }}>
        <div className="absolute inset-y-0 w-px -translate-x-1/2 bg-daw-accent" />
      </div>
      <button
        type="button"
        onMouseDown={onMouseDown}
        className="absolute top-0 h-8 w-4 -translate-x-1/2 z-30 flex items-start justify-center cursor-ew-resize text-daw-accent"
        style={{ left: playheadX }}
        aria-label="Drag playhead"
      >
        <span className="material-symbols-outlined text-base leading-none">arrow_drop_down</span>
      </button>
    </>
  );
});

function buildSecondMarkers(totalDuration: number, pixelsPerSecond: number): RulerMarker[] {
  const secondStep = totalDuration > 120 ? 5 : 1;
  return Array.from(
    { length: Math.floor(totalDuration / secondStep) + 1 },
    (_, idx) => idx * secondStep,
  ).map((second) => ({
    key: `sec-${second}`,
    x: second * pixelsPerSecond,
    label: `${second}s`,
    major: true,
  }));
}

function buildBarBeatMarkers(
  totalDuration: number,
  bpm: number,
  timeSignature: number,
  pixelsPerSecond: number,
): RulerMarker[] {
  const barDuration = getBarDuration(bpm, timeSignature);
  const totalBars = Math.ceil(totalDuration / barDuration);
  const beatDuration = barDuration / timeSignature;
  const markers: RulerMarker[] = [];
  for (let bar = 1; bar <= totalBars; bar++) {
    const barX = (bar - 1) * barDuration * pixelsPerSecond;
    markers.push({ key: `${bar}.1`, x: barX, label: `${bar}.1`, major: true });
    for (let beat = 2; beat <= timeSignature; beat++) {
      const beatX = barX + (beat - 1) * beatDuration * pixelsPerSecond;
      markers.push({ key: `${bar}.${beat}`, x: beatX, label: null, major: false });
    }
  }
  return markers;
}

export function TimeRuler() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const playbackScope = useTransportStore((s) => s.playbackScope);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] : undefined,
  );
  const displayMode = workspace?.settings.timeDisplayMode ?? 'bars_beats';
  const { seek } = useTransport();
  const rulerRef = useRef<HTMLDivElement>(null);

  const seekFromClientX = useCallback((clientX: number) => {
    if (!project || project.totalDuration <= 0) return;
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const time = Math.max(0, Math.min(x / pixelsPerSecond, project.totalDuration));
    seek(time);
  }, [project, pixelsPerSecond, seek]);

  const handleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    seekFromClientX(event.clientX);
  }, [seekFromClientX]);

  const handlePlayheadMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    seekFromClientX(event.clientX);
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

  if (!project) return <div className="h-8 bg-daw-panel border-b border-daw-border" />;

  const { totalDuration } = project;
  const totalWidth = totalDuration * pixelsPerSecond;
  const markers = useMemo(() => (
    displayMode === 'seconds'
      ? buildSecondMarkers(totalDuration, pixelsPerSecond)
      : buildBarBeatMarkers(totalDuration, project.bpm, project.timeSignature, pixelsPerSecond)
  ), [displayMode, totalDuration, pixelsPerSecond, project.bpm, project.timeSignature]);
  const selectionLoopRange = getSelectionLoopRange(playbackScope, project);
  const selectionLoopRangePx = useMemo(() => {
    if (!selectionLoopRange) return null;
    const startPx = Math.max(0, Math.min(selectionLoopRange.start * pixelsPerSecond, totalWidth));
    const endPx = Math.max(startPx, Math.min(selectionLoopRange.end * pixelsPerSecond, totalWidth));
    return {
      left: startPx,
      width: Math.max(2, endPx - startPx),
    };
  }, [pixelsPerSecond, selectionLoopRange, totalWidth]);

  return (
    <div
      ref={rulerRef}
      className="relative h-8 bg-daw-panel border-b border-daw-border overflow-hidden select-none cursor-pointer"
      style={{ width: totalWidth }}
      onClick={handleClick}
    >
      {selectionLoopRangePx && (
        <div
          className="absolute top-0 h-full bg-emerald-400/10 border-x border-emerald-300/60 pointer-events-none z-10"
          style={{
            left: selectionLoopRangePx.left,
            width: selectionLoopRangePx.width,
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-300/80" />
          <div className="absolute top-[2px] left-1 text-[8px] font-bold uppercase tracking-wider text-emerald-200/90">
            Loop
          </div>
        </div>
      )}
      <RulerMarkersLayer markers={markers} />
      <RulerPlayhead
        totalWidth={totalWidth}
        pixelsPerSecond={pixelsPerSecond}
        onMouseDown={handlePlayheadMouseDown}
      />
    </div>
  );
}
