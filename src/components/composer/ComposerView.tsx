import { useState, useEffect, useRef, useCallback } from 'react';
import { generateViaModal, generateBatchViaModal, listLoras } from '../../services/modalApi';
import type { LoraInfo } from '../../services/modalApi';
import { useProjectStore } from '../../store/projectStore';
import { useLoraStore } from '../../store/loraStore';
import { useComposerStore, loadOutputBlob } from '../../store/composerStore';
import type { OutputMeta } from '../../store/composerStore';
import { LoraTrainingPanel } from './LoraTrainingPanel';
import type { AnyTaskParams, BaseTaskParams } from '../../types/api';

type ComposerMode =
    | 'text2music'
    | 'cover'
    | 'repaint'
    | 'vocal2bgm'
    | 'extract'
    | 'complete'
    | 'lora_training';

interface ModeInfo {
    id: ComposerMode;
    label: string;
    icon: string;
    description: string;
    needsAudio: boolean;
}

const GENERATION_MODES: ModeInfo[] = [
    { id: 'text2music', label: 'Text to Music', icon: 'music_note', description: 'Generate a full song from text prompt and lyrics', needsAudio: false },
    { id: 'cover', label: 'Cover', icon: 'mic', description: 'Create a cover version from reference audio', needsAudio: true },
    { id: 'repaint', label: 'Repaint / Edit', icon: 'brush', description: 'Selectively re-generate a region of audio', needsAudio: true },
    { id: 'vocal2bgm', label: 'Vocal → BGM', icon: 'queue_music', description: 'Generate background music from a vocal track', needsAudio: true },
    { id: 'extract', label: 'Track Separation', icon: 'call_split', description: 'Separate audio into individual stems', needsAudio: true },
    { id: 'complete', label: 'Complete / Extend', icon: 'skip_next', description: 'Extend or complete partial audio', needsAudio: true },
];

const TRAINING_MODES: ModeInfo[] = [
    { id: 'lora_training', label: 'LoRA Training', icon: 'psychology', description: 'Train a custom style LoRA from your audio files', needsAudio: false },
];

const ALL_MODES = [...GENERATION_MODES, ...TRAINING_MODES];

export function ComposerView() {
    const project = useProjectStore((s) => s.project);
    const defaults = project?.generationDefaults;

    // All form state from persistent store
    const cs = useComposerStore();
    const mode = cs.mode as ComposerMode;
    const setMode = cs.setMode;
    const currentMode = ALL_MODES.find((m) => m.id === mode)!;

    const { prompt, lyrics, duration, bpm, keyScale, timeSig, steps, guidance, shift, thinking, batchSize, sampleMode, audioFormat, repaintStart, repaintEnd, extractTrack, selectedLora, coverStrength, ditModel, lmModel, lmTemperature, lmTopP, lmCfgScale, useCotCaption, useCotMetas, inferMethod } = cs;
    const { setPrompt, setLyrics, setDuration, setBpm, setKeyScale, setTimeSig, setSteps, setGuidance, setShift, setThinking, setBatchSize, setSampleMode, setAudioFormat, setRepaintStart, setRepaintEnd, setExtractTrack, setSelectedLora, setCoverStrength, setDitModel, setLmModel, setLmTemperature, setLmTopP, setLmCfgScale, setUseCotCaption, setUseCotMetas, setInferMethod } = cs;

    // Persistent outputs (metadata in store, blobs in IDB)
    const persistedOutputs = cs.outputs;
    const addOutputToStore = cs.addOutput;
    const removeOutputFromStore = cs.removeOutput;

    const [srcAudioFile, setSrcAudioFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // LoRA selection — merge persistent local store + remote API
    const localDoneLoras = useLoraStore((s) => s.localLoras).filter((l) => l.status === 'done');
    const [remoteLoras, setRemoteLoras] = useState<LoraInfo[]>([]);
    const [lorasLoading, setLorasLoading] = useState(false);

    // Merge local + remote, deduplicate by name
    const allLoras = (() => {
        const byName = new Map<string, { name: string; rank?: number; epochs?: number; source: string }>();
        for (const l of localDoneLoras) {
            byName.set(l.name, { name: l.name, rank: l.rank, epochs: l.epochs, source: 'local' });
        }
        for (const l of remoteLoras) {
            if (!byName.has(l.name)) {
                byName.set(l.name, { name: l.name, rank: l.rank, epochs: l.epochs, source: 'remote' });
            }
        }
        return Array.from(byName.values());
    })();

    // Rehydrate object URLs from IDB on mount
    const [outputUrls, setOutputUrls] = useState<Record<string, string>>({});
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const urls: Record<string, string> = {};
            for (const meta of persistedOutputs) {
                const blob = await loadOutputBlob(meta.idbKey);
                if (cancelled) return;
                if (blob) {
                    urls[meta.id] = URL.createObjectURL(blob);
                }
            }
            if (!cancelled) setOutputUrls(urls);
        })();
        return () => { cancelled = true; };
    }, [persistedOutputs]);

    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setSrcAudioFile(file);
    }, []);

    const buildParams = (): AnyTaskParams => {
        const base: Omit<BaseTaskParams, 'task_type'> = {
            prompt, lyrics, audio_duration: duration,
            bpm: bpm ? parseInt(bpm) : null,
            key_scale: keyScale, time_signature: timeSig,
            inference_steps: steps, guidance_scale: guidance, shift,
            batch_size: batchSize, audio_format: audioFormat, thinking,
            model: ditModel || defaults?.model || '',
            sample_mode: sampleMode || undefined,
            // ACE-Step 1.5 advanced params
            use_cot_caption: useCotCaption,
            use_cot_metas: useCotMetas,
            lm_model: lmModel !== 'none' ? lmModel : undefined,
            lm_temperature: lmTemperature,
            lm_top_p: lmTopP,
            lm_cfg_scale: lmCfgScale,
            infer_method: inferMethod,
        };

        switch (mode) {
            case 'text2music': return { ...base, task_type: 'text2music' as const };
            case 'cover': return { ...base, task_type: 'cover' as const, audio_cover_strength: coverStrength };
            case 'repaint': return { ...base, task_type: 'repaint' as const, repainting_start: repaintStart, repainting_end: repaintEnd };
            case 'vocal2bgm': return { ...base, task_type: 'vocal2bgm' as const };
            case 'extract': return { ...base, task_type: 'extract' as const, track_name: extractTrack };
            case 'complete': return { ...base, task_type: 'complete' as const };
            default: return { ...base, task_type: 'text2music' as const };
        }
    };

    const handleGenerate = async () => {
        setGenerating(true);
        setError(null);
        setProgress('Preparing...');

        try {
            let srcBlob: Blob | null = null;
            if (currentMode.needsAudio && srcAudioFile) {
                srcBlob = srcAudioFile;
            }
            const params = buildParams();
            // Inject lora_name if selected (passed through to API task payload)
            if (selectedLora) {
                (params as unknown as Record<string, unknown>).lora_name = selectedLora;
            }

            if (batchSize > 1) {
                setProgress(`Generating ${batchSize} variations...`);
                const results = await generateBatchViaModal(srcBlob, params);
                for (let i = 0; i < results.length; i++) {
                    const id = `${Date.now()}-${i}`;
                    const name = `${mode}_${i + 1}.${audioFormat}`;
                    await addOutputToStore(
                        { id, name, format: audioFormat, size: results[i].audioBlob.size, createdAt: Date.now(), idbKey: '' },
                        results[i].audioBlob,
                    );
                }
            } else {
                setProgress('Generating...');
                const result = await generateViaModal(srcBlob, params);
                const id = `${Date.now()}`;
                const name = `${mode}_${Date.now()}.${audioFormat}`;
                await addOutputToStore(
                    { id, name, format: audioFormat, size: result.audioBlob.size, createdAt: Date.now(), idbKey: '' },
                    result.audioBlob,
                );
            }
            setProgress('Done!');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setError(msg);
            setProgress('');
        } finally {
            setGenerating(false);
        }
    };

    const handleDownload = (meta: OutputMeta) => {
        const url = outputUrls[meta.id];
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        a.download = meta.name;
        a.click();
    };

    const handleRemoveOutput = async (id: string) => {
        const url = outputUrls[id];
        if (url) URL.revokeObjectURL(url);
        setOutputUrls((prev) => { const next = { ...prev }; delete next[id]; return next; });
        await removeOutputFromStore(id);
    };

    return (
        <div className="flex h-full bg-daw-bg">
            {/* ─── Mode Sidebar ─── */}
            <div className="w-48 flex-shrink-0 bg-daw-panel border-r border-daw-border overflow-y-auto">
                <div className="p-3">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs">auto_fix_high</span>
                        Generation
                    </h3>
                    {GENERATION_MODES.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => setMode(m.id)}
                            className={`w-full text-left px-3 py-2 rounded mb-0.5 text-xs transition-colors flex items-center gap-2 ${mode === m.id
                                ? 'bg-daw-accent text-white font-bold'
                                : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                                }`}
                        >
                            <span className="material-symbols-outlined text-sm">{m.icon}</span>
                            {m.label}
                        </button>
                    ))}

                    <div className="border-t border-daw-border my-3" />
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs">school</span>
                        Training
                    </h3>
                    {TRAINING_MODES.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => setMode(m.id)}
                            className={`w-full text-left px-3 py-2 rounded mb-0.5 text-xs transition-colors flex items-center gap-2 ${mode === m.id
                                ? 'bg-emerald-600 text-white font-bold'
                                : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                                }`}
                        >
                            <span className="material-symbols-outlined text-sm">{m.icon}</span>
                            {m.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── Main Content ─── */}
            {mode === 'lora_training' ? (
                <LoraTrainingPanel />
            ) : (
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-daw-border bg-daw-surface">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] flex items-center gap-2 text-daw-accent">
                            <span className="material-symbols-outlined text-sm">{currentMode.icon}</span>
                            {currentMode.label}
                        </h2>
                        <p className="text-[10px] text-slate-600 mt-0.5">{currentMode.description}</p>
                    </div>

                    {/* Form + Outputs */}
                    <div className="flex-1 flex min-h-0 overflow-hidden">
                        {/* ─── Form Panel ─── */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-5">
                            {/* Prompt */}
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">Prompt</label>
                                <textarea
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    rows={3}
                                    placeholder="Describe the sound..."
                                    className="w-full bg-daw-surface border border-daw-border rounded p-3 text-sm text-white focus:border-daw-accent/50 focus:ring-0 resize-none placeholder-slate-700 outline-none"
                                />
                            </div>

                            {/* Lyrics */}
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">Lyrics</label>
                                <textarea
                                    value={lyrics}
                                    onChange={(e) => setLyrics(e.target.value)}
                                    rows={5}
                                    placeholder={`[verse]\nYour lyrics here...\n\n[chorus]\nChorus lyrics...`}
                                    className="w-full bg-daw-surface border border-daw-border rounded p-3 text-sm text-white focus:border-daw-accent/50 focus:ring-0 resize-y font-mono text-xs placeholder-slate-700 outline-none"
                                />
                            </div>

                            {/* Audio Input */}
                            {currentMode.needsAudio && (
                                <div>
                                    <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">
                                        {mode === 'cover' ? 'Reference Audio' :
                                            mode === 'vocal2bgm' ? 'Vocal Track' :
                                                mode === 'extract' ? 'Audio to Separate' :
                                                    'Source Audio'}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-daw-surface border border-daw-border hover:bg-white/5 rounded transition-colors"
                                        >
                                            Choose File
                                        </button>
                                        <span className="text-[10px] text-slate-600">
                                            {srcAudioFile ? srcAudioFile.name : 'No file selected'}
                                        </span>
                                        <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />
                                    </div>
                                </div>
                            )}

                            {/* Repaint Region */}
                            {mode === 'repaint' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-500 font-bold tracking-wider block mb-1">Start (s)</label>
                                        <input type="number" value={repaintStart} onChange={(e) => setRepaintStart(parseFloat(e.target.value) || 0)} min={0} step={0.1}
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1.5 text-xs text-white focus:border-daw-accent/50 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-500 font-bold tracking-wider block mb-1">End (s)</label>
                                        <input type="number" value={repaintEnd} onChange={(e) => setRepaintEnd(parseFloat(e.target.value) || 10)} min={0} step={0.1}
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1.5 text-xs text-white focus:border-daw-accent/50 outline-none" />
                                    </div>
                                </div>
                            )}

                            {/* Extract Track */}
                            {mode === 'extract' && (
                                <div>
                                    <label className="text-[9px] uppercase text-slate-500 font-bold tracking-wider block mb-1">Stem to Extract</label>
                                    <select value={extractTrack} onChange={(e) => setExtractTrack(e.target.value)}
                                        className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1.5 text-xs text-white focus:border-daw-accent/50 outline-none">
                                        <option value="vocals">Vocals</option>
                                        <option value="drums">Drums</option>
                                        <option value="bass">Bass</option>
                                        <option value="guitar">Guitar</option>
                                        <option value="piano">Piano</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            )}

                            {/* Metadata */}
                            <div className="bg-daw-surface rounded border border-daw-border p-3 space-y-3">
                                <h3 className="text-[10px] uppercase text-slate-500 font-bold tracking-[0.15em]">Metadata</h3>
                                <div className="grid grid-cols-4 gap-3">
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">Duration</label>
                                        <input type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 30)} min={10} max={600}
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-right text-white focus:border-daw-accent/50 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">Tempo</label>
                                        <input type="text" value={bpm} onChange={(e) => setBpm(e.target.value)} placeholder="auto"
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-right text-white focus:border-daw-accent/50 outline-none placeholder-slate-700" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">Key</label>
                                        <input type="text" value={keyScale} onChange={(e) => setKeyScale(e.target.value)} placeholder="auto"
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-white focus:border-daw-accent/50 outline-none placeholder-slate-700" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">Time Sig</label>
                                        <input type="text" value={timeSig} onChange={(e) => setTimeSig(e.target.value)} placeholder="auto"
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-white focus:border-daw-accent/50 outline-none placeholder-slate-700" />
                                    </div>
                                </div>
                            </div>

                            {/* LoRA Selection */}
                            <div className="bg-daw-surface rounded border border-daw-border p-3 space-y-3">
                                <h3 className="text-[10px] uppercase text-slate-500 font-bold tracking-[0.15em] flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-xs">psychology</span>
                                    Style LoRA
                                </h3>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={selectedLora}
                                        onChange={(e) => setSelectedLora(e.target.value)}
                                        className="flex-1 bg-daw-panel border border-daw-border rounded px-2 py-1.5 text-xs text-white focus:border-daw-accent/50 outline-none"
                                    >
                                        <option value="">None (base model)</option>
                                        {allLoras.map((lora) => (
                                            <option key={lora.name} value={lora.name}>
                                                {lora.name}{lora.rank ? ` (rank ${lora.rank})` : ''}{lora.epochs ? ` · ${lora.epochs}ep` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => {
                                            setLorasLoading(true);
                                            listLoras()
                                                .then((loras) => setRemoteLoras(loras.filter((l) => l.has_weights)))
                                                .finally(() => setLorasLoading(false));
                                        }}
                                        disabled={lorasLoading}
                                        className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-black/20 border border-daw-border rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
                                        title="Refresh LoRA list"
                                    >
                                        {lorasLoading ? (
                                            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <span className="material-symbols-outlined text-sm">refresh</span>
                                        )}
                                    </button>
                                </div>
                                {selectedLora && (
                                    <p className="text-[9px] text-daw-accent/70">
                                        <span className="material-symbols-outlined text-[10px] align-middle mr-0.5">check_circle</span>
                                        Using LoRA: <strong>{selectedLora}</strong>
                                    </p>
                                )}
                                {allLoras.length === 0 && !lorasLoading && (
                                    <p className="text-[9px] text-slate-600">No trained LoRAs found. Train one in the Training tab.</p>
                                )}
                            </div>

                            {/* Cover Strength + Tips (only in Cover mode) */}
                            {mode === 'cover' && (
                                <div className="bg-amber-900/10 rounded border border-amber-500/20 p-3 space-y-3">
                                    <h3 className="text-[10px] uppercase text-amber-400/80 font-bold tracking-[0.15em] flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-xs">tune</span>
                                        Cover Settings
                                    </h3>
                                    <div>
                                        <label className="text-[9px] uppercase text-amber-400/60 font-bold block mb-1 tracking-wider">Cover Strength</label>
                                        <p className="text-[9px] text-slate-600 mb-1.5">How closely to follow source melody/rhythm/chords. 1.0 = faithful, 0.5 = loose remix.</p>
                                        <div className="flex items-center gap-3">
                                            <input type="range" min={0} max={100} value={Math.round(coverStrength * 100)}
                                                onChange={(e) => setCoverStrength(parseInt(e.target.value) / 100)}
                                                className="flex-1 h-1 accent-amber-500" />
                                            <span className="text-xs font-mono text-amber-400/80 w-10 text-right">{coverStrength.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="border-t border-amber-500/10 pt-2">
                                        <h4 className="text-[9px] font-bold text-amber-400/60 uppercase tracking-wider mb-1">💡 Cover Tips</h4>
                                        <ul className="text-[9px] text-slate-600 space-y-0.5">
                                            <li>• <strong>Prompt</strong> describes the NEW style you want (e.g. "jazz piano ballad, female vocal")</li>
                                            <li>• <strong>Lyrics</strong> can be changed for a remix, or kept similar for a true cover</li>
                                            <li>• Set <strong>LM Planner = None</strong> for best results (source audio IS the plan)</li>
                                            <li>• Set <strong>CoT = off</strong> to let DiT work directly from the audio structure</li>
                                            <li>• <strong>Strength 1.0</strong> = faithful structure, <strong>0.7</strong> = creative interpretation</li>
                                            <li>• Generate multiple batches and pick the best — randomness is a feature!</li>
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Model Selection */}
                            <div className="bg-daw-surface rounded border border-daw-border p-3 space-y-3">
                                <h3 className="text-[10px] uppercase text-slate-500 font-bold tracking-[0.15em] flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-xs">memory</span>
                                    Models
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">DiT Model</label>
                                        <select value={ditModel} onChange={(e) => setDitModel(e.target.value)}
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1.5 text-xs text-white focus:border-daw-accent/50 outline-none">
                                            <option value="turbo">Turbo (default, 8 steps)</option>
                                            <option value="turbo-shift1">Turbo Shift-1 (rich details)</option>
                                            <option value="turbo-shift3">Turbo Shift-3 (clear timbre)</option>
                                            <option value="sft">SFT (50 steps, CFG)</option>
                                            <option value="base">Base (extract/lego/complete)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">LM Planner</label>
                                        <select value={lmModel} onChange={(e) => setLmModel(e.target.value)}
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1.5 text-xs text-white focus:border-daw-accent/50 outline-none">
                                            <option value="none">None (you plan)</option>
                                            <option value="0.6B">0.6B (fast, basic)</option>
                                            <option value="1.7B">1.7B (default)</option>
                                            <option value="4B">4B (rich, slow)</option>
                                        </select>
                                    </div>
                                </div>
                                <p className="text-[8px] text-slate-700">
                                    {ditModel === 'turbo' && 'Best balance of creativity and semantics. 8 steps.'}
                                    {ditModel === 'turbo-shift1' && 'Richer details, weaker semantics. Good for texture.'}
                                    {ditModel === 'turbo-shift3' && 'Clearer timbre, may sound dry. Good for clean mixes.'}
                                    {ditModel === 'sft' && 'Supports CFG, 50 steps. Better detail + semantics, slower.'}
                                    {ditModel === 'base' && 'Master model. Supports extract, lego, complete tasks + LoRA fine-tuning.'}
                                </p>
                            </div>

                            {/* Advanced LM & Inference */}
                            <details className="bg-daw-surface rounded border border-daw-border">
                                <summary className="p-3 text-[10px] uppercase text-slate-500 font-bold tracking-[0.15em] cursor-pointer hover:text-slate-400 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-xs">settings</span>
                                    Advanced Parameters
                                </summary>
                                <div className="px-3 pb-3 space-y-3">
                                    {/* CoT sub-controls */}
                                    <div className="flex items-center gap-5">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={useCotCaption} onChange={(e) => setUseCotCaption(e.target.checked)}
                                                className="w-3 h-3 rounded border-daw-border bg-daw-bg accent-daw-accent" />
                                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Auto-expand Prompt</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={useCotMetas} onChange={(e) => setUseCotMetas(e.target.checked)}
                                                className="w-3 h-3 rounded border-daw-border bg-daw-bg accent-daw-accent" />
                                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Auto-infer Metadata</span>
                                        </label>
                                    </div>
                                    {/* LM params */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">LM Temp</label>
                                            <input type="number" value={lmTemperature} onChange={(e) => setLmTemperature(parseFloat(e.target.value) || 0.85)} min={0} max={2} step={0.05}
                                                className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-right text-white focus:border-daw-accent/50 outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">LM Top-P</label>
                                            <input type="number" value={lmTopP} onChange={(e) => setLmTopP(parseFloat(e.target.value) || 0.9)} min={0} max={1} step={0.05}
                                                className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-right text-white focus:border-daw-accent/50 outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">LM CFG</label>
                                            <input type="number" value={lmCfgScale} onChange={(e) => setLmCfgScale(parseFloat(e.target.value) || 2)} min={0} max={10} step={0.5}
                                                className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-right text-white focus:border-daw-accent/50 outline-none" />
                                        </div>
                                    </div>
                                    {/* Inference method */}
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">Inference Method</label>
                                        <select value={inferMethod} onChange={(e) => setInferMethod(e.target.value as 'ode' | 'sde')}
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1.5 text-xs text-white focus:border-daw-accent/50 outline-none">
                                            <option value="ode">ODE (deterministic)</option>
                                            <option value="sde">SDE (more random/creative)</option>
                                        </select>
                                    </div>
                                </div>
                            </details>

                            {/* Generation Parameters */}
                            <div className="bg-daw-surface rounded border border-daw-border p-3 space-y-3">
                                <h3 className="text-[10px] uppercase text-slate-500 font-bold tracking-[0.15em]">Generation</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">Steps</label>
                                        <input type="number" value={steps} onChange={(e) => setSteps(parseInt(e.target.value) || 50)} min={4} max={200}
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-right text-white focus:border-daw-accent/50 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">Guidance</label>
                                        <input type="number" value={guidance} onChange={(e) => setGuidance(parseFloat(e.target.value) || 7)} min={1} max={20} step={0.5}
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-right text-white focus:border-daw-accent/50 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">Shift</label>
                                        <input type="number" value={shift} onChange={(e) => setShift(parseFloat(e.target.value) || 3)} min={0} max={10} step={0.5}
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-right text-white focus:border-daw-accent/50 outline-none" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-5 mt-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={thinking} onChange={(e) => setThinking(e.target.checked)}
                                            className="w-3 h-3 rounded border-daw-border bg-daw-bg accent-daw-accent" />
                                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">CoT</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={sampleMode} onChange={(e) => setSampleMode(e.target.checked)}
                                            className="w-3 h-3 rounded border-daw-border bg-daw-bg accent-daw-accent" />
                                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Simple</span>
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">Batch</label>
                                        <input type="number" value={batchSize} onChange={(e) => setBatchSize(Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))} min={1} max={8}
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-right text-white focus:border-daw-accent/50 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase text-slate-600 font-bold block mb-1 tracking-wider">Format</label>
                                        <select value={audioFormat} onChange={(e) => setAudioFormat(e.target.value as 'wav' | 'mp3')}
                                            className="w-full bg-daw-panel border border-daw-border rounded px-2 py-1 text-xs text-white focus:border-daw-accent/50 outline-none">
                                            <option value="mp3">MP3</option>
                                            <option value="wav">WAV</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Generate Button */}
                            <button
                                onClick={handleGenerate}
                                disabled={generating || (!prompt && !currentMode.needsAudio)}
                                className="w-full bg-daw-accent hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded text-[11px] uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 shadow-lg shadow-daw-accent/10"
                            >
                                {generating ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        {progress}
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                        Generate
                                    </>
                                )}
                            </button>
                            {error && (
                                <p className="text-[10px] text-red-400 bg-red-900/20 border border-red-500/20 px-3 py-2 rounded">{error}</p>
                            )}
                        </div>

                        {/* ─── Output Panel ─── */}
                        <div className="w-72 flex-shrink-0 bg-daw-panel border-l border-daw-border overflow-y-auto">
                            <div className="p-4 border-b border-daw-border bg-daw-surface">
                                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                                    Outputs ({persistedOutputs.length})
                                </h3>
                            </div>
                            <div className="p-3">
                                {persistedOutputs.length === 0 ? (
                                    <p className="text-[10px] text-slate-700 text-center py-8">
                                        Generated audio will appear here
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        {persistedOutputs.map((meta) => (
                                            <div key={meta.id} className="p-3 bg-daw-surface border border-daw-border rounded hover:border-daw-accent/30 group transition-all">
                                                <p className="text-[10px] text-slate-500 mb-2 truncate font-bold uppercase tracking-wider">{meta.name}</p>
                                                <div className="h-10 bg-black/40 rounded flex items-center justify-center relative overflow-hidden mb-2">
                                                    {outputUrls[meta.id] ? (
                                                        <audio controls src={outputUrls[meta.id]} className="w-full h-8 opacity-70" style={{ filter: 'invert(1) hue-rotate(180deg)' }} />
                                                    ) : (
                                                        <span className="text-[9px] text-slate-600">Loading...</span>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleDownload(meta)}
                                                        className="flex-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-black/20 hover:bg-white/5 border border-daw-border rounded transition-colors">
                                                        Download
                                                    </button>
                                                    <button onClick={() => handleRemoveOutput(meta.id)}
                                                        className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-red-500/60 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors">
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
