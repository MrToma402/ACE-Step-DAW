import type {
  AnyTaskParams,
  LegoTaskParams,
  ApiEnvelope,
  ReleaseTaskResponse,
  TaskResultEntry,
  ModelsListResponse,
  StatsResponse,
} from '../types/api';
import { apiFetch, buildApiUrl, withApiHeaders } from './apiClient';

const QUERY_TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 120000;
const DOWNLOAD_RETRIES = 3;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
): Promise<ReleaseTaskResponse> {
  return releaseTask(srcAudioBlob, params);
}

export async function releaseTask(
  srcAudioBlob: Blob | null,
  params: AnyTaskParams | LegoTaskParams,
): Promise<ReleaseTaskResponse> {
  const formData = new FormData();

  if (srcAudioBlob && srcAudioBlob.size > 0) {
    // Add the audio file
    formData.append('src_audio', srcAudioBlob, 'src_audio.wav');
    // Keep parity with JSON modal path for cover tasks.
    if (params.task_type === 'cover') {
      formData.append('reference_audio', srcAudioBlob, 'reference_audio.wav');
    }
  }

  // Add all params as form fields (skip null values — ACE-Step auto-infers them)
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    formData.append(key, String(value));
  }

  const res = await apiFetch('/release_task', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`releaseTask failed: ${res.status} - ${text}`);
  }

  const envelope: ApiEnvelope<ReleaseTaskResponse> = await res.json();
  return envelope.data;
}

export async function queryResult(taskIds: string[]): Promise<TaskResultEntry[]> {
  let res: Response;
  try {
    res = await fetchWithTimeout(buildApiUrl('/query_result'), {
      method: 'POST',
      headers: withApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ task_id_list: taskIds }),
    }, QUERY_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('queryResult timed out');
    }
    throw error;
  }

  if (!res.ok) throw new Error(`queryResult failed: ${res.status}`);
  const envelope: ApiEnvelope<TaskResultEntry[]> = await res.json();
  return envelope.data;
}

export async function downloadAudio(audioPath: string): Promise<Blob> {
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
      }, DOWNLOAD_TIMEOUT_MS);
      if (!res.ok) {
        throw new Error(`downloadAudio failed: ${res.status} ${res.statusText}`);
      }
      return await res.blob();
    } catch (error) {
      lastError = error;
      if (attempt < DOWNLOAD_RETRIES) {
        await sleep(500 * attempt);
        continue;
      }
    }
  }

  if (lastError instanceof DOMException && lastError.name === 'AbortError') {
    throw new Error('downloadAudio timed out');
  }
  throw lastError instanceof Error ? lastError : new Error('downloadAudio failed');
}
