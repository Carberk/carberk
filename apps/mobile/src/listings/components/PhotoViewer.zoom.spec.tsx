import { describe, expect, it, vi } from "vitest";
import { Image, Pressable } from "react-native";

import { fireEvent, renderMobile, first } from "../../../test/render";
import { mediaFixture } from "../../../test/fixtures/listing";

import { PhotoViewer } from "./PhotoViewer";

// The real ZoomableImage runs pinch, pan and double-tap on the UI thread, which
// needs a device. This stand-in lets the viewer's own response to a zoom
// change (paging lock, and snapping neighbours back) be tested here.
vi.mock("./ZoomableImage", () => ({
  ZoomableImage: ({
    active,
    onZoomChange,
    onZoomStart,
    children,
  }: {
    active: boolean;
    onZoomChange: (zoomed: boolean) => void;
    onZoomStart?: () => void;
    children: React.ReactNode;
  }) => (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? "Start zoom on active photo" : "Start zoom on other photo"}
        onPress={() => onZoomStart?.()}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? "Zoom in active photo" : "Zoom in other photo"}
        onPress={() => onZoomChange(true)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zoom out"
        onPress={() => onZoomChange(false)}
      />
      {children}
    </>
  ),
}));

function open(count = 3, initialIndex = 0) {
  return renderMobile(
    <PhotoViewer visible media={mediaFixture(count)} initialIndex={initialIndex} onClose={vi.fn()} />,
  );
}

/** The photo URLs the pages ask for, leaving out the thumbnail strip. */
function pageSources(screen: ReturnType<typeof open>) {
  return screen
    .UNSAFE_getAllByType(Image)
    .map((image) => image.props.source.uri as string)
    .filter((uri) => !uri.includes("thumbnail"));
}

describe("Photo viewer while a photo is zoomed", () => {
  it("pages between photos only while the photo is fitted", () => {
    const screen = open();
    const pager = () => screen.getByTestId("photo-viewer-pager");

    expect(pager().props.scrollEnabled).toBe(true);

    fireEvent.press(screen.getByRole("button", { name: "Zoom in active photo" }));
    expect(pager().props.scrollEnabled).toBe(false);

    fireEvent.press(first(screen.getAllByRole("button", { name: "Zoom out" })));
    expect(pager().props.scrollEnabled).toBe(true);
  });

  it("tells only the photo being viewed that it is the active one", () => {
    const screen = open();

    expect(screen.getAllByRole("button", { name: "Zoom in active photo" })).toHaveLength(1);
    // Only the neighbour of the first photo is loaded, not the third (#816).
    expect(screen.getAllByRole("button", { name: "Zoom in other photo" })).toHaveLength(1);
  });
});

describe("Photo viewer on a slow connection (#816)", () => {
  it("loads only the photo on screen and its neighbours, at the gallery's size", () => {
    const screen = open(20, 5);

    expect(pageSources(screen)).toEqual([
      "https://media.test/4/detail.jpg",
      "https://media.test/5/detail.jpg",
      "https://media.test/6/detail.jpg",
    ]);
  });

  it("asks for the 2400 px photo only once a zoom starts, over the cached detail size", () => {
    const screen = open(3, 0);
    expect(pageSources(screen).some((uri) => uri.includes("fullscreen"))).toBe(false);

    fireEvent.press(screen.getByRole("button", { name: "Start zoom on active photo" }));

    const sharpened = screen
      .UNSAFE_getAllByType(Image)
      .find((image) => image.props.source.uri === "https://media.test/0/fullscreen.jpg");
    expect(sharpened?.props.placeholder).toEqual({ uri: "https://media.test/0/detail.jpg" });
    expect(sharpened?.props.placeholderContentFit).toBe("contain");
    // The neighbour stays at the detail size.
    expect(pageSources(screen)).toContain("https://media.test/1/detail.jpg");
  });
});
