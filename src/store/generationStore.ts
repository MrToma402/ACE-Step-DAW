import { create } from 'zustand';

export interface GenerationJob {
  id: string;
  clipId: string;
  trackName: string;
  repaintStartTime?: number;
  repaintEndTime?: number;
  status: 'queued' | 'generating' | 'processing' | 'done' | 'error';
  progress: string;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

interface GenerationState {
  jobs: GenerationJob[];
  isGenerating: boolean;

  addJob: (job: GenerationJob) => void;
  updateJob: (jobId: string, updates: Partial<GenerationJob>) => void;
  removeJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  setIsGenerating: (v: boolean) => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  jobs: [],
  isGenerating: false,

  addJob: (job) => set((s) => ({ jobs: [...s.jobs, job] })),

  updateJob: (jobId, updates) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, ...updates, updatedAt: Date.now() } : j)),
    })),

  removeJob: (jobId) =>
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== jobId) })),

  clearCompletedJobs: () =>
    set((s) => ({
      jobs: s.jobs.filter((j) => j.status !== 'done' && j.status !== 'error'),
    })),

  setIsGenerating: (v) => set({ isGenerating: v }),
}));
