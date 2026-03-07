import { useRef, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TimeRuler } from './TimeRuler';
import { TrackLane } from './TrackLane';
import { Playhead } from './Playhead';
import { GridOverlay } from './GridOverlay';
import { SectionTimelineStrip } from './SectionTimelineStrip';

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useUIStore((s) => s.setPixelsPerSecond);
  const isImportingAudio = useUIStore((s) => s.isImportingAudio);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sortedTracks = project
    ? [...project.tracks].sort((a, b) => a.order - b.order)
    : [];

  const totalWidth = project ? project.totalDuration * pixelsPerSecond : 0;

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const ZOOM_LEVELS = [10, 25, 50, 100, 200, 500];
        const currentIdx = ZOOM_LEVELS.findIndex((z) => z >= pixelsPerSecond);
        if (e.deltaY < 0 && currentIdx < ZOOM_LEVELS.length - 1) {
          setPixelsPerSecond(ZOOM_LEVELS[currentIdx + 1]);
        } else if (e.deltaY > 0 && currentIdx > 0) {
          setPixelsPerSecond(ZOOM_LEVELS[currentIdx - 1]);
        }
      }
    },
    [pixelsPerSecond, setPixelsPerSecond],
  );

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Create a new project to get started
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-daw-bg">
      <div
        ref={scrollRef}
        data-timeline-scroll-container="true"
        className="timeline-scroll relative flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto"
        onWheel={handleWheel}
      >
        <div className="relative" style={{ width: totalWidth, minWidth: '100%' }}>
          <div className="sticky top-0 z-40">
            <TimeRuler />
            <SectionTimelineStrip />
          </div>

          <div className="relative">
            <GridOverlay />
            <Playhead />

            {sortedTracks.map((track) => (
              <TrackLane key={track.id} track={track} />
            ))}

            {sortedTracks.length === 0 && (
              <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
                Add a track to begin
              </div>
            )}
          </div>
        </div>
        {isImportingAudio && (
          <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-daw-border bg-black/70 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-300">
              <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              Importing audio
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
