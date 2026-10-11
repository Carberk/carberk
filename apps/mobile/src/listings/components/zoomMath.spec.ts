import { describe, expect, it } from "vitest";

import {
  MAX_ZOOM,
  clampScale,
  clampTranslation,
  doubleTapScale,
  fittedSize,
  focalTranslation,
} from "./zoomMath";

describe("photo zoom rules", () => {
  it("never zooms out past the fitted photo or in past the maximum", () => {
    expect(MAX_ZOOM).toBeGreaterThan(1);
    expect(clampScale(0.4)).toBe(1);
    expect(clampScale(1.7)).toBe(1.7);
    expect(clampScale(MAX_ZOOM * 3)).toBe(MAX_ZOOM);
  });

  it("keeps the fitted photo centred", () => {
    expect(clampTranslation(80, 1, 390)).toBe(0);
    expect(clampTranslation(-80, 1, 390)).toBe(0);
  });

  it("lets a zoomed photo pan only as far as its edges", () => {
    // At 3x a 300 pt side is 900 pt, so each edge may move 300 pt from centre.
    expect(clampTranslation(120, 3, 300)).toBe(120);
    expect(clampTranslation(450, 3, 300)).toBe(300);
    expect(clampTranslation(-450, 3, 300)).toBe(-300);
  });

  it("double-tap zooms a fitted photo in and a zoomed one back out", () => {
    const zoomedIn = doubleTapScale(1);
    expect(zoomedIn).toBeGreaterThan(1);
    expect(zoomedIn).toBeLessThanOrEqual(MAX_ZOOM);
    expect(doubleTapScale(zoomedIn)).toBe(1);
    expect(doubleTapScale(MAX_ZOOM)).toBe(1);
  });

  it("zooms around the point under the finger, so it stays where it was (#818)", () => {
    // A point 100 pt right of and 40 pt above centre, tapped on a fitted photo.
    const focal = 100;
    const zoomed = focalTranslation(focal, 1, 0, 2.5);
    // At 2.5x the content point under the finger sits at translation + 2.5 * point.
    expect(zoomed + 2.5 * focal).toBeCloseTo(focal);
    expect(focalTranslation(-40, 1, 0, 2.5) + 2.5 * -40).toBeCloseTo(-40);
  });

  it("keeps the focal point fixed when an already zoomed photo zooms further", () => {
    // At 2x shifted 30 pt, the content point under a finger 60 pt from centre is 15 pt.
    const next = focalTranslation(60, 2, 30, 3);
    expect(next + 3 * 15).toBeCloseTo(60);
  });

  it("fits a photo's contain rect inside the frame", () => {
    // A 3:2 photo in a 390 x 600 frame is as wide as the frame and 260 tall.
    expect(fittedSize(390, 600, 1.5)).toEqual({ width: 390, height: 260 });
    // A 3:4 photo would be 450 wide at the frame's height, so the width binds.
    expect(fittedSize(390, 600, 0.75)).toEqual({ width: 390, height: 520 });
    // A 1:2 photo is as tall as the frame.
    expect(fittedSize(390, 600, 0.5)).toEqual({ width: 300, height: 600 });
    // Without a known shape the photo fills the frame.
    expect(fittedSize(390, 600)).toEqual({ width: 390, height: 600 });
  });

  it("stops panning at the photo's edges, not the frame's, when the photo is letterboxed", () => {
    // A 260 pt tall photo in a 600 pt frame: at 2x it is 520 tall, still inside
    // the frame, so it cannot move up or down at all.
    expect(clampTranslation(80, 2, 260, 600)).toBe(0);
    // At 4x it is 1040 tall: 220 pt spill past each frame edge.
    expect(clampTranslation(500, 4, 260, 600)).toBe(220);
    expect(clampTranslation(-500, 4, 260, 600)).toBe(-220);
  });
});
