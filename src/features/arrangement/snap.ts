import type { GridResolution } from './types';
import { normalizeSeconds, snapToGrid } from '../../utils/time';

export function getGridDivision(resolution: GridResolution): number {
  if (resolution === '1_bar') return 4;
  if (resolution === '1_2') return 2;
  if (resolution === '1_8') return 0.5;
  if (resolution === '1_16') return 0.25;
  if (resolution === '1_32') return 0.125;
  return 1;
}

export function snapTime(
  time: number,
  bpm: number,
  snapEnabled: boolean,
  snapResolution: GridResolution,
): number {
  if (!snapEnabled) return normalizeSeconds(time);
  return snapToGrid(time, bpm, getGridDivision(snapResolution));
}
