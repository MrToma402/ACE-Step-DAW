import { TRACK_CATALOG } from '../constants/tracks';
import type { Clip, Track, TrackName } from '../types/project';

interface TrackPromptProfile {
  instruction: string;
  role: string;
  tone: string;
  arrangement: string;
}

interface LegoPromptContent {
  instruction: string;
  prompt: string;
}

interface BuildLegoPromptArgs {
  clip: Clip;
  track: Track;
  bpm: number | null;
  keyScale: string;
  timeSignature: string;
}

const TRACK_PROMPT_PROFILES: Partial<Record<TrackName, TrackPromptProfile>> = {
  drums: {
    instruction: 'Focus on pocket, dynamics, and transitions that anchor the arrangement.',
    role: 'Establish the groove foundation and rhythmic energy for the section.',
    tone: 'Punchy kit balance, controlled cymbals, and a clear kick-snare relationship.',
    arrangement: 'Support the song structure with fills and accents only where they help momentum.',
  },
  bass: {
    instruction: 'Lock tightly to the kick and harmonic rhythm while keeping the low end clean.',
    role: 'Provide supportive low-end movement and reinforce the root motion of the section.',
    tone: 'Focused bass fundamentals, defined note attacks, and an even low-end pocket.',
    arrangement: 'Avoid lead-like phrasing, excessive fills, or masking the kick drum unless the prompt asks for it.',
  },
  guitar: {
    instruction: 'Create a guitar part that complements the groove and leaves room for vocals and bass.',
    role: 'Add harmonic support, rhythmic drive, or melodic accents depending on the user brief.',
    tone: 'Intentional guitar tone with clear articulation, controlled sustain, and mix-ready midrange.',
    arrangement: 'Default to supportive accompaniment unless the prompt explicitly asks for a featured lead part.',
  },
  keyboard: {
    instruction: 'Use keyboards to reinforce harmony, rhythm, and emotional lift without overcrowding the mix.',
    role: 'Support the chord movement and widen the harmonic texture.',
    tone: 'Clear voicings, stable transients, and register choices that stay out of the bass and vocal lanes.',
    arrangement: 'Favor complementary voicings and rhythmic support over dense full-range layering.',
  },
  percussion: {
    instruction: 'Add auxiliary percussion that enhances groove and motion without fighting the drum kit.',
    role: 'Contribute motion, subdivision, and accent detail around the main kit.',
    tone: 'Tight transient detail with controlled brightness and natural movement.',
    arrangement: 'Use accents, shakers, and hand percussion selectively to increase momentum.',
  },
  strings: {
    instruction: 'Shape strings as supportive harmony and emotional lift that follow the section dynamics.',
    role: 'Provide sustained harmony, counterlines, or lifts that reinforce the song arc.',
    tone: 'Smooth ensemble tone with expressive phrasing and controlled upper-mid presence.',
    arrangement: 'Avoid overpowering the rhythm section unless the prompt specifically calls for a cinematic lead texture.',
  },
  synth: {
    instruction: 'Create a synth layer that fits the groove and harmonic space already present in the context.',
    role: 'Add texture, motion, pads, hooks, or supporting melodic detail as requested.',
    tone: 'Intentional synth character with controlled brightness, width, and low-end spill.',
    arrangement: 'Keep the part complementary to existing instruments and avoid unnecessary full-spectrum masking.',
  },
  fx: {
    instruction: 'Use effects and textures to support transitions, atmosphere, and depth.',
    role: 'Enhance space, movement, and section identity without distracting from the core arrangement.',
    tone: 'Controlled atmospheric textures with clear placement and tasteful decay.',
    arrangement: 'Prioritize subtle support and transition moments over constant foreground activity.',
  },
  brass: {
    instruction: 'Write brass that adds energy and emphasis while staying rhythmically tight.',
    role: 'Provide stabs, swells, countermelodies, or ensemble support that lift the arrangement.',
    tone: 'Bold but controlled ensemble tone with defined attacks and cohesive section blend.',
    arrangement: 'Use brass as punctuation or lift, not as constant full-range density, unless requested.',
  },
  woodwinds: {
    instruction: 'Shape woodwinds as expressive support or melodic color that sits naturally in the arrangement.',
    role: 'Contribute warmth, motion, and melodic contour around the core harmony.',
    tone: 'Breathy but focused timbre with natural phrasing and controlled dynamics.',
    arrangement: 'Favor complementary lines and phrase endings that avoid clashing with lead vocals.',
  },
  backing_vocals: {
    instruction: 'Generate backing vocals that support the lead and lock to the song language and harmony.',
    role: 'Reinforce hooks, widen choruses, and support key lyrical moments.',
    tone: 'Cohesive stacked voices with controlled blend, diction, and stereo spread.',
    arrangement: 'Keep harmonies supportive and avoid overshadowing the lead vocal line.',
  },
  vocals: {
    instruction: 'Generate a lead vocal performance that feels like the focal point of the arrangement.',
    role: 'Carry the primary melodic and lyrical narrative.',
    tone: 'Clear lead presence, controlled phrasing, and emotionally matched delivery.',
    arrangement: 'Stay front-and-center while remaining musically locked to the backing context.',
  },
};

function resolveTrackPromptProfile(trackName: TrackName, displayName: string): TrackPromptProfile {
  return TRACK_PROMPT_PROFILES[trackName] ?? {
    instruction: `Generate a ${displayName.toLowerCase()} part that fits the existing context naturally.`,
    role: `Provide a clear ${displayName.toLowerCase()} layer that supports the song.`,
    tone: `Deliver a mix-ready ${displayName.toLowerCase()} tone with intentional articulation.`,
    arrangement: 'Keep the part complementary to the existing instruments and avoid unnecessary clutter.',
  };
}

function appendSentence(lines: string[], label: string, value: string | null): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  lines.push(`${label}: ${trimmed}${trimmed.endsWith('.') ? '' : '.'}`);
}

export function buildLegoPromptContent(args: BuildLegoPromptArgs): LegoPromptContent {
  const trackInfo = TRACK_CATALOG[args.track.trackName];
  const profile = resolveTrackPromptProfile(args.track.trackName, args.track.displayName);
  const promptLines: string[] = [];

  appendSentence(promptLines, 'Instrument anchor', trackInfo?.defaultPrompt ?? '');
  appendSentence(promptLines, 'Track role', profile.role);
  appendSentence(promptLines, 'Sound target', profile.tone);
  appendSentence(promptLines, 'Arrangement guidance', profile.arrangement);
  if (args.bpm != null) appendSentence(promptLines, 'Tempo anchor', `${args.bpm} BPM`);
  appendSentence(promptLines, 'Key anchor', args.keyScale);
  appendSentence(promptLines, 'Time signature anchor', args.timeSignature);
  appendSentence(promptLines, 'User brief', args.clip.prompt);
  if (args.clip.sampleMode) {
    appendSentence(
      promptLines,
      'Sample mode guidance',
      'Treat the user brief as a stem-specific sound-design target, not a full arrangement request',
    );
  }

  return {
    instruction: `Generate the ${args.track.trackName.toUpperCase().replace('_', ' ')} track based on the audio context. ${profile.instruction}`,
    prompt: promptLines.join('\n'),
  };
}
