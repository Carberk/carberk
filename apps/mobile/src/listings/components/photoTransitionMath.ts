/** Geometry in window coordinates until converted into the viewer Modal. */
export interface PhotoRect { x: number; y: number; width: number; height: number }
export function coverRect(_frame: PhotoRect, _ratio: number): PhotoRect { throw new Error("Cover-to-contain transition not implemented"); }
