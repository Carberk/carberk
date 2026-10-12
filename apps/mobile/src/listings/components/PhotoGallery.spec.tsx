import { describe, expect, it } from "vitest";
import { Image, Modal } from "react-native";
import * as RN from "react-native";

import { fireEvent, renderMobile, within, first } from "../../../test/render";
import { mediaFixture } from "../../../test/fixtures/listing";

import { PhotoGallery } from "./PhotoGallery";

const WINDOW_WIDTH = 390;
const scrollRequests = (RN as unknown as { scrollRequests: unknown[] })
  .scrollRequests;

function viewer(screen: ReturnType<typeof renderMobile>) {
  return within(screen.UNSAFE_getByType(Modal));
}

describe("Photo gallery and viewer", () => {
  it.each([[900, 1600], [1920, 1080]])("shows the complete %sx%s vehicle photo inside the existing fixed gallery frame", (width, height) => {
    const media = mediaFixture(1).map((photo) => ({ ...photo, width, height }));
    const screen = renderMobile(<PhotoGallery media={media} />);
    const image = first(screen.UNSAFE_getAllByType(Image));
    expect(image.props.contentFit).toBe("contain");
    expect(image.props.placeholderContentFit).toBe("contain");
    const frame = screen.UNSAFE_getAllByType(RN.View).find((view) => view.props.className === "bg-muted");
    expect(frame?.props.style).toEqual({ width: 390, height: 253.5 });
    expect(image.props.source.uri).toBe("https://media.test/0/detail.webp?v=webp-natural-1");
  });

  it("opens the viewer at the photo that was tapped", () => {
    const screen = renderMobile(<PhotoGallery media={mediaFixture(3)} />);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    fireEvent.press(first(screen.getAllByRole("button", { name: "Photo 2 of 3" })));

    expect(viewer(screen).getByText("2 / 3")).toBeTruthy();
    expect(
      viewer(screen).getByRole("button", { name: "Photo 2 of 3", selected: true }),
    ).toBeTruthy();
  });

  it("returns the gallery to the photo the viewer was closed on", () => {
    const screen = renderMobile(<PhotoGallery media={mediaFixture(3)} />);
    fireEvent.press(first(screen.getAllByRole("button", { name: "Photo 1 of 3" })));

    fireEvent.press(viewer(screen).getByRole("button", { name: "Photo 3 of 3" }));
    fireEvent.press(viewer(screen).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.getByText("3 / 3")).toBeTruthy();
    expect(scrollRequests).toContainEqual(
      expect.objectContaining({
        method: "scrollToOffset",
        offset: WINDOW_WIDTH * 2,
        animated: false,
      }),
    );
  });

  it("passes the viewer's ♡ and contact actions through, closing it first when asked", () => {
    const screen = renderMobile(
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
    fireEvent.press(first(screen.getAllByRole("button", { name: "Photo 1 of 2" })));

    fireEvent.press(viewer(screen).getByRole("button", { name: "Message" }));

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("has no viewer to open for a Listing without photos", () => {
    const screen = renderMobile(<PhotoGallery media={[]} />);

    expect(screen.getByText("No photos")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("loads the first photo behind the card's cached size, then only its neighbour (#816)", () => {
    const screen = renderMobile(<PhotoGallery media={mediaFixture(20)} />);
    const sources = () => screen.UNSAFE_getAllByType(Image).map((image) => image.props.source.uri);
    // Nothing shares the first photo's bandwidth until it has loaded.
    expect(sources()).toEqual(["https://media.test/0/detail.webp?v=webp-natural-1"]);

    fireEvent(first(screen.UNSAFE_getAllByType(Image)), "load", {
      source: { url: "https://media.test/0/detail.webp?v=webp-natural-1", width: 1200, height: 800 },
    });

    const photos = screen.UNSAFE_getAllByType(Image).map((image) => image.props);
    expect(photos.map((photo) => photo.source.uri)).toEqual([
      "https://media.test/0/detail.webp?v=webp-natural-1",
      "https://media.test/1/detail.webp?v=webp-natural-1",
    ]);
    expect(photos[0]).toEqual(expect.objectContaining({
      placeholder: { uri: "https://media.test/0/list.webp?v=webp-natural-1" },
      placeholderContentFit: "contain",
      priority: "high",
    }));
    expect(photos[1]).toEqual(expect.objectContaining({ placeholder: undefined, priority: "low" }));
  });

  it("lays the first photo's cached list size over its ThumbHash, so the blur shows at once and the sharper size replaces it", () => {
    const media = mediaFixture(2).map((photo, index) => ({ ...photo, thumbHash: index === 0 ? "1fsDBYCIiIiHiIdweIeHh4d4cIgH" : "2yMBBYCIh4iHiHeAiId4dXh3f4f4" }));
    const screen = renderMobile(<PhotoGallery media={media} />);

    const [blur, photo] = screen.UNSAFE_getAllByType(Image).map((image) => image.props);
    expect(blur).toEqual(expect.objectContaining({ source: { thumbhash: "1fsDBYCIiIiHiIdweIeHh4d4cIgH" }, contentFit: "contain" }));
    expect(photo).toEqual(expect.objectContaining({
      source: { uri: "https://media.test/0/detail.webp?v=webp-natural-1" },
      placeholder: { uri: "https://media.test/0/list.webp?v=webp-natural-1" },
      placeholderContentFit: "contain",
    }));
  });

  it("shows the viewer's thumbnails with their ThumbHash while they load", () => {
    const media = mediaFixture(2).map((photo) => ({ ...photo, thumbHash: "2yMBBYCIh4iHiHeAiId4dXh3f4f4" }));
    const screen = renderMobile(<PhotoGallery media={media} />);

    fireEvent.press(first(screen.getAllByRole("button", { name: "Photo 1 of 2" })));

    const thumbnails = viewer(screen).UNSAFE_getAllByType(Image)
      .map((image) => image.props)
      .filter((props) => String(props.source.uri ?? "").includes("thumbnail.webp"));
    expect(thumbnails.map((props) => props.placeholder)).toEqual([{ thumbhash: "2yMBBYCIh4iHiHeAiId4dXh3f4f4" }, { thumbhash: "2yMBBYCIh4iHiHeAiId4dXh3f4f4" }]);
  });
});
