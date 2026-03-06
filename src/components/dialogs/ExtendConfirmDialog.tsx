import { useGeneration } from '../../hooks/useGeneration';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';

const EXTEND_EPSILON_SECONDS = 0.05;

export function ExtendConfirmDialog() {
  const request = useUIStore((s) => s.extendConfirmRequest);
  const closeDialog = useUIStore((s) => s.closeExtendConfirmDialog);
  const getClipById = useProjectStore((s) => s.getClipById);
  const updateClip = useProjectStore((s) => s.updateClip);
  const addClip = useProjectStore((s) => s.addClip);
  const { generateClipWithSourceContext, isGenerating } = useGeneration();

  if (!request) return null;

  const sourceClip = getClipById(request.clipId);

  const restoreBaseClip = () => {
    updateClip(request.clipId, {
      duration: request.baseDuration,
      generationStatus: request.originalGenerationStatus,
    });
  };

  const handleCancel = () => {
    restoreBaseClip();
    closeDialog();
  };

  const handleConfirm = () => {
    restoreBaseClip();

    if (sourceClip && request.extensionDuration > EXTEND_EPSILON_SECONDS) {
      const continuationClip = addClip(request.trackId, {
        startTime: request.baseStartTime + request.baseDuration,
        duration: request.extensionDuration,
        prompt: sourceClip.prompt,
        lyrics: sourceClip.lyrics,
        arrangementSectionId: sourceClip.arrangementSectionId,
        arrangementTakeId: sourceClip.arrangementTakeId,
      });

      updateClip(continuationClip.id, {
        bpm: sourceClip.bpm,
        keyScale: sourceClip.keyScale,
        timeSignature: sourceClip.timeSignature,
        sampleMode: sourceClip.sampleMode,
        autoExpandPrompt: sourceClip.autoExpandPrompt,
      });

      closeDialog();
      void generateClipWithSourceContext(continuationClip.id, request.clipId);
      return;
    }

    closeDialog();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[420px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Extend Track</h2>
          <button
            onClick={handleCancel}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-zinc-300">
            Generate a new continuation clip for the extended section?
          </p>
          <p className="text-[11px] text-zinc-500">
            The existing waveform stays unchanged; only the new right-side extension will be generated.
          </p>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-daw-border gap-2">
          <button
            onClick={handleCancel}
            className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isGenerating}
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Extend'}
          </button>
        </div>
      </div>
    </div>
  );
}
