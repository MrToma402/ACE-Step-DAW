import { useCallback, useState } from 'react';
import type { Clip, Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useGenerationStore } from '../../store/generationStore';
import { useGeneration } from '../../hooks/useGeneration';
import { hexToRgba } from '../../utils/color';
import { isArrangementClipSelected } from '../../features/arrangement/selection';
import { useExtractToTracksDialog } from '../../hooks/useExtractToTracksDialog';
import { ClipContextMenu } from './clip-block/ClipContextMenu';
import { ClipVisualBody } from './clip-block/ClipVisualBody';
import { useClipVisualState } from './clip-block/useClipVisualState';
import { useClipDragBehavior } from './clip-block/useClipDragBehavior';

interface ClipBlockProps {
  clip: Clip;
  track: Track;
}

export function ClipBlock({ clip, track }: ClipBlockProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const selectClip = useUIStore((s) => s.selectClip);
  const deselectAll = useUIStore((s) => s.deselectAll);
  const setEditingClip = useUIStore((s) => s.setEditingClip);
  const setDraftClipId = useUIStore((s) => s.setDraftClipId);
  const clipDragPreview = useUIStore((s) => s.clipDragPreview);
  const setClipDragPreview = useUIStore((s) => s.setClipDragPreview);
  const setClipGestureActive = useUIStore((s) => s.setClipGestureActive);
  const isRepaintModeActive = useUIStore((s) => s.isRepaintModeActive);
  const setRepaintModeActive = useUIStore((s) => s.setRepaintModeActive);
  const openRepaintDialog = useUIStore((s) => s.openRepaintDialog);
  const openCoverDialog = useUIStore((s) => s.openCoverDialog);
  const openExtendConfirmDialog = useUIStore((s) => s.openExtendConfirmDialog);
  const updateClip = useProjectStore((s) => s.updateClip);
  const moveClipToTrack = useProjectStore((s) => s.moveClipToTrack);
  const addTrack = useProjectStore((s) => s.addTrack);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const mergeClips = useProjectStore((s) => s.mergeClips);
  const getClipById = useProjectStore((s) => s.getClipById);
  const getTrackForClip = useProjectStore((s) => s.getTrackForClip);
  const generationJobs = useGenerationStore((s) => s.jobs);
  const project = useProjectStore((s) => s.project);
  const workspace = useArrangementStore((s) =>
    project ? s.workspacesByProjectId[project.id] : undefined,
  );
  const { generateClip } = useGeneration();
  const snapEnabled = workspace?.settings.snapEnabled ?? true;
  const snapResolution = workspace?.settings.snapResolution ?? '1_4';

  const arrangementSelected = isArrangementClipSelected(clip, workspace ?? null);
  const isArrangementClip = Boolean(clip.arrangementSectionId && clip.arrangementTakeId);
  const hideInactiveTakes = workspace?.settings.hideInactiveTakes ?? false;

  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;
  const isSelected = selectedClipIds.has(clip.id);
  const isDraggingThisClip = clipDragPreview?.clipId === clip.id;

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const {
    canExtract,
    openConfirmDialog: openExtractDialog,
  } = useExtractToTracksDialog({
    sourceTrackId: track.id,
    sourceClipId: clip.id,
    sourceLabel: `clip on "${track.displayName}"`,
  });

  const {
    dragRef,
    repaintSelectionPx,
    handleMouseDown,
    handleMouseMoveLocal,
  } = useClipDragBehavior({
    clip,
    track,
    project,
    isSelected,
    selectedClipIds,
    pixelsPerSecond,
    isRepaintModeActive,
    snapEnabled,
    snapResolution,
    selectClip,
    updateClip,
    moveClipToTrack,
    getClipById,
    setClipDragPreview,
    setClipGestureActive,
    openExtendConfirmDialog,
    openRepaintDialog,
    setRepaintModeActive,
  });

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current) return;
    setCtxMenu(null);
    selectClip(clip.id, e.metaKey || e.ctrlKey);
  }, [clip.id, selectClip]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftClipId(null);
    setEditingClip(clip.id);
  }, [clip.id, setDraftClipId, setEditingClip]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);
  const canMergeSelected = selectedClipIds.size >= 2 && selectedClipIds.has(clip.id);
  const canDeleteSelected = selectedClipIds.size >= 2 && selectedClipIds.has(clip.id);
  const deleteLabel = canDeleteSelected ? `Delete Selected (${selectedClipIds.size})` : 'Delete';
  const handleDelete = useCallback(() => {
    closeCtxMenu();
    const ids = canDeleteSelected ? Array.from(selectedClipIds) : [clip.id];
    for (const clipId of ids) {
      removeClip(clipId);
    }
    deselectAll();
  }, [canDeleteSelected, clip.id, closeCtxMenu, deselectAll, removeClip, selectedClipIds]);
  const handleMergeSelected = useCallback(() => {
    if (!canMergeSelected) return;
    closeCtxMenu();
    const selectedIds = Array.from(selectedClipIds);
    void (async () => {
      const { clip: mergedClip, reason } = await mergeClips(selectedIds);
      if (mergedClip) {
        selectClip(mergedClip.id, false);
        return;
      }
      if (reason && typeof window !== 'undefined') {
        window.alert(reason);
      }
    })();
  }, [canMergeSelected, closeCtxMenu, mergeClips, selectClip, selectedClipIds]);
  const handleDuplicateToNewLayer = useCallback(() => {
    const sourceClip = getClipById(clip.id);
    if (!sourceClip) return;
    const sourceTrack = getTrackForClip(clip.id);
    const duplicatedClip = duplicateClip(clip.id);
    if (!duplicatedClip) return;
    const layerTrack = addTrack(sourceTrack?.trackName ?? 'custom');
    moveClipToTrack(duplicatedClip.id, layerTrack.id, { startTime: sourceClip.startTime });
  }, [addTrack, clip.id, duplicateClip, getClipById, getTrackForClip, moveClipToTrack]);
  const handleExtractToTracks = useCallback(() => {
    closeCtxMenu();
    setDraftClipId(null);
    setEditingClip(null);
    openExtractDialog();
  }, [closeCtxMenu, openExtractDialog, setDraftClipId, setEditingClip]);
  const handlePlayInIsolation = useCallback(() => {
    closeCtxMenu();
    const clipIds =
      selectedClipIds.size > 0 && selectedClipIds.has(clip.id)
        ? Array.from(selectedClipIds)
        : [clip.id];
    window.dispatchEvent(
      new CustomEvent('daw:play-selected-isolation', { detail: { clipIds } }),
    );
  }, [clip.id, closeCtxMenu, selectedClipIds]);

  const {
    clipStatusClass,
    shouldShowWaveform,
    numBars,
    waveformWidthPx,
    waveformBars,
    extensionWidthPx,
    activeJobRepaintRegionPx,
    compactStatusLabel,
    repaintSelectionMeta,
  } = useClipVisualState({
    clip,
    generationJobs,
    pixelsPerSecond,
    repaintSelectionPx,
  });

  return (
    <>
      <div
        data-clip-id={clip.id}
        className={`absolute top-1 bottom-1 rounded select-none overflow-hidden border border-white/10
          ${clipStatusClass}
          ${arrangementSelected || hideInactiveTakes ? '' : 'opacity-40'}
          ${isSelected ? 'ring-1 ring-daw-accent ring-offset-1 ring-offset-transparent' : ''}
          ${isHovered ? 'ring-1 ring-amber-400/60' : ''}
          ${isDraggingThisClip ? 'opacity-50' : ''}
        `}
        style={{
          left,
          width: Math.max(width, 4),
          backgroundColor: hexToRgba(track.color, 0.15),
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMoveLocal}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={handleContextMenu}
      >
        {/* Resize handles */}
        <div className="absolute top-0 bottom-0 left-0 w-[6px] cursor-col-resize z-10" />
        <div className="absolute top-0 bottom-0 right-0 w-[6px] cursor-col-resize z-10" />

        <ClipVisualBody
          clip={clip}
          trackColor={track.color}
          shouldShowWaveform={shouldShowWaveform}
          numBars={numBars}
          waveformWidthPx={waveformWidthPx}
          waveformBars={waveformBars}
          extensionWidthPx={extensionWidthPx}
          repaintSelectionPx={repaintSelectionPx}
          repaintSelectionMeta={repaintSelectionMeta}
          isArrangementClip={isArrangementClip}
          arrangementSelected={arrangementSelected}
          activeJobRepaintRegionPx={activeJobRepaintRegionPx}
          compactStatusLabel={compactStatusLabel}
        />
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ClipContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={() => { closeCtxMenu(); setDraftClipId(null); setEditingClip(clip.id); }}
          onGenerate={() => { closeCtxMenu(); generateClip(clip.id); }}
          onPlayInIsolation={handlePlayInIsolation}
          onCover={() => { closeCtxMenu(); openCoverDialog({ clipId: clip.id, referenceClipId: clip.id }); }}
          onDuplicate={() => { closeCtxMenu(); duplicateClip(clip.id); }}
          onDuplicateToNewLayer={() => { closeCtxMenu(); handleDuplicateToNewLayer(); }}
          onExtractToTracks={handleExtractToTracks}
          canExtractToTracks={canExtract}
          onMergeSelected={handleMergeSelected}
          canMergeSelected={canMergeSelected}
          onDelete={handleDelete}
          deleteLabel={deleteLabel}
          onClose={closeCtxMenu}
          hasPrompt={!!clip.prompt}
          hasReferenceAudio={!!clip.isolatedAudioKey}
        />
      )}
    </>
  );
}
