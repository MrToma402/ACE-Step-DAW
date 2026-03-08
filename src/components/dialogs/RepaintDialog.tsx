import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useGeneration } from '../../hooks/useGeneration';
import { normalizeSeconds } from '../../utils/time';

const MIN_REPAINT_DURATION_SECONDS = 0.1;

export function RepaintDialog() {
  const request = useUIStore((s) => s.repaintRequest);
  const closeRepaintDialog = useUIStore((s) => s.closeRepaintDialog);
  const getClipById = useProjectStore((s) => s.getClipById);
  const updateClip = useProjectStore((s) => s.updateClip);
  const { repaintClipRegion, isGenerating } = useGeneration();

  const clip = request ? getClipById(request.clipId) : null;
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (!request) return;
    const nextClip = getClipById(request.clipId);
    setPrompt(nextClip?.prompt ?? '');
  }, [request?.clipId, getClipById]);

  if (!request || !clip) return null;

  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + clip.duration;
  const boundedStart = Math.max(clipStart, Math.min(request.startTime, request.endTime));
  const boundedEnd = Math.min(clipEnd, Math.max(request.startTime, request.endTime));
  const repaintStart = normalizeSeconds(boundedStart, 3);
  const repaintEnd = normalizeSeconds(
    Math.min(clipEnd, Math.max(repaintStart + MIN_REPAINT_DURATION_SECONDS, boundedEnd)),
    3,
  );
  const repaintDuration = normalizeSeconds(repaintEnd - repaintStart, 3);

  const handleRepaint = () => {
    const trimmedPrompt = prompt.trim();
    updateClip(clip.id, { prompt: trimmedPrompt });
    closeRepaintDialog();
    void repaintClipRegion(clip.id, repaintStart, repaintEnd);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70">
      <div className="w-[500px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Repaint Region</h2>
          <button
            onClick={closeRepaintDialog}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-zinc-400">
            Selected range: <span className="text-zinc-200">{repaintStart.toFixed(2)}s - {repaintEnd.toFixed(2)}s</span>
            {' '}({repaintDuration.toFixed(2)}s)
          </p>
          <p className="text-[11px] text-zinc-500">
            Keep the prompt focused on what should change in this region.
          </p>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe how this selected part should be repainted..."
              rows={4}
              className="w-full px-3 py-2 text-sm bg-daw-bg border border-daw-border rounded resize-none focus:outline-none focus:border-daw-accent"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-daw-border">
          <button
            onClick={closeRepaintDialog}
            className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRepaint}
            disabled={!prompt.trim() || isGenerating}
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Repaint
          </button>
        </div>
      </div>
    </div>
  );
}
