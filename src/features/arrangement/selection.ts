import type { Clip } from '../../types/project';
import type { ArrangementWorkspace } from './types';

export function isArrangementClipSelected(clip: Clip, workspace: ArrangementWorkspace | null): boolean {
  if (!clip.arrangementSectionId || !clip.arrangementTakeId) return true;
  if (!workspace) return false;
  const selectedTakeId = workspace.selectedTakeBySectionId[clip.arrangementSectionId] ?? null;
  if (!selectedTakeId) return false;
  return selectedTakeId === clip.arrangementTakeId;
}
