/** Task types supported by ACE-Step 1.5 */
export type TaskType =
  | 'text2music'
  | 'cover'
  | 'repaint'
  | 'lego'
  | 'vocal2bgm'
  | 'extract'
  | 'complete'
  | 'audio_understanding';

/** Base generation params shared by all task types */
export interface BaseTaskParams {
  task_type: TaskType;
  prompt: string;
  lyrics: string;
  audio_duration: number;
  bpm: number | null;           // null = ACE-Step auto-infers
  key_scale: string;            // "" = ACE-Step auto-infers
  time_signature: string;       // "" = ACE-Step auto-infers
  inference_steps: number;
  guidance_scale: number;
  shift: number;
  batch_size: number;
  audio_format: 'wav' | 'mp3';
  thinking: boolean;
  model: string;                // DiT model: turbo (default), sft, base, turbo-shift1, turbo-shift3
  sample_mode?: boolean;
  sample_query?: string;
  use_format?: boolean;

  // CoT sub-controls (when thinking=true)
  use_cot_caption?: boolean;    // Let LM optimize/expand your caption
  use_cot_metas?: boolean;      // Let LM auto-infer BPM, key, etc.
  use_cot_language?: boolean;   // Let LM auto-detect vocal language

  // LM model and parameters
  lm_model?: string;            // none, 0.6B, 1.7B, 4B
  lm_temperature?: number;      // 0.0-2.0, default 0.85. Higher = more creative
  lm_top_k?: number;            // 0 = disabled
  lm_top_p?: number;            // nucleus sampling, default 0.9
  lm_cfg_scale?: number;        // LM CFG strength, default 2.0
  lm_negative_prompt?: string;  // tells LM what NOT to generate

  // Audio control
  audio_cover_strength?: number; // 0.0-1.0, controls how closely to follow source audio (Cover mode)
  vocal_language?: string;       // vocal language hint

  // Advanced DiT params
  use_adg?: boolean;            // Adaptive Dual Guidance (Base model only)
  infer_method?: 'ode' | 'sde'; // ode=deterministic, sde=more random
  seed?: string | number;       // Optional fixed seed for reproducible generation
}

/** Lego (multi-track) task - used by DAW timeline */
export interface LegoTaskParams extends BaseTaskParams {
  task_type: 'lego';
  track_name: string;
  instruction: string;
  repainting_start: number;
  repainting_end: number;
}

/** Text2Music - generate from text prompt + lyrics */
export interface Text2MusicTaskParams extends BaseTaskParams {
  task_type: 'text2music';
}

/** Cover - create cover from reference audio */
export interface CoverTaskParams extends BaseTaskParams {
  task_type: 'cover';
}

/** Repaint - selective region editing */
export interface RepaintTaskParams extends BaseTaskParams {
  task_type: 'repaint';
  repainting_start: number;
  repainting_end: number;
}

/** Vocal2BGM - generate accompaniment for vocal track */
export interface Vocal2BGMTaskParams extends BaseTaskParams {
  task_type: 'vocal2bgm';
}

/** Extract - track separation into stems */
export interface ExtractTaskParams extends BaseTaskParams {
  task_type: 'extract';
  track_name: string;
}

/** Complete - extend/complete partial audio */
export interface CompleteTaskParams extends BaseTaskParams {
  task_type: 'complete';
}

/** Audio Understanding - extract metadata from audio */
export interface AudioUnderstandingTaskParams {
  task_type: 'audio_understanding';
}

/** Union of all task param types */
export type AnyTaskParams =
  | LegoTaskParams
  | Text2MusicTaskParams
  | CoverTaskParams
  | RepaintTaskParams
  | Vocal2BGMTaskParams
  | ExtractTaskParams
  | CompleteTaskParams
  | AudioUnderstandingTaskParams;

/** All API responses are wrapped in this envelope */
export interface ApiEnvelope<T> {
  data: T;
  code: number;
  error: string | null;
  timestamp: number;
  extra: unknown;
}

export interface ReleaseTaskResponse {
  task_id: string;
  status: string;
  queue_position?: number;
}

export interface TaskResultEntry {
  task_id: string;
  status: number; // 0=processing, 1=done, 2=error
  result: string; // JSON string: array of TaskResultItem
  progress_text: string;
}

/** Individual item inside the result JSON array */
export interface TaskResultItem {
  file: string;       // audio file path on the server
  wave: string;
  status: number;
  create_time: number;
  env: string;
  prompt: string;
  lyrics: string;
  metas: {
    bpm?: number;
    duration?: number;
    genres?: string;
    keyscale?: string;
    timesignature?: string;
    caption?: string;
  };
  seed_value?: string;
  generation_info?: string;
  lm_model?: string;
  dit_model?: string;
}

export interface HealthResponse {
  status: string;
}

export interface ModelEntry {
  name: string;
  is_default: boolean;
}

export interface ModelsListResponse {
  models: ModelEntry[];
  default_model: string | null;
}

export interface StatsResponse {
  queue_size: number;
  running_tasks: number;
}
