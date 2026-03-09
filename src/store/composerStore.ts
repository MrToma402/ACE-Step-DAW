import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

/** Serializable output metadata (audio blob stored separately in IDB) */
export interface OutputMeta {
    id: string;
    name: string;
    format: string;
    size: number;
    createdAt: number;
    idbKey: string;
}

type ComposerMode =
    | 'text2music'
    | 'cover'
    | 'repaint'
    | 'vocal2bgm'
    | 'extract'
    | 'complete'
    | 'lora_training';

interface ComposerState {
    // Mode
    mode: ComposerMode;
    setMode: (mode: ComposerMode) => void;

    // Form fields
    prompt: string;
    lyrics: string;
    duration: number;
    bpm: string;
    keyScale: string;
    timeSig: string;
    steps: number;
    guidance: number;
    shift: number;
    thinking: boolean;
    batchSize: number;
    sampleMode: boolean;
    audioFormat: 'wav' | 'mp3';
    repaintStart: number;
    repaintEnd: number;
    extractTrack: string;
    selectedLora: string;

    // New ACE-Step 1.5 params
    coverStrength: number;       // 0.0-1.0 for Cover mode
    ditModel: string;            // acestep-v15-turbo, acestep-v15-sft, acestep-v15-base, turbo-shift variants
    lmModel: string;             // none, 0.6B, 1.7B, 4B
    lmTemperature: number;       // 0.0-2.0
    lmTopP: number;              // 0.0-1.0
    lmCfgScale: number;          // LM CFG
    useCotCaption: boolean;      // auto-expand prompt
    useCotMetas: boolean;        // auto-infer BPM/key/etc
    inferMethod: 'ode' | 'sde';  // deterministic vs random

    // Setters
    setPrompt: (v: string) => void;
    setLyrics: (v: string) => void;
    setDuration: (v: number) => void;
    setBpm: (v: string) => void;
    setKeyScale: (v: string) => void;
    setTimeSig: (v: string) => void;
    setSteps: (v: number) => void;
    setGuidance: (v: number) => void;
    setShift: (v: number) => void;
    setThinking: (v: boolean) => void;
    setBatchSize: (v: number) => void;
    setSampleMode: (v: boolean) => void;
    setAudioFormat: (v: 'wav' | 'mp3') => void;
    setRepaintStart: (v: number) => void;
    setRepaintEnd: (v: number) => void;
    setExtractTrack: (v: string) => void;
    setSelectedLora: (v: string) => void;
    setCoverStrength: (v: number) => void;
    setDitModel: (v: string) => void;
    setLmModel: (v: string) => void;
    setLmTemperature: (v: number) => void;
    setLmTopP: (v: number) => void;
    setLmCfgScale: (v: number) => void;
    setUseCotCaption: (v: boolean) => void;
    setUseCotMetas: (v: boolean) => void;
    setInferMethod: (v: 'ode' | 'sde') => void;

    // Output metadata (blobs in IDB)
    outputs: OutputMeta[];
    addOutput: (meta: OutputMeta, blob: Blob) => Promise<void>;
    removeOutput: (id: string) => Promise<void>;
    clearOutputs: () => Promise<void>;
}

const IDB_PREFIX = 'composer-output:';

export const useComposerStore = create<ComposerState>()(
    persist(
        (set, get) => ({
            // Defaults
            mode: 'text2music',
            prompt: '',
            lyrics: '',
            duration: 30,
            bpm: '',
            keyScale: '',
            timeSig: '',
            steps: 50,
            guidance: 7.0,
            shift: 3.0,
            thinking: true,
            batchSize: 1,
            sampleMode: false,
            audioFormat: 'mp3',
            repaintStart: 0,
            repaintEnd: 10,
            extractTrack: 'vocals',
            selectedLora: '',

            // ACE-Step 1.5 defaults
            coverStrength: 1.0,
            ditModel: 'acestep-v15-turbo',
            lmModel: '1.7B',
            lmTemperature: 0.85,
            lmTopP: 0.9,
            lmCfgScale: 2.0,
            useCotCaption: true,
            useCotMetas: true,
            inferMethod: 'ode' as const,

            outputs: [],

            // Mode
            setMode: (mode) => set({ mode }),

            // Setters
            setPrompt: (prompt) => set({ prompt }),
            setLyrics: (lyrics) => set({ lyrics }),
            setDuration: (duration) => set({ duration }),
            setBpm: (bpm) => set({ bpm }),
            setKeyScale: (keyScale) => set({ keyScale }),
            setTimeSig: (timeSig) => set({ timeSig }),
            setSteps: (steps) => set({ steps }),
            setGuidance: (guidance) => set({ guidance }),
            setShift: (shift) => set({ shift }),
            setThinking: (thinking) => set({ thinking }),
            setBatchSize: (batchSize) => set({ batchSize }),
            setSampleMode: (sampleMode) => set({ sampleMode }),
            setAudioFormat: (audioFormat) => set({ audioFormat }),
            setRepaintStart: (repaintStart) => set({ repaintStart }),
            setRepaintEnd: (repaintEnd) => set({ repaintEnd }),
            setExtractTrack: (extractTrack) => set({ extractTrack }),
            setSelectedLora: (selectedLora) => set({ selectedLora }),
            setCoverStrength: (coverStrength) => set({ coverStrength }),
            setDitModel: (ditModel) => set({ ditModel }),
            setLmModel: (lmModel) => set({ lmModel }),
            setLmTemperature: (lmTemperature) => set({ lmTemperature }),
            setLmTopP: (lmTopP) => set({ lmTopP }),
            setLmCfgScale: (lmCfgScale) => set({ lmCfgScale }),
            setUseCotCaption: (useCotCaption) => set({ useCotCaption }),
            setUseCotMetas: (useCotMetas) => set({ useCotMetas }),
            setInferMethod: (inferMethod) => set({ inferMethod }),

            // Outputs
            addOutput: async (meta, blob) => {
                const idbKey = `${IDB_PREFIX}${meta.id}`;
                await idbSet(idbKey, blob);
                set((s) => ({
                    outputs: [{ ...meta, idbKey }, ...s.outputs],
                }));
            },

            removeOutput: async (id) => {
                const state = get();
                const item = state.outputs.find((o) => o.id === id);
                if (item) {
                    await idbDel(item.idbKey);
                }
                set((s) => ({
                    outputs: s.outputs.filter((o) => o.id !== id),
                }));
            },

            clearOutputs: async () => {
                const state = get();
                await Promise.all(state.outputs.map((o) => idbDel(o.idbKey)));
                set({ outputs: [] });
            },
        }),
        {
            name: 'ace-step-composer',
            partialize: (state) => ({
                mode: state.mode,
                prompt: state.prompt,
                lyrics: state.lyrics,
                duration: state.duration,
                bpm: state.bpm,
                keyScale: state.keyScale,
                timeSig: state.timeSig,
                steps: state.steps,
                guidance: state.guidance,
                shift: state.shift,
                thinking: state.thinking,
                batchSize: state.batchSize,
                sampleMode: state.sampleMode,
                audioFormat: state.audioFormat,
                repaintStart: state.repaintStart,
                repaintEnd: state.repaintEnd,
                extractTrack: state.extractTrack,
                selectedLora: state.selectedLora,
                coverStrength: state.coverStrength,
                ditModel: state.ditModel,
                lmModel: state.lmModel,
                lmTemperature: state.lmTemperature,
                lmTopP: state.lmTopP,
                lmCfgScale: state.lmCfgScale,
                useCotCaption: state.useCotCaption,
                useCotMetas: state.useCotMetas,
                inferMethod: state.inferMethod,
                outputs: state.outputs,
            }),
        },
    ),
);

/**
 * Load an output's audio blob from IndexedDB.
 */
export async function loadOutputBlob(idbKey: string): Promise<Blob | undefined> {
    return idbGet<Blob>(idbKey);
}
