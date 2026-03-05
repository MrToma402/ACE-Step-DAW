import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';

export function Playhead() {
  const currentTime = useTransportStore((s) => s.currentTime);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const x = currentTime * pixelsPerSecond;

  return (
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
  );
}
