import { useRef, useState, useCallback, type MutableRefObject, type UIEvent } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TimeRuler } from './TimeRuler';
import { TrackLane } from './TrackLane';
import { Playhead } from './Playhead';
import { GridOverlay } from './GridOverlay';
import { SectionTimelineStrip } from './SectionTimelineStrip';

interface TimelineProps {
  scrollBodyRef?: MutableRefObject<HTMLDivElement | null>;
  onVerticalScroll?: (scrollTop: number) => void;
}

export function Timeline({ scrollBodyRef, onVerticalScroll }: TimelineProps) {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useUIStore((s) => s.setPixelsPerSecond);
  const isImportingAudio = useUIStore((s) => s.isImportingAudio);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lanesBodyRef = useRef<HTMLDivElement>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

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
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    if (scrollBodyRef) {
      scrollBodyRef.current = node;
    }
  }, [scrollBodyRef]);
  const handleVerticalScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    onVerticalScroll?.(event.currentTarget.scrollTop);
  }, [onVerticalScroll]);
  const collectTrackIdsInVerticalRange = useCallback((startClientY: number, endClientY: number): string[] => {
    const container = scrollRef.current;
    if (!container) return [];
    const minY = Math.min(startClientY, endClientY);
    const maxY = Math.max(startClientY, endClientY);
    const nodes = container.querySelectorAll<HTMLElement>('[data-track-lane-id]');
    const selected: string[] = [];
    nodes.forEach((node) => {
      const trackId = node.dataset.trackLaneId;
      if (!trackId) return;
      const rect = node.getBoundingClientRect();
      if (rect.bottom < minY || rect.top > maxY) return;
      selected.push(trackId);
    });
    return selected;
  }, []);
  const selectClipsInRect = useCallback((
    startClientY: number,
    currentClientY: number,
    startX: number,
    endX: number,
    scrollX: number,
    additive: boolean,
    baseSelectedClipIds: Set<string>,
  ): { selectedClipCount: number; selectedTrackCount: number } => {
    if (!project) return { selectedClipCount: 0, selectedTrackCount: 0 };
    const targetTrackIds = new Set(collectTrackIdsInVerticalRange(startClientY, currentClientY));
    const rangeStart = (Math.min(startX, endX) + scrollX) / pixelsPerSecond;
    const rangeEnd = (Math.max(startX, endX) + scrollX) / pixelsPerSecond;
    const clipIds: string[] = [];
    for (const track of project.tracks) {
      if (!targetTrackIds.has(track.id)) continue;
      for (const clip of track.clips) {
        if (clip.startTime < rangeEnd && (clip.startTime + clip.duration) > rangeStart) {
          clipIds.push(clip.id);
        }
      }
    }
    const nextSelected = additive
      ? new Set([...baseSelectedClipIds, ...clipIds])
      : new Set(clipIds);
    useUIStore.setState({
      selectedClipIds: nextSelected,
      selectedTrackIds: new Set(),
    });
    return { selectedClipCount: clipIds.length, selectedTrackCount: targetTrackIds.size };
  }, [collectTrackIdsInVerticalRange, pixelsPerSecond, project]);
  const updateMarqueeVisual = useCallback((
    startClientY: number,
    currentClientY: number,
    startX: number,
    endX: number,
  ) => {
    const lanesBody = lanesBodyRef.current;
    if (!lanesBody) return;
    const rect = lanesBody.getBoundingClientRect();
    const clampY = (value: number) => Math.max(0, Math.min(value, rect.height));
    const y1 = clampY(startClientY - rect.top);
    const y2 = clampY(currentClientY - rect.top);
    setMarqueeRect({
      left: Math.min(startX, endX),
      top: Math.min(y1, y2),
      width: Math.max(1, Math.abs(endX - startX)),
      height: Math.max(1, Math.abs(y2 - y1)),
    });
  }, []);
  const clearMarqueeVisual = useCallback(() => {
    setMarqueeRect(null);
  }, []);
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
        ref={setScrollRef}
        data-timeline-scroll-container="true"
        className="timeline-scroll relative flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto"
        onWheel={handleWheel}
        onScroll={handleVerticalScroll}
      >
        <div className="relative" style={{ width: totalWidth, minWidth: '100%' }}>
          <div className="sticky top-0 z-40">
            <TimeRuler />
            <SectionTimelineStrip />
          </div>

          <div className="relative" ref={lanesBodyRef}>
            <GridOverlay />
            <Playhead />
            {marqueeRect && (
              <div
                className="absolute pointer-events-none z-30 bg-daw-accent/15 border border-daw-accent/70 rounded-[2px]"
                style={{
                  left: marqueeRect.left,
                  top: marqueeRect.top,
                  width: marqueeRect.width,
                  height: marqueeRect.height,
                }}
              />
            )}

            {sortedTracks.map((track) => (
              <TrackLane
                key={track.id}
                track={track}
                onSelectClipsInRect={selectClipsInRect}
                onMarqueeVisualChange={updateMarqueeVisual}
                onMarqueeVisualEnd={clearMarqueeVisual}
              />
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
