/** How far a photo zooms in, as a multiple of its fitted size. */
export const MAX_ZOOM = 4;

const DOUBLE_TAP_ZOOM = 2.5;

/** A photo never shrinks below fitted size or grows past `MAX_ZOOM`. */
export function clampScale(scale: number): number {
  "worklet";
  return Math.min(Math.max(scale, 1), MAX_ZOOM);
}

/**
 * Keeps a zoomed photo's edge from coming inside the frame: at `scale` a
 * fitted side of `size` is `size * scale` long, so each edge may move at most
 * half of what spills past the `frame` side. A photo that still fits the
 * frame, such as a letterboxed one at low zoom, cannot move on that axis.
 */
export function clampTranslation(
  translation: number,
  scale: number,
  size: number,
  frame: number = size,
): number {
  "worklet";
  const limit = (size * scale - frame) / 2;
  if (limit <= 0) return 0;
  return Math.min(Math.max(translation, -limit), limit);
}

/** Double-tap zooms a fitted photo in and any zoomed photo back to fitted. */
export function doubleTapScale(current: number): number {
  "worklet";
  return current > 1 ? 1 : DOUBLE_TAP_ZOOM;
}

/**
 * The translation that keeps the content under `focal` in place while the
 * scale goes from `fromScale` to `toScale`. Both `focal` and the translations
 * are measured from the frame's centre, the point the scale grows from.
 */
export function focalTranslation(
  focal: number,
  fromScale: number,
  fromTranslation: number,
  toScale: number,
): number {
  "worklet";
  const contentPoint = (focal - fromTranslation) / fromScale;
  return focal - toScale * contentPoint;
}

/**
 * The size a photo of `aspectRatio` (width / height) is drawn at with
 * `contentFit="contain"` in the frame; the whole frame when the shape is not
 * known yet.
 */
export function fittedSize(
  frameWidth: number,
  frameHeight: number,
  aspectRatio?: number,
): { width: number; height: number } {
  "worklet";
  if (!aspectRatio || aspectRatio <= 0) return { width: frameWidth, height: frameHeight };
  if (frameWidth / frameHeight > aspectRatio) {
    return { width: frameHeight * aspectRatio, height: frameHeight };
  }
  return { width: frameWidth, height: frameWidth / aspectRatio };
}
