import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";
import { mediaFixture } from "../../../test/fixtures/listing";

import { DetailPhotoStrip } from "./DetailPhotoStrip";

describe("Listing detail photo strip", () => {
  it("reports which photo was tapped with its tile, so the viewer can open from where the photo sits (#869)", async () => {
    const onPressPhoto = vi.fn();
    const screen = await renderMobile(<DetailPhotoStrip photos={mediaFixture(3)} onPressPhoto={onPressPhoto} />);

    await fireEvent.press(screen.getByRole("button", { name: "Photo 2 of 3" }));

    expect(onPressPhoto).toHaveBeenCalledTimes(1);
    const [index, tile] = onPressPhoto.mock.calls[0] ?? [];
    expect(index).toBe(1);
    expect(tile).toBeTruthy();
  });

  it("offers no button for a photo the Listing has but the card did not name", async () => {
    const screen = await renderMobile(
      <DetailPhotoStrip photos={[{ key: "listing-0/original.webp" }, { key: "pending-0", pending: true }]} onPressPhoto={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Photo 1 of 2" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Photo 2 of 2" })).toBeNull();
    expect(screen.getByLabelText("Photo 2 of 2")).toBeTruthy();
  });
});
