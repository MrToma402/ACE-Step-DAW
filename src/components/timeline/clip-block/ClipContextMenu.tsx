interface ClipContextMenuProps {
  x: number;
  y: number;
  onEdit: () => void;
  onGenerate: () => void;
  onPlayInIsolation: () => void;
  onCover: () => void;
  onDuplicate: () => void;
  onDuplicateToNewLayer: () => void;
  onExtractToTracks: () => void;
  canExtractToTracks: boolean;
  onMergeSelected: () => void;
  canMergeSelected: boolean;
  onDelete: () => void;
  deleteLabel: string;
  onClose: () => void;
  hasPrompt: boolean;
  hasReferenceAudio: boolean;
}

export function ClipContextMenu({
  x,
  y,
  onEdit,
  onGenerate,
  onPlayInIsolation,
  onCover,
  onDuplicate,
  onDuplicateToNewLayer,
  onExtractToTracks,
  canExtractToTracks,
  onMergeSelected,
  canMergeSelected,
  onDelete,
  deleteLabel,
  onClose,
  hasPrompt,
  hasReferenceAudio,
}: ClipContextMenuProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-50 bg-daw-panel border border-daw-border rounded shadow-2xl py-1 min-w-[220px]"
        style={{ left: x, top: y }}
      >
        <button
          onClick={onEdit}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">edit</span>
          Edit Clip
        </button>
        <button
          onClick={onGenerate}
          disabled={!hasPrompt}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors disabled:text-slate-700 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">auto_awesome</span>
          Generate
        </button>
        <button
          onClick={onPlayInIsolation}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">play_arrow</span>
          Play In Isolation (P)
        </button>
        <button
          onClick={onCover}
          disabled={!hasReferenceAudio}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors disabled:text-slate-700 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">mic</span>
          Cover
        </button>
        <button
          onClick={onDuplicate}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">content_copy</span>
          Duplicate (Ctrl+D)
        </button>
        <button
          onClick={onDuplicateToNewLayer}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">view_week</span>
          Duplicate to New Layer (Ctrl+Shift+D)
        </button>
        <button
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onExtractToTracks();
          }}
          disabled={!canExtractToTracks}
          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors disabled:text-slate-700 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">call_split</span>
          Extract To Tracks
        </button>
        {canMergeSelected && (
          <button
            onClick={onMergeSelected}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-xs">merge_type</span>
            Merge Selected (M)
          </button>
        )}
        <div className="my-1 border-t border-daw-border" />
        <button
          onClick={onDelete}
          className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/20 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xs">delete</span>
          {deleteLabel}
        </button>
      </div>
    </>
  );
}
