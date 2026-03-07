import { useCallback, type MutableRefObject, type UIEvent } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { TrackHeader } from './TrackHeader';
import { AddTrackButton } from './AddTrackButton';

interface TrackListProps {
  scrollBodyRef?: MutableRefObject<HTMLDivElement | null>;
  onVerticalScroll?: (scrollTop: number) => void;
}

export function TrackList({ scrollBodyRef, onVerticalScroll }: TrackListProps) {
  const project = useProjectStore((s) => s.project);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] ?? null : null,
  );

  if (!project) return null;

  const sortedTracks = [...project.tracks].sort((a, b) => a.order - b.order);
  const hasSectionStrip = (workspace?.sections.length ?? 0) > 0;
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    if (!scrollBodyRef) return;
    scrollBodyRef.current = node;
  }, [scrollBodyRef]);
  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    onVerticalScroll?.(event.currentTarget.scrollTop);
  }, [onVerticalScroll]);

  return (
    <div className="flex flex-col w-full h-full bg-daw-panel border-r border-daw-border z-10 shadow-sm shrink-0">
      {/* Header spacer aligned with TimeRuler */}
      <div className={`${hasSectionStrip ? 'h-[52px]' : 'h-8'} border-b border-daw-border`} />

      <div
        ref={setScrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {sortedTracks.map((track) => (
          <TrackHeader key={track.id} track={track} />
        ))}
      </div>

      <AddTrackButton />
    </div>
  );
}
