export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds / 60) * bpm;
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats / bpm) * 60;
}

export function secondsToBarsBeats(
  seconds: number,
  bpm: number,
  timeSignature: number,
): { bars: number; beats: number; ticks: number } {
  const totalBeats = secondsToBeats(seconds, bpm);
  const bars = Math.floor(totalBeats / timeSignature) + 1;
  const beats = Math.floor(totalBeats % timeSignature) + 1;
  const ticks = Math.round((totalBeats % 1) * 100);
  return { bars, beats, ticks };
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
}

export function formatBarsBeats(
  seconds: number,
  bpm: number,
  timeSignature: number,
): string {
  const { bars, beats, ticks } = secondsToBarsBeats(seconds, bpm, timeSignature);
  return `${bars}.${beats}.${ticks.toString().padStart(2, '0')}`;
}

export function normalizeSeconds(value: number, precision: number = 3): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function snapToGrid(
  time: number,
  bpm: number,
  division: number = 1, // 1 = beat, 0.5 = half beat, 0.25 = 16th note
): number {
  const beatDuration = 60 / bpm;
  const gridSize = beatDuration * division;
  return normalizeSeconds(Math.round(time / gridSize) * gridSize);
}

export function getBarDuration(bpm: number, timeSignature: number): number {
  return (60 / bpm) * timeSignature;
}

export function getBeatDuration(bpm: number): number {
  return 60 / bpm;
}
