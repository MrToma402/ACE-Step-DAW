interface TrackHeaderContextMenuProps {
  x: number;
  y: number;
  canExtract: boolean;
  onExtract: () => void;
  onClose: () => void;
}

export function TrackHeaderContextMenu({
  x,
  y,
  canExtract,
  onExtract,
  onClose,
}: TrackHeaderContextMenuProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 bg-daw-panel border border-daw-border rounded shadow-2xl py-1 min-w-[220px]"
        style={{ left: x, top: y }}
      >
        <button
          onClick={onExtract}
          disabled={!canExtract}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors disabled:text-slate-700 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">call_split</span>
          Extract To Tracks
        </button>
      </div>
    </>
  );
}
