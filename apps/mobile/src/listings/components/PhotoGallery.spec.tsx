import { describe, expect, it } from "vitest";
import * as RN from "react-native";

import { act, fireEvent, renderMobile, within, first, getAllHosts, getHost } from "../../../test/render";
import { mediaFixture } from "../../../test/fixtures/listing";

import { PhotoGallery } from "./PhotoGallery";

/** A 390 dp screen less 16 dp margins each side; one swipe moves a tile and its 2 dp seam. */
const TILE_WIDTH = 390 - 32;
const scrollRequests = (RN as unknown as { scrollRequests: unknown[] })
  .scrollRequests;

function viewer(screen: Awaited<ReturnType<typeof renderMobile>>) {
  return within(getHost(screen.container, "Modal"));
}

describe("Photo gallery and viewer", () => {
  it.each([[900, 1600], [1920, 1080]])("cover-fits the %sx%s vehicle photo into its inset 4:3 tile", async (width, height) => {
    const media = mediaFixture(1).map((photo) => ({ ...photo, width, height }));
    const screen = await renderMobile(<PhotoGallery media={media} />);
    const image = getHost(screen.container, "Image", { priority: "high" });
    expect(image.props.source.uri).toBe("https://media.test/0/detail.webp?v=webp-natural-1");
    expect(image.props.contentFit).toBe("cover");
    expect(image.props.contentPosition).toBeUndefined();
    expect(first(screen.getAllByTestId("listing-photo-tile")).props.style).toEqual({ width: TILE_WIDTH, height: TILE_WIDTH * 3 / 4 });
  });

  it("opens the viewer at the photo that was tapped", async () => {
    const screen = await renderMobile(<PhotoGallery media={mediaFixture(3)} />);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    await fireEvent.press(first(screen.getAllByRole("button", { name: "Photo 2 of 3" })));

    expect(viewer(screen).getByText("2 / 3")).toBeTruthy();
    expect(
      viewer(screen).getByRole("button", { name: "Photo 2 of 3", selected: true }),
    ).toBeTruthy();
  });

  it("returns the gallery to the photo the viewer was closed on", async () => {
    const screen = await renderMobile(<PhotoGallery media={mediaFixture(3)} />);
    await fireEvent.press(first(screen.getAllByRole("button", { name: "Photo 1 of 3" })));

    await fireEvent.press(viewer(screen).getByRole("button", { name: "Photo 3 of 3" }));
    await fireEvent.press(viewer(screen).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(scrollRequests).toContainEqual(
      expect.objectContaining({
        method: "scrollToOffset",
        offset: (TILE_WIDTH + 2) * 2,
        animated: false,
      }),
    );
  });

  it("passes the viewer's ♡ and contact actions through, closing it first when asked", async () => {
    const screen = await renderMobile(
      <PhotoGallery
        media={mediaFixture(2)}
        viewerFooter={(close) => (
          <RN.Pressable
            accessibilityRole="button"
            accessibilityLabel="Message"
            onPress={close}
          />
        )}
      />,
    );
    await fireEvent.press(first(screen.getAllByRole("button", { name: "Photo 1 of 2" })));

    await fireEvent.press(viewer(screen).getByRole("button", { name: "Message" }));

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("has no viewer to open for a Listing without photos", async () => {
    const screen = await renderMobile(<PhotoGallery media={[]} />);

    expect(screen.getByText("No photos")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("loads the first photo on its own, then only its neighbour (#816)", async () => {
    const screen = await renderMobile(<PhotoGallery media={mediaFixture(20)} />);
    const sources = () => getAllHosts(screen.container, "Image").map((image) => image.props.source.uri);
    // Nothing shares the first photo's bandwidth until it has loaded.
    expect(sources()).toEqual(["https://media.test/0/detail.webp?v=webp-natural-1"]);

    await fireEvent(getHost(screen.container, "Image", { priority: "high" }), "load", {
      source: { url: "https://media.test/0/detail.webp?v=webp-natural-1", width: 1200, height: 800 },
    });

    const photos = getAllHosts(screen.container, "Image").map((image) => image.props);
    expect(photos.map((photo) => photo.source.uri)).toEqual([
      "https://media.test/0/detail.webp?v=webp-natural-1",
      "https://media.test/1/detail.webp?v=webp-natural-1",
    ]);
    expect(photos[0]).toEqual(expect.objectContaining({ priority: "high" }));
    expect(photos[1]).toEqual(expect.objectContaining({ placeholder: undefined, priority: "low" }));
  });

  it("shows each photo's ThumbHash under it, cover-fit like the photo, until the photo loads", async () => {
    const media = mediaFixture(2).map((photo, index) => ({ ...photo, thumbHash: index === 0 ? "1fsDBYCIiIiHiIdweIeHh4d4cIgH" : "2yMBBYCIh4iHiHeAiId4dXh3f4f4" }));
    const screen = await renderMobile(<PhotoGallery media={media} />);

    const [blur, photo, ...rest] = getAllHosts(screen.container, "Image").map((image) => image.props);
    expect(rest).toEqual([]);
    expect(blur).toEqual(expect.objectContaining({ source: { thumbhash: "1fsDBYCIiIiHiIdweIeHh4d4cIgH" }, contentFit: "cover" }));
    expect(photo).toEqual(expect.objectContaining({
      source: { uri: "https://media.test/0/detail.webp?v=webp-natural-1" },
      placeholder: undefined,
      contentFit: "cover",
    }));
  });

  it("shows the viewer's thumbnails over their ThumbHash while they load", async () => {
    const media = mediaFixture(2).map((photo) => ({ ...photo, thumbHash: "2yMBBYCIh4iHiHeAiId4dXh3f4f4" }));
    const screen = await renderMobile(<PhotoGallery media={media} />);

    await fireEvent.press(first(screen.getAllByRole("button", { name: "Photo 1 of 2" })));

    const sources = getAllHosts(getHost(screen.container, "Modal"), "Image").map((image) => image.props.source as { uri?: string; thumbhash?: string });
    const thumbnails = sources.filter((source) => source.uri?.includes("thumbnail.webp"));
    const blurs = sources.filter((source) => source.thumbhash === "2yMBBYCIh4iHiHeAiId4dXh3f4f4");
    expect(thumbnails).toHaveLength(2);
    // Every photo in the viewer, page or thumbnail, has its blur under it until it loads.
    expect(blurs).toHaveLength(sources.length - blurs.length);
  });
});

it("keeps the source hidden until the contain page has displayed the cached image", async () => {
  const measured = (RN as unknown as { measureRects: Map<string, number[]> }).measureRects;
  measured.set("detail-photos", [0, 80, 390, 280]);
  measured.set("listing-photo-tile", [16, 88, 358, 268.5]);
  measured.set("photo-viewer-root", [0, 24, 390, 820]);
  measured.set("photo-viewer-page", [0, 80, 390, 640]);
  const screen = await renderMobile(<PhotoGallery media={mediaFixture(1).map((photo) => ({ ...photo, width: 1920, height: 1080 }))} />);
  await fireEvent.press(screen.getByRole("button", { name: "Photo 1 of 1" }));
  await act(() => getHost(screen.container, "Modal").props.onShow());
  const overlay = screen.getByTestId("photo-transition-overlay", { includeHiddenElements: true });
  await fireEvent(getHost(overlay, "Image"), "display");
  expect(screen.getByTestId("listing-photo-tile").props.style.opacity).toBe(0);
  const page = screen.getByTestId("photo-viewer-page");
  await fireEvent(getHost(page, "Image"), "display");
  expect(screen.getByTestId("listing-photo-tile").props.style.opacity).toBeUndefined();
  expect(screen.queryByTestId("photo-transition-overlay", { includeHiddenElements: true })).toBeNull();
});

it("fades instead of guessing a flight shape before any photo size is known", async () => {
  const measured = (RN as unknown as { measureRects: Map<string, number[]> }).measureRects;
  measured.set("detail-photos", [0, 80, 390, 280]);
  measured.set("listing-photo-tile", [16, 88, 358, 268.5]);
  measured.set("photo-viewer-root", [0, 24, 390, 820]);
  measured.set("photo-viewer-page", [0, 80, 390, 640]);
  const media = mediaFixture(1).map((photo) => ({ ...photo, width: undefined, height: undefined }));
  const screen = await renderMobile(<PhotoGallery media={media} />);
  await fireEvent.press(screen.getByRole("button", { name: "Photo 1 of 1" }));
  await act(() => getHost(screen.container, "Modal").props.onShow());
  expect(screen.queryByTestId("photo-transition-overlay", { includeHiddenElements: true })).toBeNull();
  expect(screen.getByTestId("listing-photo-tile").props.style.opacity).toBeUndefined();
});
