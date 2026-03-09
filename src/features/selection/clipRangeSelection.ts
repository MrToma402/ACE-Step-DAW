interface ResolveClipRangeSelectionArgs {
  orderedClipIds: readonly string[];
  selectedClipIds: ReadonlySet<string>;
  targetClipId: string;
}

export function resolveClipRangeSelection({
  orderedClipIds,
  selectedClipIds,
  targetClipId,
}: ResolveClipRangeSelectionArgs): Set<string> {
  const targetIndex = orderedClipIds.indexOf(targetClipId);
  if (targetIndex < 0) return new Set([targetClipId]);

  let anchorIndex = -1;
  for (let index = 0; index < orderedClipIds.length; index += 1) {
    if (!selectedClipIds.has(orderedClipIds[index])) continue;
    anchorIndex = index;
    break;
  }

  if (anchorIndex < 0) return new Set([targetClipId]);

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return new Set(orderedClipIds.slice(start, end + 1));
}
