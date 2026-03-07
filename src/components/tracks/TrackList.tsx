import { useCallback, useState, type MutableRefObject, type UIEvent } from 'react';
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
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] ?? null : null,
  );
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);

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
  const clearDragState = useCallback(() => {
    setDraggedTrackId(null);
    setDropTargetTrackId(null);
  }, []);
  const handleDragStartTrack = useCallback((trackId: string) => {
    setDraggedTrackId(trackId);
    setDropTargetTrackId(null);
  }, []);
  const handleDragOverTrack = useCallback((trackId: string) => {
    setDropTargetTrackId(trackId);
  }, []);
  const handleDropTrack = useCallback((targetTrackId: string) => {
    if (draggedTrackId && draggedTrackId !== targetTrackId) {
      reorderTrack(draggedTrackId, targetTrackId);
    }
    clearDragState();
  }, [clearDragState, draggedTrackId, reorderTrack]);

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
          <TrackHeader
            key={track.id}
            track={track}
            isDragging={draggedTrackId === track.id}
            isDropTarget={dropTargetTrackId === track.id && draggedTrackId !== track.id}
            onDragStartTrack={handleDragStartTrack}
            onDragOverTrack={handleDragOverTrack}
            onDropTrack={handleDropTrack}
            onDragEndTrack={clearDragState}
          />
        ))}
      </div>

      <AddTrackButton />
    </div>
  );
}
