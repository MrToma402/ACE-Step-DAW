import { MAX_POLL_DURATION_MS, POLL_INTERVAL_MS } from '../constants/defaults';
import { queryResult } from './aceStepApi';
import { buildApiUrl, withApiHeaders } from './apiClient';
import {
  parseErrorText,
  summarizeAnalysisFailure,
  toProjectStarterAnalysis,
  type ProjectStarterAnalysis,
} from './projectStarterAnalysisParsing';
import type { ReleaseTaskResponse } from '../types/api';

const START_REQUEST_TIMEOUT_MS = 5 * 60_000;

class AnalysisStartError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AnalysisStartError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function buildAnalysisFormData(file: File, taskType: 'extract' | 'text2music'): FormData {
  const formData = new FormData();
  formData.append('task_type', taskType);
  formData.append('prompt', '');
  formData.append('lyrics', '');
  formData.append('vocal_language', 'unknown');
  formData.append('audio_format', 'mp3');
  formData.append('full_analysis_only', 'true');
  formData.append('thinking', 'false');
  formData.append('param_obj', JSON.stringify({ batch_size: 1 }));
  if (taskType === 'extract') {
    formData.append('track_name', 'vocals');
    formData.append('instruction', 'Extract the VOCALS track from the audio:');
  }
  // Include both aliases for broader backend compatibility.
  formData.append('src_audio', file);
  formData.append('ctx_audio', file);
  return formData;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = value.indexOf(',');
      if (commaIndex < 0) {
        reject(new Error('Failed to encode audio for analysis.'));
        return;
      }
      resolve(value.slice(commaIndex + 1));
    };
    reader.onerror = () => {
      reject(new Error('Failed to encode audio for analysis.'));
    };
    reader.readAsDataURL(file);
  });
}

async function submitReleaseTask(formData: FormData): Promise<ReleaseTaskResponse> {
  let response: Response;
  try {
    response = await fetchWithTimeout(buildApiUrl('/release_task'), {
      method: 'POST',
      headers: withApiHeaders(),
      body: formData,
    }, START_REQUEST_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const seconds = Math.floor(START_REQUEST_TIMEOUT_MS / 1000);
      throw new AnalysisStartError(0, `analysis request timed out after ${seconds}s while uploading/starting`);
    }
    const message = error instanceof Error ? error.message : 'Request failed';
    throw new AnalysisStartError(0, `analysis request failed: ${message}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new AnalysisStartError(response.status, parseErrorText(text));
  }

  const envelope = await response.json() as {
    data?: ReleaseTaskResponse;
    error?: string | null;
    detail?: string | null;
    message?: string | null;
  };
  if (!envelope.data?.task_id) {
    const detail = envelope.error?.trim() || envelope.detail?.trim() || envelope.message?.trim() || 'missing task id';
    throw new Error(`Failed to start analysis: ${detail}`);
  }
  return envelope.data;
}

async function submitReleaseTaskJsonBase64(file: File, taskType: 'extract' | 'text2music'): Promise<ReleaseTaskResponse> {
  const srcAudioBase64 = await fileToBase64(file);
  const payload: Record<string, unknown> = {
    task_type: taskType,
    prompt: '',
    lyrics: '',
    vocal_language: 'unknown',
    audio_format: 'mp3',
    batch_size: 1,
    full_analysis_only: true,
    thinking: false,
    src_audio_base64: srcAudioBase64,
  };
  if (taskType === 'extract') {
    payload.track_name = 'vocals';
    payload.instruction = 'Extract the VOCALS track from the audio:';
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(buildApiUrl('/release_task'), {
      method: 'POST',
      headers: withApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    }, START_REQUEST_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const seconds = Math.floor(START_REQUEST_TIMEOUT_MS / 1000);
      throw new AnalysisStartError(0, `analysis request timed out after ${seconds}s while uploading/starting`);
    }
    const message = error instanceof Error ? error.message : 'Request failed';
    throw new AnalysisStartError(0, `analysis request failed: ${message}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new AnalysisStartError(response.status, parseErrorText(text));
  }

  const envelope = await response.json() as {
    data?: ReleaseTaskResponse;
    error?: string | null;
    detail?: string | null;
    message?: string | null;
  };
  if (!envelope.data?.task_id) {
    const detail = envelope.error?.trim() || envelope.detail?.trim() || envelope.message?.trim() || 'missing task id';
    throw new Error(`Failed to start analysis: ${detail}`);
  }
  return envelope.data;
}

async function releaseAudioAnalysisTask(file: File): Promise<ReleaseTaskResponse> {
  try {
    return await submitReleaseTask(buildAnalysisFormData(file, 'text2music'));
  } catch (error) {
    // Some backends reject text2music+src_audio for analysis. Retry extract mode.
    if (error instanceof AnalysisStartError && error.status === 400) {
      try {
        return await submitReleaseTask(buildAnalysisFormData(file, 'extract'));
      } catch (secondError) {
        if (secondError instanceof AnalysisStartError && secondError.status === 400) {
          return submitReleaseTaskJsonBase64(file, 'text2music');
        }
        throw secondError;
      }
    }
    throw error;
  }
}

export { type ProjectStarterAnalysis };

export async function analyzeProjectStarterAudio(
  file: File,
  onProgress?: (message: string) => void,
): Promise<ProjectStarterAnalysis> {
  const releaseResponse = await releaseAudioAnalysisTask(file);
  const taskId = releaseResponse.task_id;
  const startTime = Date.now();

  onProgress?.('Queued for analysis...');

  while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
    await sleep(POLL_INTERVAL_MS);

    const entries = await queryResult([taskId]);
    const entry = entries?.[0];
    if (!entry) continue;

    onProgress?.(entry.progress_text?.trim() || 'Analyzing audio...');

    if (entry.status === 1) return toProjectStarterAnalysis(entry);
    if (entry.status === 2) throw new Error(summarizeAnalysisFailure(entry));
  }

  throw new Error('Analysis timed out.');
}
