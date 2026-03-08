import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useGeneration } from '../../hooks/useGeneration';

const DEFAULT_COVER_STRENGTH = 0.7;

function clampCoverStrength(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_COVER_STRENGTH;
  return Math.max(0, Math.min(1, value));
}

export function CoverDialog() {
  const request = useUIStore((s) => s.coverRequest);
  const closeCoverDialog = useUIStore((s) => s.closeCoverDialog);
  const getClipById = useProjectStore((s) => s.getClipById);
  const getTrackForClip = useProjectStore((s) => s.getTrackForClip);
  const updateClip = useProjectStore((s) => s.updateClip);
  const { coverClipWithReference, isGenerating } = useGeneration();

  const targetClip = request ? getClipById(request.clipId) : null;
  const referenceClip = request ? getClipById(request.referenceClipId) : null;
  const targetTrack = request ? getTrackForClip(request.clipId) : null;
  const referenceTrack = request ? getTrackForClip(request.referenceClipId) : null;
  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [coverStrength, setCoverStrength] = useState(DEFAULT_COVER_STRENGTH);

  useEffect(() => {
    if (!request) return;
    const nextClip = getClipById(request.clipId);
    setPrompt(nextClip?.prompt ?? '');
    setLyrics(nextClip?.lyrics ?? '');
    setCoverStrength(DEFAULT_COVER_STRENGTH);
  }, [request?.clipId, getClipById]);

  if (!request || !targetClip || !referenceClip) return null;

  const targetLabel = targetTrack?.displayName ?? 'Target';
  const referenceLabel = referenceTrack?.displayName ?? 'Reference';
  const canSubmit = !!prompt.trim() && !!referenceClip.isolatedAudioKey && !isGenerating;

  const handleCover = () => {
    const trimmedPrompt = prompt.trim();
    const normalizedLyrics = lyrics;
    const normalizedStrength = clampCoverStrength(coverStrength);
    updateClip(targetClip.id, {
      prompt: trimmedPrompt,
      lyrics: normalizedLyrics,
    });
    closeCoverDialog();
    void coverClipWithReference(targetClip.id, referenceClip.id, {
      prompt: trimmedPrompt,
      lyrics: normalizedLyrics,
      coverStrength: normalizedStrength,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70">
      <div className="w-[520px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Cover Clip</h2>
          <button
            onClick={closeCoverDialog}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-zinc-400">
            Target: <span className="text-zinc-200">{targetLabel}</span>
            {' · '}
            Reference: <span className="text-zinc-200">{referenceLabel}</span>
          </p>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the style/timbre you want while preserving structure..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-daw-bg border border-daw-border rounded resize-none focus:outline-none focus:border-daw-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Lyrics (optional)</label>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Optional lyric changes for this cover..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-daw-bg border border-daw-border rounded resize-none focus:outline-none focus:border-daw-accent"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-zinc-400">Cover Strength</label>
              <span className="text-xs text-amber-400 font-mono">{coverStrength.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(coverStrength * 100)}
              onChange={(e) => setCoverStrength(clampCoverStrength(parseInt(e.target.value, 10) / 100))}
              className="w-full h-1 accent-amber-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Higher keeps structure closer to source. For variants, 0.55-0.75 usually works better.
            </p>
          </div>

          {!referenceClip.isolatedAudioKey && (
            <p className="text-[11px] text-red-400">
              This clip has no reference audio yet. Import or generate it first.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-daw-border">
          <button
            onClick={closeCoverDialog}
            className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCover}
            disabled={!canSubmit}
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cover
          </button>
        </div>
      </div>
    </div>
  );
}
