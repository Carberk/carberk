import { describe, expect, it } from "vitest";

import { fireEvent, renderMobile, getAllHosts } from "../../../test/render";
import { mediaFixture } from "../../../test/fixtures/listing";

import { GalleryImage } from "./GalleryImage";

const HASH = "1fsDBYCIiIiHiIdweIeHh4d4cIgH";
const [photoFixture] = mediaFixture(1);
if (!photoFixture) throw new Error("Missing media fixture");
const item = { ...photoFixture, thumbHash: HASH };
const style = { width: "100%", height: "100%" } as const;

const images = (screen: Awaited<ReturnType<typeof renderMobile>>) => getAllHosts(screen.container, "Image");
const photoOf = (screen: Awaited<ReturnType<typeof renderMobile>>) => {
  const photo = images(screen).find((image) => image.props.source.uri !== undefined);
  if (!photo) throw new Error("No photo image");
  return photo;
};
const blurOf = (screen: Awaited<ReturnType<typeof renderMobile>>) =>
  images(screen).filter((image) => image.props.source.thumbhash === HASH);

describe("Viewer photo with a ThumbHash", () => {
  it("sharpens in place when a zoom asks for the fullscreen size, never remounting the photo", async () => {
    const screen = await renderMobile(<GalleryImage item={item} variant="detail" contentFit="contain" style={style} />);
    const before = photoOf(screen);

    // What PhotoViewer renders once a zoom starts on the photo.
    await screen.rerender(<GalleryImage item={item} variant="fullscreen" placeholderVariant="detail" contentFit="contain" style={style} />);

    const after = photoOf(screen);
    expect(after).toBe(before);
    expect(after.props).toEqual(expect.objectContaining({
      source: { uri: "https://media.test/0/fullscreen.webp?v=webp-natural-1" },
      placeholder: { uri: "https://media.test/0/detail.webp?v=webp-natural-1" },
      placeholderContentFit: "contain",
    }));
  });

  it("shows the blur until the photo loads, then removes it so no band shows beside a contain-fit photo", async () => {
    const screen = await renderMobile(<GalleryImage item={item} variant="detail" contentFit="contain" style={style} />);
    expect(blurOf(screen)).toHaveLength(1);
    const photo = photoOf(screen);

    await fireEvent(photo, "load", { source: { url: "https://media.test/0/detail.webp", width: 1200, height: 800 } });

    expect(blurOf(screen)).toHaveLength(0);
    expect(photoOf(screen)).toBe(photo);
  });

  it("keeps the blur away after a zoom swaps in the fullscreen size over the loaded detail size", async () => {
    const screen = await renderMobile(<GalleryImage item={item} variant="detail" contentFit="contain" style={style} />);
    await fireEvent(photoOf(screen), "load", { source: { url: "https://media.test/0/detail.webp", width: 1200, height: 800 } });

    await screen.rerender(<GalleryImage item={item} variant="fullscreen" placeholderVariant="detail" contentFit="contain" style={style} />);

    expect(blurOf(screen)).toHaveLength(0);
  });
});
