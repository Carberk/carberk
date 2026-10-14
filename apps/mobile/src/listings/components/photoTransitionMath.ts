/** Rectangles use window coordinates until converted into the Modal root. */
export interface PhotoRect { x: number; y: number; width: number; height: number }
export interface PhotoGeometry { tile: PhotoRect; visible: PhotoRect; radii: readonly [number, number, number, number]; uri: string; ratio: number }
export function coverRect(frame: PhotoRect, ratio: number): PhotoRect {
  "worklet";
  const width = Math.max(frame.width, frame.height * ratio);
  const height = width / ratio;
  return { x: frame.x + (frame.width - width) / 2, y: frame.y + (frame.height - height) / 2, width, height };
}
export function containRect(frame: PhotoRect, ratio: number): PhotoRect {
  "worklet";
  const width = Math.min(frame.width, frame.height * ratio);
  const height = width / ratio;
  return { x: frame.x + (frame.width - width) / 2, y: frame.y + (frame.height - height) / 2, width, height };
}
export function intersectRect(a: PhotoRect, b: PhotoRect): PhotoRect {
  "worklet";
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}
export function toModalRect(rect: PhotoRect, origin: { x: number; y: number }): PhotoRect {
  "worklet";
  return { ...rect, x: rect.x - origin.x, y: rect.y - origin.y };
}
export function lerpRect(a: PhotoRect, b: PhotoRect, t: number): PhotoRect {
  "worklet";
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, width: a.width + (b.width - a.width) * t, height: a.height + (b.height - a.height) * t };
}
export function visibleFraction(geometry: PhotoGeometry): number {
  "worklet";
  return geometry.visible.width * geometry.visible.height / (geometry.tile.width * geometry.tile.height);
}
export function returnMode(geometry?: PhotoGeometry | null): "fly" | "fade" {
  "worklet";
  return geometry && visibleFraction(geometry) >= 0.3 ? "fly" : "fade";
}
export function clippedRadii(tile: PhotoRect, visible: PhotoRect, radii: PhotoGeometry["radii"]): PhotoGeometry["radii"] {
  "worklet";
  const left = visible.x <= tile.x, right = visible.x + visible.width >= tile.x + tile.width;
  const top = visible.y <= tile.y, bottom = visible.y + visible.height >= tile.y + tile.height;
  return [left && top ? radii[0] : 0, right && top ? radii[1] : 0, right && bottom ? radii[2] : 0, left && bottom ? radii[3] : 0];
}
export function dismissDecision(y: number, velocity: number, height: number): boolean {
  "worklet";
  return Math.abs(y) > height * 0.15 || (Math.abs(velocity) > 800 && y * velocity > 0);
}
export function dragRect(rect: PhotoRect, x: number, y: number, height: number): PhotoRect {
  "worklet";
  const scale = 1 - 0.25 * Math.min(Math.abs(y) / height, 1);
  return { x: rect.x + x + rect.width * (1 - scale) / 2, y: rect.y + y + rect.height * (1 - scale) / 2, width: rect.width * scale, height: rect.height * scale };
}
export function minimalStripOffset(index: number, current: number, width: number, gap: number, inset: number, viewport: number, content: number): number {
  "worklet";
  const left = inset + index * (width + gap), right = left + width;
  const next = left < current + inset ? left - inset : right > current + viewport - inset ? right - viewport + inset : current;
  return Math.max(0, Math.min(next, Math.max(0, content - viewport)));
}
