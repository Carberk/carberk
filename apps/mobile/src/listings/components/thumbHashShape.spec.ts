import { describe, expect, it } from "vitest";

import { isAboutFourByThree, thumbHashAspectRatio } from "./thumbHashShape";

// Hashes of 4:3, 3:2, 16:9, square and 3:4 images, made with `thumbhash` 0.1.1.
const HASHES = {
  "4:3": "HwgKNZqAh4dwiHh4iHiIh4BwB/iI",
  "3:2": "HwgKNZqAh4eAiIiIiHiIeIBwB/iH",
  "16:9": "HggKNJpwd4dweHiIiIdwcAf3eA==",
  square: "HwgKNxpwd4dwiHiHiHiIeIiHCAiIgI8I",
  portrait: "H/gJNRpwd4CIiId4h3h4d3BwCPd3",
};

describe("thumbHashAspectRatio", () => {
  it("reads the approximate width / height thumbhash's own decoder reports", () => {
    expect(thumbHashAspectRatio(HASHES["4:3"])).toBe(7 / 5);
    expect(thumbHashAspectRatio(HASHES["3:2"])).toBe(7 / 5);
    expect(thumbHashAspectRatio(HASHES["16:9"])).toBe(7 / 4);
    expect(thumbHashAspectRatio(HASHES.square)).toBe(1);
    expect(thumbHashAspectRatio(HASHES.portrait)).toBe(5 / 7);
  });

  it("gives nothing for a hash too short to hold its header", () => {
    expect(thumbHashAspectRatio("")).toBeUndefined();
    expect(thumbHashAspectRatio("HwgK")).toBeUndefined();
  });
});

describe("isAboutFourByThree", () => {
  it("holds for 4:3 and 3:2 covers only", () => {
    expect(isAboutFourByThree(HASHES["4:3"])).toBe(true);
    expect(isAboutFourByThree(HASHES["3:2"])).toBe(true);
    expect(isAboutFourByThree(HASHES["16:9"])).toBe(false);
    expect(isAboutFourByThree(HASHES.square)).toBe(false);
    expect(isAboutFourByThree(HASHES.portrait)).toBe(false);
  });
});
