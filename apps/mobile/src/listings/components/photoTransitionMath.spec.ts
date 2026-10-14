import { expect, it } from "vitest";

import { coverRect , containRect, clippedRadii, intersectRect, lerpRect, dismissDecision, minimalStripOffset, returnMode, toModalRect } from "./photoTransitionMath";
it("reveals the full landscape photo beyond a centred 4:3 tile crop", () => {
  expect(coverRect({ x: 16, y: 80, width: 320, height: 240 }, 16 / 9)).toEqual({ x: -37.333333333333314, y: 80, width: 426.66666666666663, height: 240 });
});


it("keeps a portrait's natural aspect while revealing it from a 4:3 crop", () => {
  const tile = { x: 16, y: 80, width: 320, height: 240 };
  const cover = coverRect(tile, 0.75);
  expect(cover).toEqual({ x: 16, y: -13.333333333333343, width: 320, height: 426.6666666666667 });
  const target = containRect({ x: 0, y: 50, width: 390, height: 640 }, 0.75);
  expect(target).toEqual({ x: 0, y: 110, width: 390, height: 520 });
  expect(lerpRect(cover, target, 0.5).width / lerpRect(cover, target, 0.5).height).toBeCloseTo(0.75);
  expect(lerpRect(tile, target, 1)).toEqual(target);
});
it("clips a partly scrolled source below the sticky header and removes the cut corners", () => {
  const tile = { x: 16, y: 20, width: 320, height: 240 };
  const visible = intersectRect(tile, { x: 0, y: 80, width: 390, height: 764 });
  expect(visible).toEqual({ x: 16, y: 80, width: 320, height: 180 });
  expect(clippedRadii(tile, visible, [12, 12, 12, 12])).toEqual([0, 0, 12, 12]);
  expect(toModalRect(visible, { x: 0, y: 24 }).y).toBe(56);
});
it("dismisses past the distance threshold or a fast release in the drag direction", () => {
  expect(dismissDecision(97, 0, 640)).toBe(true);
  expect(dismissDecision(20, 801, 640)).toBe(true);
  expect(dismissDecision(20, -801, 640)).toBe(false);
  expect(dismissDecision(96, 800, 640)).toBe(false);
});
it("fades when the return tile has less than 30 percent visible", () => {
  const tile = { x: 16, y: 80, width: 320, height: 240 };
  const geometry = { tile, visible: { ...tile, height: 71 }, radii: [0, 0, 0, 0] as const, uri: "cached", ratio: 4 / 3 };
  expect(returnMode(geometry)).toBe("fade");
  expect(returnMode({ ...geometry, visible: { ...tile, height: 72 } })).toBe("fly");
  expect(returnMode(null)).toBe("fade");
});
it("moves only enough to expose the current tile, clamping at either end", () => {
  expect(minimalStripOffset(0, 0, 358, 2, 16, 390, 1110)).toBe(0);
  expect(minimalStripOffset(2, 0, 358, 2, 16, 390, 1110)).toBe(720);
  expect(minimalStripOffset(0, 720, 358, 2, 16, 390, 1110)).toBe(0);
});
