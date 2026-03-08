/**
 * Helpers for parsing audio-analysis metadata.
 */
export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => asStringList(item))
      .filter((item, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index);
  }

  if (typeof value !== 'string') return [];
  const text = value.trim();
  if (!text) return [];

  return text
    .split(/[;,|/]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Return only the first occurrence for each case-insensitive value.
 */
export function uniqueCaseInsensitive(items: string[]): string[] {
  const result: string[] = [];
  for (const item of items) {
    if (!result.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
      result.push(item);
    }
  }
  return result;
}

/**
 * Best-effort instrument extraction from caption/style text.
 */
export function extractInstrumentHints(texts: Array<string | null>): string[] {
  const haystack = texts.filter(Boolean).join(' ').toLowerCase();
  const hints: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\bpiano\b/, label: 'piano' },
    { pattern: /\bguitar\b/, label: 'guitar' },
    { pattern: /\bbass\b/, label: 'bass' },
    { pattern: /\bdrum(s)?\b/, label: 'drums' },
    { pattern: /\bpercussion\b/, label: 'percussion' },
    { pattern: /\bviolin\b/, label: 'violin' },
    { pattern: /\bcello\b/, label: 'cello' },
    { pattern: /\bstring(s)?\b/, label: 'strings' },
    { pattern: /\bsynth(esize?r)?\b/, label: 'synth' },
    { pattern: /\bpad(s)?\b/, label: 'pads' },
    { pattern: /\bsax(ophone)?\b/, label: 'saxophone' },
    { pattern: /\bflute\b/, label: 'flute' },
    { pattern: /\bclarinet\b/, label: 'clarinet' },
    { pattern: /\btrumpet\b/, label: 'trumpet' },
    { pattern: /\btrombone\b/, label: 'trombone' },
    { pattern: /\bbrass\b/, label: 'brass' },
    { pattern: /\bvocal(s)?\b/, label: 'vocals' },
    { pattern: /\bchoir\b/, label: 'choir' },
  ];

  return hints.filter((hint) => hint.pattern.test(haystack)).map((hint) => hint.label);
}
