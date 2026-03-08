import { cancelTask } from './aceStepApi';

interface ActiveClipGeneration {
  clipId: string;
  jobId: string;
  controller: AbortController;
  taskId: string | null;
}

const activeGenerationsByClipId = new Map<string, ActiveClipGeneration>();

export function beginClipGeneration(clipId: string, jobId: string): AbortSignal {
  const existing = activeGenerationsByClipId.get(clipId);
  if (existing) {
    existing.controller.abort();
    activeGenerationsByClipId.delete(clipId);
  }

  const controller = new AbortController();
  activeGenerationsByClipId.set(clipId, {
    clipId,
    jobId,
    controller,
    taskId: null,
  });
  return controller.signal;
}

export function setClipGenerationTaskId(clipId: string, jobId: string, taskId: string): void {
  const active = activeGenerationsByClipId.get(clipId);
  if (!active || active.jobId !== jobId) return;
  active.taskId = taskId;
}

export async function cancelClipGeneration(clipId: string): Promise<void> {
  const active = activeGenerationsByClipId.get(clipId);
  if (!active) return;

  active.controller.abort();
  activeGenerationsByClipId.delete(clipId);

  if (!active.taskId) return;
  await cancelTask(active.taskId);
}

export function completeClipGeneration(clipId: string, jobId: string): void {
  const active = activeGenerationsByClipId.get(clipId);
  if (!active || active.jobId !== jobId) return;
  activeGenerationsByClipId.delete(clipId);
}

