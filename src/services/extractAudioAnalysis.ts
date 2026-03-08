interface AudioStats {
  peak: number;
  rms: number;
}

function getAudioStats(buffer: AudioBuffer): AudioStats {
  let peak = 0;
  let sumSquares = 0;
  let sampleCount = 0;
  const stride = Math.max(1, Math.floor(buffer.length / 200_000));

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i += stride) {
      const sample = data[i];
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
      sumSquares += sample * sample;
      sampleCount += 1;
    }
  }

  const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
  return { peak, rms };
}

export function limitBufferPeak(buffer: AudioBuffer, targetPeak: number): void {
  const { peak } = getAudioStats(buffer);
  if (peak <= targetPeak || peak <= 0) return;
  const gain = targetPeak / peak;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }
}

export function hasAudibleContent(
  buffer: AudioBuffer,
  peakThreshold: number,
  rmsThreshold: number,
): boolean {
  const { peak, rms } = getAudioStats(buffer);
  return peak >= peakThreshold || rms >= rmsThreshold;
}
