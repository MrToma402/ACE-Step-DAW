export type DuplicateShortcutAction = 'duplicate' | 'duplicate_to_new_layer';

interface DuplicateShortcutEventLike {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Resolve duplicate-related shortcut actions from a keyboard event.
 */
export function resolveDuplicateShortcutAction(
  event: DuplicateShortcutEventLike,
): DuplicateShortcutAction | null {
  if (event.code !== 'KeyD') return null;
  if (!event.ctrlKey || event.altKey || event.metaKey) return null;
  return event.shiftKey ? 'duplicate_to_new_layer' : 'duplicate';
}
