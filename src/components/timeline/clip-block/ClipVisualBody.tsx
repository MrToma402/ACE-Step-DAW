import type { Clip } from '../../../types/project';

export interface WaveformBar {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RepaintSelectionMeta {
  startTime: number;
  endTime: number;
  duration: number;
}

export interface ActiveJobRegion {
  leftPx: number;
  widthPx: number;
}

interface ClipVisualBodyProps {
  clip: Clip;
  trackColor: string;
  shouldShowWaveform: boolean;
  numBars: number;
  waveformWidthPx: number;
  waveformBars: WaveformBar[];
  extensionWidthPx: number;
  repaintSelectionPx: { start: number; end: number } | null;
  repaintSelectionMeta: RepaintSelectionMeta | null;
  isArrangementClip: boolean;
  arrangementSelected: boolean;
  activeJobRepaintRegionPx: ActiveJobRegion | null;
  compactStatusLabel: string | null;
}

export function ClipVisualBody({
  clip,
  trackColor,
  shouldShowWaveform,
  numBars,
  waveformWidthPx,
  waveformBars,
  extensionWidthPx,
  repaintSelectionPx,
  repaintSelectionMeta,
  isArrangementClip,
  arrangementSelected,
  activeJobRepaintRegionPx,
  compactStatusLabel,
}: ClipVisualBodyProps) {
  return (
    <>
      {shouldShowWaveform && (
        <div className="absolute inset-0 overflow-hidden">
          {numBars > 0 && (
            <svg
              width={waveformWidthPx}
              height="100%"
              viewBox={`0 0 ${waveformWidthPx} 100`}
              preserveAspectRatio="none"
              className="opacity-50 ml-0.5"
            >
              {waveformBars.map((bar, i) => (
                <rect
                  key={i}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  fill={trackColor}
                />
              ))}
            </svg>
          )}
          {extensionWidthPx > 1 && (
            <div
              className="absolute top-0 bottom-0 bg-black/20 border-l border-white/10"
              style={{ left: waveformWidthPx + 0.5, width: extensionWidthPx }}
            />
          )}
        </div>
      )}

      <div className="absolute top-1.5 left-2 right-1.5 text-[9px] font-bold text-slate-400 truncate leading-none z-10 pointer-events-none">
        {clip.prompt || '(no prompt)'}
      </div>

      {repaintSelectionPx && (
        <div
          className="absolute top-0 bottom-0 bg-amber-400/25 border-x border-amber-300/70 pointer-events-none z-20"
          style={{
            left: Math.min(repaintSelectionPx.start, repaintSelectionPx.end),
            width: Math.max(1, Math.abs(repaintSelectionPx.end - repaintSelectionPx.start)),
          }}
        >
          {repaintSelectionMeta && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-semibold text-amber-200 whitespace-nowrap px-1 py-0.5 rounded bg-black/50 border border-amber-200/30">
              {repaintSelectionMeta.startTime.toFixed(2)}s - {repaintSelectionMeta.endTime.toFixed(2)}s ({repaintSelectionMeta.duration.toFixed(2)}s)
            </div>
          )}
        </div>
      )}

      {isArrangementClip && (
        <div
          className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold ${
            arrangementSelected ? 'bg-emerald-900/40 text-emerald-300' : 'bg-zinc-900/60 text-zinc-400'
          }`}
        >
          {arrangementSelected ? 'Selected Take' : 'Inactive Take'}
        </div>
      )}

      {clip.generationStatus === 'generating' && (
        activeJobRepaintRegionPx ? (
          <div
            className="absolute top-0 bottom-0 pointer-events-none bg-black/25 border-x border-daw-accent/45 z-20 flex items-center justify-center"
            style={{
              left: activeJobRepaintRegionPx.leftPx,
              width: activeJobRepaintRegionPx.widthPx,
            }}
          >
            <div className="flex flex-col items-center gap-1 px-1">
              <div className="w-4 h-4 border-2 border-daw-accent border-t-transparent rounded-full animate-spin" />
              {compactStatusLabel && (
                <div className="text-[8px] font-semibold text-daw-accent/95 whitespace-nowrap px-1 py-0.5 rounded bg-black/45 border border-daw-accent/30">
                  {compactStatusLabel}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
            <div className="flex flex-col items-center gap-1">
              <div className="w-4 h-4 border-2 border-daw-accent border-t-transparent rounded-full animate-spin" />
              {compactStatusLabel && (
                <div className="text-[8px] font-semibold text-daw-accent/95 whitespace-nowrap px-1 py-0.5 rounded bg-black/45 border border-daw-accent/30">
                  {compactStatusLabel}
                </div>
              )}
            </div>
          </div>
        )
      )}
      {clip.generationStatus === 'processing' && activeJobRepaintRegionPx && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none bg-black/20 border-x border-emerald-300/45 z-20"
          style={{
            left: activeJobRepaintRegionPx.leftPx,
            width: activeJobRepaintRegionPx.widthPx,
          }}
        />
      )}
      {clip.generationStatus === 'queued' && activeJobRepaintRegionPx && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none bg-black/15 border-x border-slate-300/40 z-20"
          style={{
            left: activeJobRepaintRegionPx.leftPx,
            width: activeJobRepaintRegionPx.widthPx,
          }}
        />
      )}
      {clip.generationStatus === 'queued' && compactStatusLabel && (
        <div className="absolute bottom-1 left-2 text-[8px] text-slate-300 truncate pointer-events-none">
          {compactStatusLabel}
        </div>
      )}
      {clip.generationStatus === 'processing' && compactStatusLabel && (
        <div className="absolute bottom-1 left-2 text-[8px] text-emerald-300 truncate pointer-events-none">
          {compactStatusLabel}
        </div>
      )}
      {clip.generationStatus === 'error' && (
        <div className="absolute bottom-1 left-2 text-[8px] text-red-400 truncate pointer-events-none">
          Error
        </div>
      )}
      {clip.generationStatus === 'ready' && clip.inferredMetas && (
        <div className="absolute bottom-1 left-2 right-1.5 text-[8px] text-slate-600 truncate pointer-events-none">
          {[
            clip.inferredMetas.bpm != null ? `${clip.inferredMetas.bpm}bpm` : null,
            clip.inferredMetas.keyScale || null,
          ].filter(Boolean).join(' | ')}
        </div>
      )}
    </>
  );
}
