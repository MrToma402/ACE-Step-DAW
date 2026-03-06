import type {
  LegoTaskParams,
  ApiEnvelope,
  ReleaseTaskResponse,
  TaskResultEntry,
  ModelsListResponse,
  StatsResponse,
} from '../types/api';
import { apiFetch, buildApiUrl } from './apiClient';

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
  const formData = new FormData();

  // Add the audio file
  formData.append('src_audio', srcAudioBlob, 'src_audio.wav');

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
    throw new Error(`releaseLegoTask failed: ${res.status} - ${text}`);
  }

  const envelope: ApiEnvelope<ReleaseTaskResponse> = await res.json();
  return envelope.data;
}

export async function queryResult(taskIds: string[]): Promise<TaskResultEntry[]> {
  const res = await apiFetch('/query_result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id_list: taskIds }),
  });

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
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`downloadAudio failed: ${res.status} ${res.statusText}`);
  return res.blob();
}
