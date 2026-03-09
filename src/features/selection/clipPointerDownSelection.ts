type ClipDragMode = 'move' | 'resize-left' | 'resize-right';

interface ClipPointerDownSelectionArgs {
  mode: ClipDragMode;
  isSelected: boolean;
  additive: boolean;
}

/**
 * Returns true when pointer-down should replace clip selection immediately.
 */
export function shouldSelectClipOnPointerDown(
  args: ClipPointerDownSelectionArgs,
): boolean {
  return args.mode === 'move' && !args.isSelected && !args.additive;
}
