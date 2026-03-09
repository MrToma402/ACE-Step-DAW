import { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useGeneration } from '../../hooks/useGeneration';
import { KEY_SCALES, TIME_SIGNATURES } from '../../constants/tracks';
import { normalizeSeconds } from '../../utils/time';
import { isDisposableDraftClip } from '../../features/generation/draftClipCleanup';
import type { ClipGenerationTaskType } from '../../types/project';

function isVocalTrackName(trackName: string): boolean {
  return trackName === 'vocals' || trackName === 'backing_vocals';
}

function isCompleteTrackName(trackName: string): boolean {
  return trackName === 'complete';
}

const DIT_MODEL_ALIASES: Record<string, string> = {
  turbo: 'acestep-v15-turbo',
  base: 'acestep-v15-base',
};

function normalizeDitModelValue(model: string | undefined | null): string | null {
  if (!model) return null;
  const raw = model.trim();
  if (!raw) return null;
  return DIT_MODEL_ALIASES[raw] ?? raw;
}

function getModelLabel(model: string | undefined | null): string {
  const normalized = normalizeDitModelValue(model);
  if (!normalized) return 'Unset';
  if (normalized === 'acestep-v15-turbo') return 'Turbo';
  if (normalized === 'acestep-v15-base') return 'Base';
  return normalized;
}

function isTurboDitModel(model: string | undefined | null): boolean {
  const normalized = normalizeDitModelValue(model);
  return normalized?.startsWith('acestep-v15-turbo') ?? false;
}

export function ClipPromptEditor() {
  const editingClipId = useUIStore((s) => s.editingClipId);
  const setEditingClip = useUIStore((s) => s.setEditingClip);
  const draftClipId = useUIStore((s) => s.draftClipId);
  const setDraftClipId = useUIStore((s) => s.setDraftClipId);
  const getClipById = useProjectStore((s) => s.getClipById);
  const updateClip = useProjectStore((s) => s.updateClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const project = useProjectStore((s) => s.project);
  const { generateClip, isGenerating } = useGeneration();

  const clip = editingClipId ? getClipById(editingClipId) : null;

  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [sampleMode, setSampleMode] = useState(false);
  const [autoExpandPrompt, setAutoExpandPrompt] = useState(true);
  const [generationTaskType, setGenerationTaskType] = useState<ClipGenerationTaskType>('lego');
  const [ditModel, setDitModel] = useState<string | null>(null);
  const [lockedSeed, setLockedSeed] = useState<string | null>(null);
  // 'auto' = ACE-Step infers, null = use project default, number = manual override
  const [overrideBpm, setOverrideBpm] = useState<number | 'auto' | null>(null);
  const [overrideKey, setOverrideKey] = useState<string | 'auto' | null>(null);
  const [overrideTimeSig, setOverrideTimeSig] = useState<number | 'auto' | null>(null);

  // Only reset form when switching to a different clip (not on every store update)
  useEffect(() => {
    if (clip) {
      setPrompt(clip.prompt);
      setLyrics(clip.lyrics);
      setStartTime(normalizeSeconds(clip.startTime, 3));
      setEndTime(normalizeSeconds(clip.startTime + clip.duration, 3));
      setSampleMode(clip.sampleMode ?? false);
      setAutoExpandPrompt(clip.autoExpandPrompt ?? true);
      setGenerationTaskType(clip.generationTaskType ?? 'lego');
      setDitModel(normalizeDitModelValue(clip.ditModel));
      setLockedSeed(clip.lockedSeed ?? null);
      setOverrideBpm(clip.bpm === undefined ? null : clip.bpm);
      setOverrideKey(clip.keyScale === undefined ? null : clip.keyScale);
      setOverrideTimeSig(clip.timeSignature === undefined ? null : clip.timeSignature);
    }
  }, [editingClipId]);

  if (!editingClipId || !clip || !project) return null;
  const clipTrack = project.tracks.find((track) => track.id === clip.trackId) ?? null;
  const clipTrackIsVocal = clipTrack ? isVocalTrackName(clipTrack.trackName) : false;
  const clipTrackIsComplete = clipTrack ? isCompleteTrackName(clipTrack.trackName) : false;
  const hasReadyVocalReference = project.tracks.some((track) =>
    isVocalTrackName(track.trackName)
    && track.clips.some((candidate) => candidate.generationStatus === 'ready' && Boolean(candidate.isolatedAudioKey)),
  );

  const normalizedStart = normalizeSeconds(Math.max(0, startTime), 3);
  const normalizedEnd = normalizeSeconds(Math.max(normalizedStart + 0.5, endTime), 3);
  const normalizedDuration = normalizeSeconds(normalizedEnd - normalizedStart, 3);

  const handleSave = () => {
    updateClip(editingClipId, {
      prompt,
      lyrics,
      startTime: normalizedStart,
      duration: normalizedDuration,
      bpm: overrideBpm,
      keyScale: overrideKey,
      timeSignature: overrideTimeSig,
      sampleMode,
      autoExpandPrompt,
      generationTaskType: clipTrackIsVocal ? 'lego' : (clipTrackIsComplete ? 'complete' : generationTaskType),
      ditModel,
      lockedSeed,
    });
    setDraftClipId(null);
    setEditingClip(null);
  };

  const handleGenerate = () => {
    updateClip(editingClipId, {
      prompt,
      lyrics,
      startTime: normalizedStart,
      duration: normalizedDuration,
      bpm: overrideBpm,
      keyScale: overrideKey,
      timeSignature: overrideTimeSig,
      sampleMode,
      autoExpandPrompt,
      generationTaskType: clipTrackIsVocal ? 'lego' : (clipTrackIsComplete ? 'complete' : generationTaskType),
      ditModel,
      lockedSeed,
    });
    setDraftClipId(null);
    setEditingClip(null);
    generateClip(editingClipId);
  };

  const handleDelete = () => {
    setDraftClipId(null);
    removeClip(editingClipId);
    setEditingClip(null);
  };

  const handleClose = () => {
    const shouldRemoveDraft =
      draftClipId === editingClipId
      && isDisposableDraftClip(clip);
    if (shouldRemoveDraft) {
      removeClip(editingClipId);
    }
    setDraftClipId(null);
    setEditingClip(null);
  };

  const latestSeed = clip.inferredMetas?.seed?.trim() || null;
  const displayedSeed = lockedSeed || latestSeed;
  const seedIsLocked = Boolean(lockedSeed);

  const toggleSeedLock = () => {
    if (seedIsLocked) {
      setLockedSeed(null);
      updateClip(editingClipId, { lockedSeed: null });
      return;
    }
    if (latestSeed) {
      setLockedSeed(latestSeed);
      updateClip(editingClipId, { lockedSeed: latestSeed });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[480px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Edit Clip</h2>
          <button
            onClick={handleClose}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sampleMode}
                onChange={(e) => setSampleMode(e.target.checked)}
                className="w-4 h-4 rounded border-daw-border bg-daw-bg accent-daw-accent"
              />
              <span className="text-xs text-zinc-400">Sample Mode</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoExpandPrompt}
                onChange={(e) => setAutoExpandPrompt(e.target.checked)}
                className="w-4 h-4 rounded border-daw-border bg-daw-bg accent-daw-accent"
              />
              <span className="text-xs text-zinc-400">Auto-expand prompt</span>
            </label>
          </div>

          {!clipTrackIsVocal && !clipTrackIsComplete && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Generation Mode</label>
              <select
                value={generationTaskType}
                onChange={(e) => setGenerationTaskType(e.target.value as ClipGenerationTaskType)}
                className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              >
                <option value="text2music">Text2Music (no timeline context)</option>
                <option value="lego">LEGO (full mix context)</option>
                <option value="complete">Complete (vocal reference)</option>
              </select>
              {generationTaskType === 'text2music' && (
                <p className="text-[10px] text-zinc-500 mt-1">
                  Text2Music ignores timeline context and generates directly from prompt/lyrics for this clip duration.
                </p>
              )}
              {(generationTaskType === 'lego' || generationTaskType === 'complete') && (
                <>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    LEGO uses the full arrangement context. Complete prioritizes vocal-only reference to build accompaniment.
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Thinking is forced off for LEGO/Complete timeline generation (Gradio-aligned behavior).
                  </p>
                </>
              )}
              {generationTaskType === 'complete' && !hasReadyVocalReference && (
                <p className="text-[10px] text-amber-400 mt-1">
                  No ready vocal clips found. Complete will fall back to full mix context.
                </p>
              )}
            </div>
          )}
          {clipTrackIsComplete && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Generation Mode</label>
              <div className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded text-zinc-200">
                Complete (vocal reference + mixed accompaniment)
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                Thinking is forced off for LEGO/Complete timeline generation (Gradio-aligned behavior).
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-400 mb-1">DiT Model</label>
            <select
              value={ditModel ?? 'project'}
              onChange={(e) => {
                const next = e.target.value;
                const resolvedModel = next === 'project'
                  ? normalizeDitModelValue(project.generationDefaults.model)
                  : normalizeDitModelValue(next);
                if (!clipTrackIsVocal && !clipTrackIsComplete && isTurboDitModel(resolvedModel)) {
                  setGenerationTaskType('text2music');
                }
                setDitModel(next === 'project' ? null : next);
              }}
              className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
            >
              <option value="project">Project Default ({getModelLabel(project.generationDefaults.model)})</option>
              <option value="acestep-v15-turbo" disabled={clipTrackIsVocal || clipTrackIsComplete}>
                Turbo {clipTrackIsVocal || clipTrackIsComplete ? '(Text2Music only)' : ''}
              </option>
              <option value="acestep-v15-base">Base</option>
            </select>
            {generationTaskType === 'text2music' ? (
              <p className="text-[10px] text-zinc-500 mt-1">
                Text2Music supports Turbo and Base.
              </p>
            ) : (
              <p className="text-[10px] text-zinc-500 mt-1">
                LEGO/Complete run on Base.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              {sampleMode ? 'Description' : 'Prompt'}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={sampleMode ? 'Describe the sample you want...' : 'Describe the sound for this clip...'}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-daw-bg border border-daw-border rounded resize-none focus:outline-none focus:border-daw-accent"
            />
          </div>

          {!sampleMode && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Lyrics (optional)</label>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Song lyrics..."
                rows={2}
                className="w-full px-3 py-2 text-sm bg-daw-bg border border-daw-border rounded resize-none focus:outline-none focus:border-daw-accent"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Start (seconds)</label>
              <input
                type="number"
                value={normalizeSeconds(startTime, 1)}
                onChange={(e) => {
                  const nextStart = parseFloat(e.target.value) || 0;
                  setStartTime(nextStart);
                  if (nextStart + 0.5 > endTime) {
                    setEndTime(nextStart + 0.5);
                  }
                }}
                min={0}
                step={0.1}
                className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">End (seconds)</label>
              <input
                type="number"
                value={normalizeSeconds(endTime, 1)}
                onChange={(e) => {
                  const nextEnd = parseFloat(e.target.value) || 0;
                  setEndTime(Math.max(startTime + 0.5, nextEnd));
                }}
                min={normalizeSeconds(startTime + 0.5, 1)}
                step={0.1}
                className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
          </div>
          <p className="text-[10px] text-zinc-500">Duration: {normalizedDuration.toFixed(1)}s</p>

          {/* Per-clip musical overrides */}
          <div className="border-t border-daw-border pt-3">
            <p className="text-[10px] text-zinc-500 mb-2">
              Auto = ACE-Step infers from audio context. Project = use project settings ({project.bpm} BPM, {project.keyScale}, {project.timeSignature}/4).
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">BPM</label>
                <select
                  value={overrideBpm === 'auto' ? 'auto' : overrideBpm === null ? 'project' : 'manual'}
                  onChange={(e) => {
                    if (e.target.value === 'auto') setOverrideBpm('auto');
                    else if (e.target.value === 'project') setOverrideBpm(null);
                    else setOverrideBpm(project.bpm);
                  }}
                  className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent mb-1"
                >
                  <option value="auto">Auto</option>
                  <option value="project">Project ({project.bpm})</option>
                  <option value="manual">Manual</option>
                </select>
                {overrideBpm !== 'auto' && overrideBpm !== null && (
                  <input
                    type="number"
                    value={overrideBpm}
                    onChange={(e) => setOverrideBpm(e.target.value ? parseInt(e.target.value) : project.bpm)}
                    min={30}
                    max={300}
                    className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Key</label>
                <select
                  value={overrideKey === 'auto' ? 'auto' : overrideKey === null ? 'project' : 'manual'}
                  onChange={(e) => {
                    if (e.target.value === 'auto') setOverrideKey('auto');
                    else if (e.target.value === 'project') setOverrideKey(null);
                    else setOverrideKey(project.keyScale);
                  }}
                  className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent mb-1"
                >
                  <option value="auto">Auto</option>
                  <option value="project">Project ({project.keyScale})</option>
                  <option value="manual">Manual</option>
                </select>
                {overrideKey !== 'auto' && overrideKey !== null && (
                  <select
                    value={overrideKey}
                    onChange={(e) => setOverrideKey(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                  >
                    {KEY_SCALES.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Time Sig</label>
                <select
                  value={overrideTimeSig === 'auto' ? 'auto' : overrideTimeSig === null ? 'project' : 'manual'}
                  onChange={(e) => {
                    if (e.target.value === 'auto') setOverrideTimeSig('auto');
                    else if (e.target.value === 'project') setOverrideTimeSig(null);
                    else setOverrideTimeSig(project.timeSignature);
                  }}
                  className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent mb-1"
                >
                  <option value="auto">Auto</option>
                  <option value="project">Project ({project.timeSignature}/4)</option>
                  <option value="manual">Manual</option>
                </select>
                {overrideTimeSig !== 'auto' && overrideTimeSig !== null && (
                  <select
                    value={overrideTimeSig}
                    onChange={(e) => setOverrideTimeSig(parseInt(e.target.value))}
                    className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                  >
                    {TIME_SIGNATURES.map((ts) => (
                      <option key={ts} value={ts}>{ts}/4</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Inferred by ACE-Step */}
          {clip.generationStatus === 'ready' && clip.inferredMetas && (
            <div className="border-t border-daw-border pt-3">
              <p className="text-[10px] text-zinc-500 mb-2">Inferred by ACE-Step</p>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                {clip.inferredMetas.bpm != null && (
                  <div>
                    <span className="text-[10px] text-zinc-500">BPM</span>
                    <p className="text-xs text-zinc-300">{clip.inferredMetas.bpm}</p>
                  </div>
                )}
                {clip.inferredMetas.keyScale && (
                  <div>
                    <span className="text-[10px] text-zinc-500">Key</span>
                    <p className="text-xs text-zinc-300">{clip.inferredMetas.keyScale}</p>
                  </div>
                )}
                {clip.inferredMetas.timeSignature && (
                  <div>
                    <span className="text-[10px] text-zinc-500">Time Sig</span>
                    <p className="text-xs text-zinc-300">{clip.inferredMetas.timeSignature}</p>
                  </div>
                )}
                {clip.inferredMetas.genres && (
                  <div>
                    <span className="text-[10px] text-zinc-500">Genres</span>
                    <p className="text-xs text-zinc-300 truncate">{clip.inferredMetas.genres}</p>
                  </div>
                )}
                {displayedSeed && (
                  <div>
                    <span className="text-[10px] text-zinc-500">Seed</span>
                    <div className="flex items-center gap-1">
                      <p className="text-xs text-zinc-300 truncate">{displayedSeed}</p>
                      <button
                        type="button"
                        onClick={toggleSeedLock}
                        title="Lock seed to keep the same random seed when regenerating, so you can compare other parameter changes."
                        aria-label={seedIsLocked ? 'Unlock seed' : 'Lock seed'}
                        className={`h-5 w-5 rounded border text-[11px] leading-none transition-colors ${
                          seedIsLocked
                            ? 'border-daw-accent bg-daw-accent/20 text-daw-accent'
                            : 'border-daw-border text-zinc-300 hover:border-zinc-500'
                        }`}
                      >
                        {seedIsLocked ? '🔒' : '🔓'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-daw-border">
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
          >
            Delete Clip
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleGenerate}
              disabled={!prompt || isGenerating}
              className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
