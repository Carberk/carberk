import { describe, expect, it } from "vitest";

import {
  getDragTargetIndex,
  getPhotoTileSize,
  reorderPhotoIdsByIndex,
  shiftedIndex,
  slotOffset,
} from "./photoGridLayout";

describe("photo grid layout", () => {
  it("sizes three photo tiles inside the wizard content width", () => {
    expect(getPhotoTileSize(430)).toBe(124);
    expect(getPhotoTileSize(320)).toBe(88);
    expect(getPhotoTileSize(900)).toBe(136);
  });

  it("moves a dragged photo to the slot under the release point", () => {
    expect(
      getDragTargetIndex({
        fromIndex: 0,
        dx: 132,
        dy: 0,
        count: 4,
        tileSize: 124,
      }),
    ).toBe(1);

    expect(
      getDragTargetIndex({
        fromIndex: 0,
        dx: 264,
        dy: 132,
        count: 4,
        tileSize: 124,
      }),
    ).toBe(3);
  });

  it("clamps drag target inside the available photo count", () => {
    expect(
      getDragTargetIndex({
        fromIndex: 2,
        dx: 500,
        dy: 500,
        count: 4,
        tileSize: 124,
      }),
    ).toBe(3);
  });

  it("returns reordered photo ids without mutating the original list", () => {
    const ids = ["a", "b", "c", "d"];

    expect(reorderPhotoIdsByIndex(ids, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("places each slot by row and column, three to a row (#820)", () => {
    expect(slotOffset(0, 124)).toEqual({ x: 0, y: 0 });
    expect(slotOffset(4, 124)).toEqual({ x: 132, y: 132 });
    expect(slotOffset(6, 124)).toEqual({ x: 0, y: 264 });
  });

  it("moves the tiles between the drag's start and its slot aside, across rows (#820)", () => {
    // Photo 2 held over slot 5: photos 3 to 5 each move back one slot.
    expect([0, 2, 3, 4, 5].map((index) => shiftedIndex(index, 1, 4))).toEqual([0, 1, 2, 3, 5]);
    // Photo 5 held over the cover: photos 1 to 4 each move on one slot.
    expect([0, 1, 2, 3, 5].map((index) => shiftedIndex(index, 4, 0))).toEqual([1, 2, 3, 4, 5]);
    // Nothing moves before a drag starts.
    expect(shiftedIndex(2, -1, -1)).toBe(2);
  });
});
