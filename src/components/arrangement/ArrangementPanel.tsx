import { useEffect, useRef, useState } from 'react';
import { useTransport } from '../../hooks/useTransport';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { ArrangementRuler } from './ArrangementRuler';
import { SectionInspector } from './SectionInspector';
import { SectionTakeRail } from './SectionTakeRail';
import { VocalProductionPanel } from './VocalProductionPanel';
import { ArrangementControlsBar } from './ArrangementControlsBar';
import {
  buildBoundaryContinuityMeters,
  buildSectionContinuityWarnings,
} from './continuityWarnings';
import {
  cancelSectionGeneration,
  generateAllSections,
  generateSection,
  isSectionGenerationRunning,
} from '../../services/sectionGenerationPipeline';
import type { SectionGenerationPlan, SongSection } from '../../features/arrangement/types';
import { focusSection } from '../../features/arrangement/focusSection';

function sortSections(sections: SongSection[]): SongSection[] {
  return [...sections].sort((a, b) => a.startTime - b.startTime);
}

function defaultPlan(trackIds: string[]): SectionGenerationPlan {
  return { enabledTrackIds: [...trackIds], styleLock: 'balanced', takesPerSection: 3 };
}

export function ArrangementPanel() {
  const project = useProjectStore((s) => s.project);
  const getClipById = useProjectStore((s) => s.getClipById);
  const removeClip = useProjectStore((s) => s.removeClip);
  const { play, stop } = useTransport();
  const workspaceByProjectId = useArrangementStore((s) => s.workspacesByProjectId);
  const createSection = useArrangementStore((s) => s.createSection);
  const updateSection = useArrangementStore((s) => s.updateSection);
  const removeSection = useArrangementStore((s) => s.removeSection);
  const setSectionPlan = useArrangementStore((s) => s.setSectionGenerationPlan);
  const setTakeSelected = useArrangementStore((s) => s.setTakeSelected);
  const updateTake = useArrangementStore((s) => s.updateTake);
  const removeTake = useArrangementStore((s) => s.removeTake);
  const setSettings = useArrangementStore((s) => s.setSettings);
  const setVocalProfile = useArrangementStore((s) => s.setVocalProfile);
  const previewTimeoutRef = useRef<number | null>(null);
  const [previewingTakeId, setPreviewingTakeId] = useState<string | null>(null);

  if (!project) return null;
  const workspace = workspaceByProjectId[project.id] ?? null;
  if (!workspace) return null;

  const sections = sortSections(workspace.sections);
  const selectedSectionId = workspace.selectedSectionId;
  const selectedSection = selectedSectionId
    ? sections.find((section) => section.id === selectedSectionId) ?? null
    : null;
  const selectedPlan = selectedSection
    ? workspace.generationPlanBySectionId[selectedSection.id] ?? defaultPlan(project.tracks.map((track) => track.id))
    : null;

  useEffect(() => {
    if (!selectedSection || !selectedPlan) return;
    if (workspace.generationPlanBySectionId[selectedSection.id]) return;
    setSectionPlan(project.id, selectedSection.id, selectedPlan);
  }, [project.id, selectedPlan, selectedSection, setSectionPlan, workspace.generationPlanBySectionId]);

  const selectedTakes = selectedSection ? workspace.takesBySectionId[selectedSection.id] ?? [] : [];
  const selectedTakeId = selectedSection ? workspace.selectedTakeBySectionId[selectedSection.id] ?? null : null;
  const selectedTake = selectedTakeId ? selectedTakes.find((take) => take.id === selectedTakeId) ?? null : null;
  const warnings = !selectedSection || !selectedTake
    ? []
    : buildSectionContinuityWarnings(selectedSection, selectedTake, project, getClipById);
  const boundaryMeters = buildBoundaryContinuityMeters(
    sections,
    workspace.selectedTakeBySectionId,
    workspace.takesBySectionId,
    getClipById,
  );

  const patchSelectedSection = (patch: Partial<SongSection>) => {
    if (!selectedSection) return;
    const nextStart = Math.max(0, patch.startTime ?? selectedSection.startTime);
    const nextEnd = Math.max(nextStart + 0.1, patch.endTime ?? selectedSection.endTime);
    updateSection(project.id, selectedSection.id, { ...patch, startTime: nextStart, endTime: nextEnd });
  };

  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current != null) {
        window.clearTimeout(previewTimeoutRef.current);
      }
    };
  }, []);

  const previewTake = (takeId: string) => {
    if (!selectedSection) return;
    const previousTakeId = selectedTakeId;
    setTakeSelected(project.id, selectedSection.id, takeId);
    setPreviewingTakeId(takeId);
    stop();
    void play(selectedSection.startTime);

    if (previewTimeoutRef.current != null) {
      window.clearTimeout(previewTimeoutRef.current);
    }
    const sectionDurationMs = Math.max(200, (selectedSection.endTime - selectedSection.startTime) * 1000);
    previewTimeoutRef.current = window.setTimeout(() => {
      stop();
      setPreviewingTakeId(null);
      const currentWorkspace = useArrangementStore.getState().workspacesByProjectId[project.id];
      const currentSelectedTakeId = currentWorkspace?.selectedTakeBySectionId[selectedSection.id] ?? null;
      if (previousTakeId && currentSelectedTakeId === takeId) {
        setTakeSelected(project.id, selectedSection.id, previousTakeId);
      }
    }, sectionDurationMs);
  };

  return (
    <div className="border-t border-daw-border bg-daw-panel shrink-0">
      <ArrangementControlsBar
        settings={workspace.settings}
        onPatchSettings={(patch) => setSettings(project.id, patch)}
        onGenerateAll={() => generateAllSections()}
        onPlayArrangement={() => { stop(); play(0); }}
      />

      <ArrangementRuler
        totalDuration={project.totalDuration}
        sections={sections}
        selectedSectionId={selectedSectionId}
        onSelectSection={(sectionId) => focusSection(project.id, sectionId)}
        onAddSection={workspace.settings.viewMode === 'arrangement' ? () => createSection(project.id, 'custom') : undefined}
        compact={workspace.settings.viewMode === 'track'}
        boundaryMeters={boundaryMeters}
      />

      {workspace.settings.viewMode === 'track' ? (
        <div className="px-3 py-2 text-[11px] text-slate-500 border-b border-daw-border">
          Track view keeps clip workflow clean. Switch to Arrangement View to edit section plans and takes.
        </div>
      ) : (
        <>
          <VocalProductionPanel
            project={project}
            profile={workspace.vocalProfile}
            onPatch={(patch) => setVocalProfile(project.id, patch)}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-3">
            <SectionInspector
              section={selectedSection}
              plan={selectedPlan}
              tracks={project.tracks}
              isRunning={selectedSection ? isSectionGenerationRunning(selectedSection.id) : false}
              warnings={warnings}
              onPatchSection={patchSelectedSection}
              onPatchPlan={(patch) => selectedSection && setSectionPlan(project.id, selectedSection.id, patch)}
              onGenerate={() => selectedSection && void generateSection(selectedSection.id)}
              onCancel={() => selectedSection && cancelSectionGeneration(selectedSection.id)}
              onRemoveSection={() => selectedSection && removeSection(project.id, selectedSection.id)}
            />
            <div className="space-y-2">
              <h4 className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-300">Section Takes</h4>
              <SectionTakeRail
                takes={selectedTakes}
                selectedTakeId={selectedTakeId}
                previewingTakeId={previewingTakeId}
                onSelectTake={(takeId) => selectedSection && setTakeSelected(project.id, selectedSection.id, takeId)}
                onPreviewTake={previewTake}
                onDeleteTake={(takeId) => {
                  if (!selectedSection) return;
                  const take = selectedTakes.find((item) => item.id === takeId);
                  if (take) take.trackClipIds.forEach((clipId) => removeClip(clipId));
                  removeTake(project.id, selectedSection.id, takeId);
                }}
                onSetScore={(takeId, score) => selectedSection && updateTake(project.id, selectedSection.id, takeId, { score })}
                onSetNote={(takeId, note) => selectedSection && updateTake(project.id, selectedSection.id, takeId, { note })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
