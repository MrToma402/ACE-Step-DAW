import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';

export function Playhead() {
  const currentTime = useTransportStore((s) => s.currentTime);
  const loopStart = useTransportStore((s) => s.loopStart);
  const loopEnd = useTransportStore((s) => s.loopEnd);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const x = currentTime * pixelsPerSecond;
  const hasLoopRegion = loopEnd > loopStart;
  const regionLeft = loopStart * pixelsPerSecond;
  const regionWidth = Math.max(0, (loopEnd - loopStart) * pixelsPerSecond);

  return (
    <>
      {hasLoopRegion && (
        <div
          className="absolute top-0 bottom-0 bg-daw-accent/10 border-x border-daw-accent/35 pointer-events-none z-10"
          style={{ left: regionLeft, width: regionWidth }}
        />
      )}
      <div
        className="absolute top-0 bottom-0 w-px bg-daw-accent z-30 pointer-events-none"
        style={{
          left: 0,
          transform: `translate3d(${x}px, 0, 0)`,
          willChange: 'transform',
          boxShadow: '0 0 8px rgba(59, 130, 246, 0.6)',
        }}
      >
        <div className="absolute -top-1 -translate-x-1/2 text-daw-accent">
          <span className="material-symbols-outlined text-base">arrow_drop_down</span>
        </div>
      </div>
    </>
  );
}
