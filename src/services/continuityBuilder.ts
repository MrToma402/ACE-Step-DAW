import type { SongSection, StyleLockStrength } from '../features/arrangement/types';

interface ContinuityPromptArgs {
  globalBrief: string;
  section: SongSection;
  sectionPrompt: string;
  previousSectionSummary?: string | null;
  languageHint?: string | null;
  bpm?: number | null;
  keyScale?: string | null;
  timeSignature?: number | null;
  styleLock: StyleLockStrength;
}

function styleInstruction(lock: StyleLockStrength): string {
  if (lock === 'soft') return 'Keep broad genre continuity with tasteful variation.';
  if (lock === 'strict') return 'Preserve timbre, harmony, groove, and vocal identity with minimal drift.';
  return 'Maintain a coherent style while allowing moderate section contrast.';
}

export function buildContinuityPrompt(args: ContinuityPromptArgs): string {
  const lines: string[] = [];
  if (args.globalBrief.trim()) {
    lines.push(`Global song brief: ${args.globalBrief.trim()}`);
  }
  lines.push(`Section: ${args.section.name} (${args.section.kind.replace('_', ' ')}).`);
  if (args.sectionPrompt.trim()) {
    lines.push(`Section intent: ${args.sectionPrompt.trim()}`);
  }
  if (args.section.lyricBlock.trim()) {
    lines.push(`Section lyrics block:\n${args.section.lyricBlock.trim()}`);
  }
  if (args.previousSectionSummary?.trim()) {
    lines.push(`Previous selected section summary: ${args.previousSectionSummary.trim()}`);
  }
  if (args.bpm != null) lines.push(`Tempo anchor: ${args.bpm} BPM.`);
  if (args.keyScale) lines.push(`Key anchor: ${args.keyScale}.`);
  if (args.timeSignature != null) lines.push(`Time signature anchor: ${args.timeSignature}/4.`);
  if (args.languageHint?.trim()) lines.push(`Language anchor: ${args.languageHint.trim()}.`);
  lines.push(`Continuity policy: ${styleInstruction(args.styleLock)}`);
  lines.push('Output should transition naturally from prior context and feel like the same song.');
  return lines.join('\n');
}
