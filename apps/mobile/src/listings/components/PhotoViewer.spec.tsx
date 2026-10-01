import { describe, expect, it, vi } from "vitest";
import { Modal, Pressable } from "react-native";
import * as RN from "react-native";

import {
  act,
  fireEvent,
  renderMobile,
  within,
} from "../../../test/render";
import { mediaFixture } from "../../../test/fixtures/listing";

import { PhotoViewer } from "./PhotoViewer";

const WINDOW_WIDTH = 390;
const scrollRequests = (RN as unknown as { scrollRequests: unknown[] })
  .scrollRequests;

function open(props: Partial<React.ComponentProps<typeof PhotoViewer>> = {}) {
  const onClose = vi.fn();
  const screen = renderMobile(
    <PhotoViewer
      visible
      media={mediaFixture(5)}
      initialIndex={2}
      onClose={onClose}
      {...props}
    />,
  );
  return { screen, onClose };
}

function swipeTo(screen: ReturnType<typeof open>["screen"], index: number) {
  fireEvent(screen.getByTestId("photo-viewer-pager"), "momentumScrollEnd", {
    nativeEvent: { contentOffset: { x: WINDOW_WIDTH * index, y: 0 } },
  });
}

describe("Photo viewer", () => {
  it("opens at the requested photo with an n / N counter", () => {
    const { screen } = open();

    expect(screen.getByText("3 / 5")).toBeTruthy();
    expect(screen.getByTestId("photo-viewer-pager").props.initialScrollIndex).toBe(2);
  });

  it("shows a thumbnail for every photo and marks the one being viewed", () => {
    const { screen } = open();

    expect(screen.getAllByRole("button", { name: /^Photo \d of 5$/ })).toHaveLength(5);
    expect(
      screen.getByRole("button", { name: "Photo 3 of 5", selected: true }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Photo 1 of 5", selected: false }),
    ).toBeTruthy();
  });

  it("jumps to a photo when its thumbnail is tapped", () => {
    const { screen } = open();

    fireEvent.press(screen.getByRole("button", { name: "Photo 5 of 5" }));

    expect(screen.getByText("5 / 5")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Photo 5 of 5", selected: true }),
    ).toBeTruthy();
    expect(scrollRequests).toContainEqual(
      expect.objectContaining({ method: "scrollToIndex", index: 4 }),
    );
  });

  it("follows a swipe to the next photo", () => {
    const { screen } = open();

    swipeTo(screen, 3);

    expect(screen.getByText("4 / 5")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Photo 4 of 5", selected: true }),
    ).toBeTruthy();
  });

  it("closes with the ✕ and hands back the photo it was left on", () => {
    const { screen, onClose } = open();
    swipeTo(screen, 3);

    fireEvent.press(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(3);
  });

  it("closes from the system back gesture with the photo it was left on", () => {
    const { screen, onClose } = open();
    fireEvent.press(screen.getByRole("button", { name: "Photo 1 of 5" }));

    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(0);
  });

  it("draws nothing while closed", () => {
    const { screen } = open({ visible: false });

    expect(screen.queryByText("3 / 5")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("hosts the caller's ♡ and Call + Message, and lets them close the viewer", () => {
    const { screen, onClose } = open({
      headerAction: (close) => (
        <Pressable accessibilityRole="button" accessibilityLabel="Favorite" onPress={close} />
      ),
      footer: () => (
        <Pressable accessibilityRole="button" accessibilityLabel="Message" />
      ),
    });
    swipeTo(screen, 1);

    expect(screen.getByRole("button", { name: "Message" })).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Favorite" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(1);
  });

  it("leaves the top corner empty without a ♡ and shows no footer", () => {
    const { screen } = open();

    expect(screen.queryByRole("button", { name: "Favorite" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Call" })).toBeNull();
    expect(
      within(screen.UNSAFE_getByType(Modal)).getByText("3 / 5"),
    ).toBeTruthy();
  });
});

// Two rendered scroll tests in a row: the second must not see the first one's
// requests, or a `toContainEqual` in either could pass on the other's leftovers.
describe("Photo viewer scroll requests", () => {
  const pagerRequests = () =>
    scrollRequests.filter((request) => (request as { method: string }).method === "scrollToIndex");

  it("asks the pager to scroll when a thumbnail is tapped", () => {
    const { screen } = open();

    fireEvent.press(screen.getByRole("button", { name: "Photo 5 of 5" }));

    expect(pagerRequests()).toEqual([{ method: "scrollToIndex", index: 4, animated: false }]);
  });

  it("starts the next test with no scroll requests left by the one before", () => {
    expect(scrollRequests).toHaveLength(0);
    const { screen } = open();

    fireEvent.press(screen.getByRole("button", { name: "Photo 2 of 5" }));

    expect(pagerRequests()).toEqual([{ method: "scrollToIndex", index: 1, animated: false }]);
  });
});
