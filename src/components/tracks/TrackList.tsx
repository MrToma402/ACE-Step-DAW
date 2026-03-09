import { useCallback, useRef, useState, type MutableRefObject, type UIEvent } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useUIStore } from '../../store/uiStore';
import { TrackHeader } from './TrackHeader';
import { AddTrackButton } from './AddTrackButton';

interface TrackListProps {
  scrollBodyRef?: MutableRefObject<HTMLDivElement | null>;
  onVerticalScroll?: (scrollTop: number) => void;
}

export function TrackList({ scrollBodyRef, onVerticalScroll }: TrackListProps) {
  const project = useProjectStore((s) => s.project);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  const reorderTrackBlock = useProjectStore((s) => s.reorderTrackBlock);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const selectTrack = useUIStore((s) => s.selectTrack);
  const setSelectedTracks = useUIStore((s) => s.setSelectedTracks);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] ?? null : null,
  );
  const [draggedTrackIds, setDraggedTrackIds] = useState<string[]>([]);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const listBodyRef = useRef<HTMLDivElement | null>(null);

  if (!project) return null;

  const sortedTracks = [...project.tracks].sort((a, b) => a.order - b.order);
  const hasSectionStrip = (workspace?.sections.length ?? 0) > 0;
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    listBodyRef.current = node;
    if (!scrollBodyRef) return;
    scrollBodyRef.current = node;
  }, [scrollBodyRef]);
  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    onVerticalScroll?.(event.currentTarget.scrollTop);
  }, [onVerticalScroll]);
  const clearDragState = useCallback(() => {
    setDraggedTrackIds([]);
    setDropTargetTrackId(null);
  }, []);
  const collectTrackIdsInVerticalRange = useCallback((startClientY: number, endClientY: number): string[] => {
    const container = listBodyRef.current;
    if (!container) return [];
    const minY = Math.min(startClientY, endClientY);
    const maxY = Math.max(startClientY, endClientY);
    const nodes = container.querySelectorAll<HTMLElement>('[data-track-header-id]');
    const selected: string[] = [];
    nodes.forEach((node) => {
      const trackId = node.dataset.trackHeaderId;
      if (!trackId) return;
      const rect = node.getBoundingClientRect();
      if (rect.bottom < minY || rect.top > maxY) return;
      selected.push(trackId);
    });
    return selected;
  }, []);
  const startTrackLasso = useCallback((startClientY: number, additive: boolean) => {
    const baseSelection = additive ? new Set(selectedTrackIds) : new Set<string>();

    const applySelection = (currentClientY: number) => {
      const inRangeIds = collectTrackIdsInVerticalRange(startClientY, currentClientY);
      if (additive) {
        const next = new Set(baseSelection);
        inRangeIds.forEach((id) => next.add(id));
        setSelectedTracks(next);
        return;
      }
      setSelectedTracks(inRangeIds);
    };

    const handleMouseMove = (event: MouseEvent) => {
      applySelection(event.clientY);
    };
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [collectTrackIdsInVerticalRange, selectedTrackIds, setSelectedTracks]);
  const handleDragStartTrack = useCallback((trackId: string) => {
    if (selectedTrackIds.size > 1 && selectedTrackIds.has(trackId)) {
      const orderedSelected = sortedTracks
        .filter((track) => selectedTrackIds.has(track.id))
        .map((track) => track.id);
      setDraggedTrackIds(orderedSelected);
    } else {
      setDraggedTrackIds([trackId]);
    }
    setDropTargetTrackId(null);
  }, [selectedTrackIds, sortedTracks]);
  const handleDragOverTrack = useCallback((trackId: string) => {
    setDropTargetTrackId(trackId);
  }, []);
  const handleDropTrack = useCallback((targetTrackId: string) => {
    if (draggedTrackIds.length === 1) {
      const [draggedTrackId] = draggedTrackIds;
      if (draggedTrackId && draggedTrackId !== targetTrackId) {
        reorderTrack(draggedTrackId, targetTrackId);
      }
    } else if (draggedTrackIds.length > 1) {
      reorderTrackBlock(draggedTrackIds, targetTrackId);
    }
    clearDragState();
  }, [clearDragState, draggedTrackIds, reorderTrack, reorderTrackBlock]);

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
            isSelected={selectedTrackIds.has(track.id)}
            isDragging={draggedTrackIds.includes(track.id)}
            isDropTarget={dropTargetTrackId === track.id && !draggedTrackIds.includes(track.id)}
            onSelectTrack={selectTrack}
            onStartTrackLasso={startTrackLasso}
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
