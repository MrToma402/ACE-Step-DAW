const DRAG_BLOCK_TAGS = new Set([
  'BUTTON',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'LABEL',
]);

/**
 * Return whether dragging a track should be blocked for a tag name.
 */
export function shouldBlockTrackDragForTagName(tagName: string | null | undefined): boolean {
  if (!tagName) return false;
  return DRAG_BLOCK_TAGS.has(tagName.toUpperCase());
}
