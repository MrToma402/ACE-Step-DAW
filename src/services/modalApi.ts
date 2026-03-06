import { apiFetch } from './apiClient';
import { downloadAudio, queryResult } from './aceStepApi';
import type { AnyTaskParams, LegoTaskParams, TaskResultItem } from '../types/api';

const POLL_INTERVAL_MS = 1500;
const MAX_WAIT_MS = 10 * 60 * 1000;

interface ApiEnvelope<T> {
  data: T;
  code: number;
  error: string | null;
}

export interface ModalGenerationResult {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTaskResultItems(rawResult: string): TaskResultItem[] {
  try {
    const parsed = JSON.parse(rawResult) as unknown;
    return Array.isArray(parsed) ? (parsed as TaskResultItem[]) : [];
  } catch {
    return [];
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function buildGenerationBody(
  srcAudioBlob: Blob | null,
  params: AnyTaskParams | LegoTaskParams,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    body[key] = value;
  }

  if (srcAudioBlob && srcAudioBlob.size > 0) {
    const srcBase64 = await blobToBase64(srcAudioBlob);
    body.src_audio_base64 = srcBase64;
    if (body.task_type === 'cover') {
      body.reference_audio_base64 = srcBase64;
    }
  }

  return body;
}

async function startGeneration(body: Record<string, unknown>): Promise<string> {
  const res = await apiFetch('/release_task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Generation start failed: ${res.status} - ${text}`);
  }

  const envelope = await res.json() as ApiEnvelope<{ task_id?: string }>;
  const taskId = envelope.data?.task_id;
  if (!taskId) {
    throw new Error(`Generation start failed: ${envelope.error || 'missing task id'}`);
  }
  return taskId;
}

async function pollTaskItems(taskId: string): Promise<TaskResultItem[]> {
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const entries = await queryResult([taskId]);
    const entry = entries?.[0];
    if (!entry) continue;

    if (entry.status === 1) {
      const items = parseTaskResultItems(entry.result);
      if (items.length === 0) {
        throw new Error('Generation completed but returned no outputs.');
      }
      return items;
    }
    if (entry.status === 2) {
      throw new Error(`Generation failed: ${entry.result}`);
    }
  }

  throw new Error('Generation timed out.');
}

async function taskItemsToResults(items: TaskResultItem[]): Promise<ModalGenerationResult[]> {
  const results: ModalGenerationResult[] = [];
  for (const item of items) {
    if (!item.file) continue;
    const audioBlob = await downloadAudio(item.file);
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

export async function generateViaModal(
  srcAudioBlob: Blob | null,
  params: AnyTaskParams | LegoTaskParams,
): Promise<ModalGenerationResult> {
  const body = await buildGenerationBody(srcAudioBlob, params);
  const taskId = await startGeneration(body);
  const items = await pollTaskItems(taskId);
  const results = await taskItemsToResults(items);
  return results[0];
}

export async function generateBatchViaModal(
  srcAudioBlob: Blob | null,
  params: AnyTaskParams,
): Promise<ModalGenerationResult[]> {
  const body = await buildGenerationBody(srcAudioBlob, params);
  const taskId = await startGeneration(body);
  const items = await pollTaskItems(taskId);
  return taskItemsToResults(items);
}

export async function modalHealthCheck(): Promise<boolean> {
  try {
    const res = await apiFetch('/v1/lora/status', { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
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

