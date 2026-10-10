const PHOTO_GRID_COLUMNS = 3;
const PHOTO_GRID_GAP = 8;

// The drag runs these on the UI thread, hence the worklet directives.

export function getPhotoTileSize(screenWidth: number): number {
  "worklet";
  return Math.max(84, Math.min(136, Math.floor((screenWidth - 56) / 3)));
}

export function getDragTargetIndex({
  fromIndex,
  dx,
  dy,
  count,
  tileSize,
}: {
  fromIndex: number;
  dx: number;
  dy: number;
  count: number;
  tileSize: number;
}): number {
  "worklet";
  const stride = tileSize + PHOTO_GRID_GAP;
  const fromColumn = fromIndex % PHOTO_GRID_COLUMNS;
  const fromRow = Math.floor(fromIndex / PHOTO_GRID_COLUMNS);
  const targetColumn = clamp(
    Math.round(fromColumn + dx / stride),
    0,
    PHOTO_GRID_COLUMNS - 1,
  );
  const targetRow = Math.max(0, Math.round(fromRow + dy / stride));
  return clamp(targetRow * PHOTO_GRID_COLUMNS + targetColumn, 0, count - 1);
}

export function reorderPhotoIdsByIndex(
  photoIds: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (fromIndex === toIndex) return photoIds;
  const next = [...photoIds];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return photoIds;
  next.splice(toIndex, 0, item);
  return next;
}

/** Where slot `index` sits, from the grid's top-left corner. */
export function slotOffset(index: number, tileSize: number): { x: number; y: number } {
  "worklet";
  const stride = tileSize + PHOTO_GRID_GAP;
  return {
    x: (index % PHOTO_GRID_COLUMNS) * stride,
    y: Math.floor(index / PHOTO_GRID_COLUMNS) * stride,
  };
}

/**
 * The slot photo `index` shows in while the photo from `fromIndex` is held
 * over `toIndex`: the photos between move one slot to make room. `-1` means
 * no drag.
 */
export function shiftedIndex(index: number, fromIndex: number, toIndex: number): number {
  "worklet";
  if (fromIndex < 0 || index === fromIndex) return index;
  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
  if (toIndex < fromIndex && index >= toIndex && index < fromIndex) return index + 1;
  return index;
}

function clamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.min(max, Math.max(min, value));
}
