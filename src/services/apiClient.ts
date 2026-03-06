const env = import.meta.env as Record<string, string | undefined>;

const rawApiBase =
  env.VITE_ACESTEP_API_BASE?.trim() ||
  'http://localhost:7860';

const API_BASE = rawApiBase.replace(/\/+$/, '');
const API_KEY = env.VITE_ACESTEP_API_KEY?.trim() || '';

function toHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  if (API_KEY && !merged.has('Authorization')) {
    merged.set('Authorization', `Bearer ${API_KEY}`);
  }
  return merged;
}

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

export function withApiHeaders(headers?: HeadersInit): Headers {
  return toHeaders(headers);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = toHeaders(init.headers);
  return fetch(buildApiUrl(path), {
    ...init,
    headers,
  });
}
