export type LaneEmptyDragAction = 'createClip' | 'selectClips';

/**
 * Resolve empty-lane gesture behavior from movement state.
 */
export function resolveLaneEmptyDragAction(dragMoved: boolean): LaneEmptyDragAction {
  return dragMoved ? 'selectClips' : 'createClip';
}
