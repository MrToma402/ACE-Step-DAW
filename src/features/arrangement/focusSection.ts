import { useArrangementStore } from '../../store/arrangementStore';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';

function selectClipIdsForSection(projectId: string, sectionId: string): string[] {
  const project = useProjectStore.getState().project;
  const workspace = useArrangementStore.getState().workspacesByProjectId[projectId];
  if (!project || !workspace) return [];
  const selectedTakeId = workspace.selectedTakeBySectionId[sectionId] ?? null;
  const selectedTake = (workspace.takesBySectionId[sectionId] ?? []).find(
    (take) => take.id === selectedTakeId,
  );
  if (selectedTake && selectedTake.trackClipIds.length > 0) {
    return selectedTake.trackClipIds;
  }

  const section = workspace.sections.find((item) => item.id === sectionId);
  if (!section) return [];
  const start = section.startTime;
  const end = section.endTime;
  return project.tracks.flatMap((track) =>
    track.clips
      .filter((clip) => clip.startTime < end && clip.startTime + clip.duration > start)
      .map((clip) => clip.id),
  );
}

export function focusSection(projectId: string, sectionId: string): void {
  const workspace = useArrangementStore.getState().workspacesByProjectId[projectId];
  if (!workspace) return;
  const section = workspace.sections.find((item) => item.id === sectionId);
  if (!section) return;

  const alreadySelected = workspace.selectedSectionId === sectionId;
  if (alreadySelected) {
    useArrangementStore.getState().selectSection(projectId, null);
    useTransportStore.getState().setLoopRegion(0, 0);
    useUIStore.setState({ selectedClipIds: new Set() });
    return;
  }

  useArrangementStore.getState().selectSection(projectId, sectionId);
  useTransportStore.getState().seek(section.startTime);
  useTransportStore.getState().setLoopRegion(section.startTime, section.endTime);

  const clipIds = selectClipIdsForSection(projectId, sectionId);
  useUIStore.setState({ selectedClipIds: new Set(clipIds) });
}
