import { TIME_SIGNATURES } from '../constants/tracks';
import type { TaskResultEntry } from '../types/api';

export interface ProjectStarterAnalysis {
  bpm: number | null;
  keyScale: string | null;
  timeSignature: number | null;
  rawTimeSignature: string | null;
}

interface RawResultItem {
  metas?: {
    bpm?: number | string;
    keyscale?: string;
    timesignature?: string | number;
  };
  bpm?: number | string;
  keyscale?: string;
  timesignature?: string | number;
  error?: string | null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTimeSignature(value: unknown): { numerator: number | null; raw: string | null } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return { numerator: TIME_SIGNATURES.includes(rounded) ? rounded : null, raw: String(rounded) };
  }

  const text = asNonEmptyString(value);
  if (!text) return { numerator: null, raw: null };

  const compact = text.replace(/\s+/g, '');
  const match = compact.match(/^(\d+)(?:\/(\d+))?$/);
  if (!match) return { numerator: null, raw: compact };

  const numerator = Number.parseInt(match[1], 10);
  if (!Number.isFinite(numerator)) return { numerator: null, raw: compact };

  return { numerator: TIME_SIGNATURES.includes(numerator) ? numerator : null, raw: compact };
}

function parseResultItems(result: unknown): RawResultItem[] {
  const normalize = (value: unknown): RawResultItem[] => {
    if (Array.isArray(value)) return value as RawResultItem[];
    if (value && typeof value === 'object') return [value as RawResultItem];
    return [];
  };

  if (typeof result === 'string') {
    try {
      return normalize(JSON.parse(result) as unknown);
    } catch {
      return [];
    }
  }

  return normalize(result);
}

export function parseErrorText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed) as { detail?: unknown; error?: unknown; message?: unknown };
    if (typeof parsed.detail === 'string' && parsed.detail.trim().length > 0) return parsed.detail.trim();
    if (typeof parsed.error === 'string' && parsed.error.trim().length > 0) return parsed.error.trim();
    if (typeof parsed.message === 'string' && parsed.message.trim().length > 0) return parsed.message.trim();
  } catch {
    // Keep raw text.
  }

  return trimmed;
}

export function summarizeAnalysisFailure(entry: TaskResultEntry): string {
  const parsed = parseResultItems(entry.result);
  const itemError = parsed.find((item) => asNonEmptyString(item.error))?.error;
  if (itemError && itemError.trim().length > 0) return itemError;
  if (entry.progress_text && entry.progress_text.trim().length > 0) return entry.progress_text.trim();
  return 'Audio analysis failed.';
}

export function toProjectStarterAnalysis(entry: TaskResultEntry): ProjectStarterAnalysis {
  const parsed = parseResultItems(entry.result);
  const item = parsed[0];
  const metas = item?.metas ?? {};
  const bpmCandidate = asFiniteNumber(item?.bpm) ?? asFiniteNumber(metas.bpm);
  const keyCandidate = asNonEmptyString(item?.keyscale) ?? asNonEmptyString(metas.keyscale);
  const timeSignatureCandidate = item?.timesignature ?? metas.timesignature;
  const normalizedTimeSignature = normalizeTimeSignature(timeSignatureCandidate);

  return {
    bpm: bpmCandidate === null ? null : Math.round(bpmCandidate),
    keyScale: keyCandidate,
    timeSignature: normalizedTimeSignature.numerator,
    rawTimeSignature: normalizedTimeSignature.raw,
  };
}
