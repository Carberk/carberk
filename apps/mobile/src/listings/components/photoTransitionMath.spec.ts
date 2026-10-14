import { expect, it } from "vitest";
import { coverRect } from "./photoTransitionMath";
it("reveals the full landscape photo beyond a centred 4:3 tile crop", () => {
  expect(coverRect({ x: 16, y: 80, width: 320, height: 240 }, 16 / 9)).toEqual({ x: -37.333333333333314, y: 80, width: 426.66666666666663, height: 240 });
});
