import type { Clip, Track } from '../types/project';

interface LegoPromptContent {
  instruction: string;
  prompt: string;
}

interface BuildLegoPromptArgs {
  clip: Clip;
  track: Track;
}

function buildLegoInstruction(trackName: string): string {
  return `Generate the ${trackName.toUpperCase()} track based on the audio context:`;
}

function appendSentence(lines: string[], value: string | null): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  lines.push(`${trimmed}${trimmed.endsWith('.') ? '' : '.'}`);
}

export function buildLegoPromptContent(args: BuildLegoPromptArgs): LegoPromptContent {
  const promptLines: string[] = [];

  appendSentence(promptLines, args.clip.prompt);
  if (args.clip.sampleMode) {
    appendSentence(
      promptLines,
      'Stem-specific sound-design target, not a full arrangement request',
    );
  }

  return {
    instruction: buildLegoInstruction(args.track.trackName),
    prompt: promptLines.join('\n'),
  };
}
