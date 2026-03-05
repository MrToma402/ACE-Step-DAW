import { audioBufferToWavBlob } from '../utils/wav';

interface ExportOptions {
  tonePreset?: 'clean' | 'punch' | 'warm';
  loudnessTarget?: '-18' | '-14' | '-10';
}

function loudnessGain(loudnessTarget: ExportOptions['loudnessTarget']): number {
  if (loudnessTarget === '-10') return 1.45;
  if (loudnessTarget === '-18') return 0.78;
  return 1;
}

function toneFiltersForPreset(
  ctx: OfflineAudioContext,
  preset: ExportOptions['tonePreset'],
): { input: GainNode; output: AudioNode } {
  const input = ctx.createGain();
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 160;
  lowShelf.gain.value = preset === 'warm' ? 2 : preset === 'punch' ? 1 : 0;

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 4500;
  highShelf.gain.value = preset === 'punch' ? 2.5 : preset === 'warm' ? -1 : 0;

  input.connect(lowShelf);
  lowShelf.connect(highShelf);
  return { input, output: highShelf };
}

export async function exportMixToWav(
  clips: Array<{ startTime: number; buffer: AudioBuffer; volume: number }>,
  totalDuration: number,
  sampleRate: number = 48000,
  options: ExportOptions = {},
): Promise<Blob> {
  const length = Math.ceil(totalDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = loudnessGain(options.loudnessTarget);
  const tone = toneFiltersForPreset(offlineCtx, options.tonePreset ?? 'clean');
  tone.output.connect(masterGain);
  masterGain.connect(offlineCtx.destination);

  for (const clip of clips) {
    const source = offlineCtx.createBufferSource();
    source.buffer = clip.buffer;

    const gain = offlineCtx.createGain();
    gain.gain.value = clip.volume;

    source.connect(gain);
    gain.connect(tone.input);
    source.start(clip.startTime);
  }

  const rendered = await offlineCtx.startRendering();
  return audioBufferToWavBlob(rendered);
}
