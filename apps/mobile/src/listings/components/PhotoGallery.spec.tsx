import { describe, expect, it } from "vitest";
import * as RN from "react-native";

import { fireEvent, renderMobile, within, first, getAllHosts, getHost } from "../../../test/render";
import { mediaFixture } from "../../../test/fixtures/listing";

import { PhotoGallery } from "./PhotoGallery";

const WINDOW_WIDTH = 390;
const scrollRequests = (RN as unknown as { scrollRequests: unknown[] })
  .scrollRequests;

function viewer(screen: Awaited<ReturnType<typeof renderMobile>>) {
  return within(getHost(screen.container, "Modal"));
}

describe("Photo gallery and viewer", () => {
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
    expect(screen.getByText("3 / 3")).toBeTruthy();
    expect(scrollRequests).toContainEqual(
      expect.objectContaining({
        method: "scrollToOffset",
        offset: WINDOW_WIDTH * 2,
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

  it("loads the first photo behind the card's cached size, then only its neighbour (#816)", async () => {
    const screen = await renderMobile(<PhotoGallery media={mediaFixture(20)} />);
    const sources = () => getAllHosts(screen.container, "Image").map((image) => image.props.source.uri);
    // Nothing shares the first photo's bandwidth until it has loaded.
    expect(sources()).toEqual(["https://media.test/0/detail.jpg"]);

    await fireEvent(first(getAllHosts(screen.container, "Image")), "load", {
      source: { url: "https://media.test/0/detail.jpg", width: 1200, height: 800 },
    });

    const photos = getAllHosts(screen.container, "Image").map((image) => image.props);
    expect(photos.map((photo) => photo.source.uri)).toEqual([
      "https://media.test/0/detail.jpg",
      "https://media.test/1/detail.jpg",
    ]);
    expect(photos[0]).toEqual(expect.objectContaining({
      placeholder: { uri: "https://media.test/0/list.jpg" },
      placeholderContentFit: "cover",
      priority: "high",
    }));
    expect(photos[1]).toEqual(expect.objectContaining({ placeholder: undefined, priority: "low" }));
  });
});
