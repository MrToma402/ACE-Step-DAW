import type {
  AnyTaskParams,
  LegoTaskParams,
  ApiEnvelope,
  ReleaseTaskResponse,
  TaskResultEntry,
  TaskResultItem,
  ModelsListResponse,
  StatsResponse,
} from '../types/api';
import { apiFetch, buildApiUrl, withApiHeaders } from './apiClient';

const QUERY_TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 120000;
const DOWNLOAD_RETRIES = 3;
const GENERATE_POLL_INTERVAL_MS = 1500;
const GENERATE_MAX_WAIT_MS = 10 * 60 * 1000;

interface RequestOptions {
  signal?: AbortSignal;
}

interface GenerateTaskOptions extends RequestOptions {
  onProgress?: (progressText: string) => void;
  maxWaitMs?: number;
  pollIntervalMs?: number;
}

export interface GeneratedTaskAudio {
  audioBlob: Blob;
  metas: TaskResultItem['metas'];
  seed_value?: string;
  dit_model?: string;
}

export interface LoraInfo {
  name: string;
  has_weights: boolean;
  created_at?: string;
  epochs?: number;
  rank?: number;
  num_files?: number;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortListener = () => controller.abort();
  signal?.addEventListener('abort', abortListener, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortListener);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function parseTaskResultItems(rawResult: string): TaskResultItem[] {
  try {
    const parsed = JSON.parse(rawResult) as unknown;
    return Array.isArray(parsed) ? (parsed as TaskResultItem[]) : [];
  } catch {
    return [];
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await apiFetch('/health');
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<ModelsListResponse> {
  const res = await apiFetch('/v1/models');
  if (!res.ok) throw new Error(`listModels failed: ${res.status}`);
  const envelope: ApiEnvelope<ModelsListResponse> = await res.json();
  return envelope.data;
}

export async function getStats(): Promise<StatsResponse> {
  const res = await apiFetch('/v1/stats');
  if (!res.ok) throw new Error(`getStats failed: ${res.status}`);
  const envelope: ApiEnvelope<StatsResponse> = await res.json();
  return envelope.data;
}

export async function releaseLegoTask(
  srcAudioBlob: Blob,
  params: LegoTaskParams,
  options?: RequestOptions,
): Promise<ReleaseTaskResponse> {
  return releaseTask(srcAudioBlob, params, options);
}

export async function releaseTask(
  srcAudioBlob: Blob | null,
  params: AnyTaskParams | LegoTaskParams,
  options?: RequestOptions,
): Promise<ReleaseTaskResponse> {
  const formData = new FormData();

  if (srcAudioBlob && srcAudioBlob.size > 0) {
    // Add the audio file
    formData.append('src_audio', srcAudioBlob, 'src_audio.wav');
    // Cover uses the same blob for source and reference conditioning.
    if (params.task_type === 'cover') {
      formData.append('reference_audio', srcAudioBlob, 'reference_audio.wav');
    }
  }

  // Add all params as form fields (skip null values — ACE-Step auto-infers them)
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === null || item === undefined) continue;
        formData.append(key, String(item));
      }
      continue;
    }
    formData.append(key, String(value));
  }

  const res = await apiFetch('/release_task', {
    method: 'POST',
    body: formData,
    signal: options?.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`releaseTask failed: ${res.status} - ${text}`);
  }

  const envelope: ApiEnvelope<ReleaseTaskResponse> = await res.json();
  return envelope.data;
}

export async function cancelTask(taskId: string): Promise<void> {
  const candidates: Array<{ path: string; method: 'POST' | 'DELETE'; body?: Record<string, unknown> }> = [
    { path: '/cancel_task', method: 'POST', body: { task_id: taskId } },
    { path: '/v1/cancel_task', method: 'POST', body: { task_id: taskId } },
    { path: '/v1/task/cancel', method: 'POST', body: { task_id: taskId } },
    { path: '/v1/jobs/cancel', method: 'POST', body: { task_id: taskId } },
    { path: '/jobs/cancel', method: 'POST', body: { task_id: taskId } },
    { path: '/v1/job/cancel', method: 'POST', body: { task_id: taskId } },
    { path: `/v1/tasks/${encodeURIComponent(taskId)}`, method: 'DELETE' },
    { path: `/tasks/${encodeURIComponent(taskId)}`, method: 'DELETE' },
  ];

  for (const candidate of candidates) {
    try {
      const response = await apiFetch(candidate.path, {
        method: candidate.method,
        headers: candidate.body ? { 'Content-Type': 'application/json' } : undefined,
        body: candidate.body ? JSON.stringify(candidate.body) : undefined,
      });
      if (response.ok || response.status === 404 || response.status === 405) {
        return;
      }
    } catch {
      return;
    }
  }
}

export async function queryResult(taskIds: string[], options?: RequestOptions): Promise<TaskResultEntry[]> {
  let res: Response;
  try {
    res = await fetchWithTimeout(buildApiUrl('/query_result'), {
      method: 'POST',
      headers: withApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ task_id_list: taskIds }),
    }, QUERY_TIMEOUT_MS, options?.signal);
  } catch (error) {
    if (isAbortError(error)) {
      if (options?.signal?.aborted) {
        throw error;
      }
      throw new Error('queryResult timed out');
    }
    throw error;
  }

  if (!res.ok) throw new Error(`queryResult failed: ${res.status}`);
  const envelope: ApiEnvelope<TaskResultEntry[]> = await res.json();
  return envelope.data;
}

export async function downloadAudio(audioPath: string, options?: RequestOptions): Promise<Blob> {
  // The file field may already be "/v1/audio?path=..." or a full URL.
  // Otherwise treat it as a server filesystem path for /v1/audio.
  let url: string;
  if (/^https?:\/\//i.test(audioPath)) {
    url = audioPath;
  } else if (audioPath.startsWith('/v1/')) {
    url = buildApiUrl(audioPath);
  } else {
    url = buildApiUrl(`/v1/audio?path=${encodeURIComponent(audioPath)}`);
  }
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: withApiHeaders(),
      }, DOWNLOAD_TIMEOUT_MS, options?.signal);
      if (!res.ok) {
        throw new Error(`downloadAudio failed: ${res.status} ${res.statusText}`);
      }
      return await res.blob();
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
      if (attempt < DOWNLOAD_RETRIES) {
        await sleep(500 * attempt);
        continue;
      }
    }
  }

  if (isAbortError(lastError)) {
    if (options?.signal?.aborted) {
      throw lastError;
    }
    throw new Error('downloadAudio timed out');
  }
  throw lastError instanceof Error ? lastError : new Error('downloadAudio failed');
}

export async function generateTask(
  srcAudioBlob: Blob | null,
  params: AnyTaskParams | LegoTaskParams,
  options?: GenerateTaskOptions,
): Promise<GeneratedTaskAudio> {
  const results = await generateTaskBatch(srcAudioBlob, params, options);
  const first = results[0];
  if (!first) throw new Error('Generation completed but returned no outputs.');
  return first;
}

export async function generateTaskBatch(
  srcAudioBlob: Blob | null,
  params: AnyTaskParams | LegoTaskParams,
  options?: GenerateTaskOptions,
): Promise<GeneratedTaskAudio[]> {
  const releaseResp = await releaseTask(srcAudioBlob, params, { signal: options?.signal });
  const taskId = releaseResp.task_id;
  const start = Date.now();
  const maxWaitMs = options?.maxWaitMs ?? GENERATE_MAX_WAIT_MS;
  const pollIntervalMs = options?.pollIntervalMs ?? GENERATE_POLL_INTERVAL_MS;
  let lastPollError: string | null = null;

  while (Date.now() - start < maxWaitMs) {
    await sleepWithAbort(pollIntervalMs, options?.signal);
    let entries;
    try {
      entries = await queryResult([taskId], { signal: options?.signal });
      lastPollError = null;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      lastPollError = error instanceof Error ? error.message : 'query_result failed';
      continue;
    }

    const entry = entries?.[0];
    if (!entry) continue;
    options?.onProgress?.(entry.progress_text || 'Generating...');

    if (entry.status === 2) {
      throw new Error(`Generation failed: ${entry.result}`);
    }
    if (entry.status !== 1) continue;

    const resultItems = parseTaskResultItems(entry.result);
    if (resultItems.length === 0) {
      throw new Error('Generation completed but returned no outputs.');
    }

    const results: GeneratedTaskAudio[] = [];
    for (const item of resultItems) {
      if (!item.file) continue;
      const audioBlob = await downloadAudio(item.file, { signal: options?.signal });
      results.push({
        audioBlob,
        metas: item.metas ?? {},
        seed_value: item.seed_value,
        dit_model: item.dit_model,
      });
    }
    if (results.length === 0) {
      throw new Error('No downloadable audio outputs were returned.');
    }
    return results;
  }

  throw new Error(lastPollError ? `Generation timed out (${lastPollError}).` : 'Generation timed out.');
}

export async function listLoras(): Promise<LoraInfo[]> {
  try {
    const res = await apiFetch('/v1/lora/status', { method: 'GET' });
    if (!res.ok) return [];
    const json = await res.json() as ApiEnvelope<Record<string, unknown>>;
    const data = json.data ?? {};
    const adapters = data.adapters;
    if (Array.isArray(adapters)) {
      return adapters
        .map((entry) => (typeof entry === 'string'
          ? { name: entry, has_weights: true } as LoraInfo
          : null))
        .filter((entry): entry is LoraInfo => entry !== null);
    }
    if (adapters && typeof adapters === 'object') {
      return Object.keys(adapters as Record<string, unknown>).map((name) => ({
        name,
        has_weights: true,
      }));
    }
    return [];
  } catch {
    return [];
  }
}
