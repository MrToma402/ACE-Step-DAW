import { apiFetch } from './apiClient';

interface ApiEnvelope<T> {
  data: T;
  code: number;
  error: string | null;
}

export interface TensorInfo {
  dataset_name: string;
  num_samples: number;
  custom_tag: string;
  tensor_dir: string;
  message: string;
}

export interface TrainingStatus {
  is_training: boolean;
  should_stop: boolean;
  current_step: number;
  current_loss: number | null;
  status: string;
  current_epoch: number;
  error: string | null;
  tensorboard_url?: string | null;
}

export interface StartLoraTrainingPayload {
  tensor_dir: string;
  lora_rank: number;
  lora_alpha: number;
  lora_dropout: number;
  learning_rate: number;
  train_epochs: number;
  train_batch_size: number;
  gradient_accumulation: number;
  save_every_n_epochs: number;
  training_shift: number;
  training_seed: number;
  lora_output_dir: string;
  use_fp8?: boolean;
  gradient_checkpointing?: boolean;
}

export interface UploadedTrainingAudioFile {
  name: string;
  data: string;
}

export interface UploadLoraTrainingPayload {
  lora_name: string;
  audio_files: UploadedTrainingAudioFile[];
  epochs: number;
  learning_rate: number;
  lora_rank: number;
  batch_size: number;
  save_every: number;
}

export interface UploadLoraTrainingResponse {
  status?: string;
  message?: string;
  task_id?: string;
}

export async function loadTrainingTensorInfo(tensorDir: string): Promise<TensorInfo> {
  const res = await apiFetch('/v1/training/load_tensor_info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tensor_dir: tensorDir }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load tensor info: ${res.status} - ${text}`);
  }

  const envelope = await res.json() as ApiEnvelope<TensorInfo>;
  if (envelope.code !== 200 || !envelope.data) {
    throw new Error(envelope.error || 'Failed to load tensor info.');
  }
  return envelope.data;
}

export async function startLoraTraining(payload: StartLoraTrainingPayload): Promise<string> {
  const res = await apiFetch('/v1/training/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to start training: ${res.status} - ${text}`);
  }

  const envelope = await res.json() as ApiEnvelope<{ message?: string }>;
  if (envelope.code !== 200) {
    throw new Error(envelope.error || 'Failed to start training.');
  }
  return envelope.data?.message || 'Training started';
}

export async function stopLoraTraining(): Promise<string> {
  const res = await apiFetch('/v1/training/stop', {
    method: 'POST',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to stop training: ${res.status} - ${text}`);
  }

  const envelope = await res.json() as ApiEnvelope<{ message?: string }>;
  if (envelope.code !== 200) {
    throw new Error(envelope.error || 'Failed to stop training.');
  }
  return envelope.data?.message || 'Stopping training...';
}

export async function getTrainingStatus(): Promise<TrainingStatus> {
  const res = await apiFetch('/v1/training/status', {
    method: 'GET',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch training status: ${res.status} - ${text}`);
  }

  const envelope = await res.json() as ApiEnvelope<TrainingStatus>;
  if (envelope.code !== 200 || !envelope.data) {
    throw new Error(envelope.error || 'Failed to fetch training status.');
  }
  return envelope.data;
}

export async function startUploadedLoraTraining(payload: UploadLoraTrainingPayload): Promise<UploadLoraTrainingResponse> {
  const res = await apiFetch('/api/modal/train', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_type: 'lora_training',
      ...payload,
    }),
  });

  const text = await res.text();
  let parsed: UploadLoraTrainingResponse = {};
  try {
    parsed = JSON.parse(text) as UploadLoraTrainingResponse;
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    throw new Error(`Failed to start training: ${res.status} - ${text}`);
  }

  return parsed;
}
