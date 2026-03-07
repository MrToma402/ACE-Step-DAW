import { hexToRgba } from '../../utils/color.ts';

const SECTION_PALETTE = [
  '#f97316',
  '#22c55e',
  '#3b82f6',
  '#eab308',
  '#ec4899',
  '#14b8a6',
  '#a855f7',
  '#ef4444',
  '#84cc16',
  '#06b6d4',
  '#fb7185',
  '#f59e0b',
];

interface SectionColorTone {
  baseHex: string;
  fill: string;
  border: string;
  label: string;
}

function hashSectionId(sectionId: string): number {
  let hash = 0;
  for (let i = 0; i < sectionId.length; i++) {
    hash = ((hash * 31) + sectionId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Return deterministic color tones for a section id.
 */
export function getSectionColorTone(sectionId: string): SectionColorTone {
  const colorIndex = hashSectionId(sectionId) % SECTION_PALETTE.length;
  const baseHex = SECTION_PALETTE[colorIndex];
  return {
    baseHex,
    fill: hexToRgba(baseHex, 0.2),
    border: hexToRgba(baseHex, 0.55),
    label: hexToRgba(baseHex, 0.95),
  };
}
