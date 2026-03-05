import { useProjectStore } from '../../store/projectStore';
import { TrackHeader } from './TrackHeader';
import { AddTrackButton } from './AddTrackButton';

export function TrackList() {
  const project = useProjectStore((s) => s.project);

  if (!project) return null;

  const sortedTracks = [...project.tracks].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col w-full h-full bg-daw-panel border-r border-daw-border z-10 shadow-sm shrink-0">
      {/* Header spacer aligned with TimeRuler */}
      <div className="h-8 border-b border-daw-border" />

      <div className="flex-1 overflow-y-auto">
        {sortedTracks.map((track) => (
          <TrackHeader key={track.id} track={track} />
        ))}
      </div>

      <AddTrackButton />
    </div>
  );
}
