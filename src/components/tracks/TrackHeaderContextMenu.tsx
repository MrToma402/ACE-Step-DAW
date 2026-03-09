interface TrackHeaderContextMenuProps {
  x: number;
  y: number;
  canExtract: boolean;
  onExtract: () => void;
  deleteLabel: string;
  onDelete: () => void;
  onClose: () => void;
}

export function TrackHeaderContextMenu({
  x,
  y,
  canExtract,
  onExtract,
  deleteLabel,
  onDelete,
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
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onExtract();
          }}
          disabled={!canExtract}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors disabled:text-slate-700 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">call_split</span>
          Extract To Tracks
        </button>
        <div className="my-1 border-t border-daw-border" />
        <button
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete();
          }}
          className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/20 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">delete</span>
          {deleteLabel} (Shift+Delete)
        </button>
      </div>
    </>
  );
}
