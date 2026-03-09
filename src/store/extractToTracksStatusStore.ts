import { create } from 'zustand';
import type {
  ExtractTrackProgress,
  ExtractTrackStemsResult,
} from '../services/stemExtractionPipeline';
import { extractTrackToNewTracks } from '../services/stemExtractionPipeline';
import { useGenerationStore } from './generationStore';

type ExtractToTracksMode = 'closed' | 'confirm' | 'running' | 'result' | 'error';

interface StartExtractionArgs {
  sourceTrackId: string;
  sourceClipId?: string;
  sourceLabel?: string;
}

interface ExtractToTracksStatusStoreState {
  mode: ExtractToTracksMode;
  sourceLabel: string | null;
  progress: ExtractTrackProgress | null;
  result: ExtractTrackStemsResult | null;
  errorMessage: string | null;
  abortController: AbortController | null;
  startExtraction: (args: StartExtractionArgs) => Promise<void>;
  cancelExtraction: () => void;
  closeStatus: () => void;
}

type ExtractRunner = typeof extractTrackToNewTracks;

interface CreateExtractToTracksStatusStoreDependencies {
  extractRunner?: ExtractRunner;
  isGenerating?: () => boolean;
}

export function createExtractToTracksStatusStore(
  dependencies: CreateExtractToTracksStatusStoreDependencies = {},
) {
  const extractRunner = dependencies.extractRunner ?? extractTrackToNewTracks;
  const isGenerating = dependencies.isGenerating ?? (() => useGenerationStore.getState().isGenerating);

  return create<ExtractToTracksStatusStoreState>((set, get) => ({
    mode: 'closed',
    sourceLabel: null,
    progress: null,
    result: null,
    errorMessage: null,
    abortController: null,

    startExtraction: async ({ sourceTrackId, sourceClipId, sourceLabel }) => {
      if (isGenerating()) return;
      if (get().mode === 'running') return;

      const controller = new AbortController();
      set({
        mode: 'running',
        sourceLabel: sourceLabel ?? null,
        progress: {
          phase: 'preparing',
          completed: 0,
          total: 1,
          currentTrackName: null,
        },
        result: null,
        errorMessage: null,
        abortController: controller,
      });

      try {
        const result = await extractRunner(sourceTrackId, sourceClipId, {
          signal: controller.signal,
          onProgress: (nextProgress) => {
            if (get().abortController !== controller) return;
            set({ progress: nextProgress });
          },
        });

        if (get().abortController !== controller) return;
        set({
          mode: 'result',
          result,
          abortController: null,
        });
      } catch (error) {
        if (get().abortController !== controller) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          set({
            mode: 'closed',
            sourceLabel: null,
            progress: null,
            result: null,
            errorMessage: null,
            abortController: null,
          });
          return;
        }

        set({
          mode: 'error',
          errorMessage: error instanceof Error ? error.message : 'Stem extraction failed',
          abortController: null,
        });
      }
    },

    cancelExtraction: () => {
      const controller = get().abortController;
      if (!controller) return;
      controller.abort();
    },

    closeStatus: () => {
      if (get().mode === 'running') {
        get().cancelExtraction();
        return;
      }
      set({
        mode: 'closed',
        sourceLabel: null,
        progress: null,
        result: null,
        errorMessage: null,
      });
    },
  }));
}

export const useExtractToTracksStatusStore = createExtractToTracksStatusStore();
