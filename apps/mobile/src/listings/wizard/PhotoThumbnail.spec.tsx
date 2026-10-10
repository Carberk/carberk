import { describe, expect, it, vi } from "vitest";
import { Image } from "expo-image";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { renderMobile, fireEvent } from "../../../test/render";
import type { StagedPhoto } from "../uploadStaging/types";

import { PhotoThumbnail, type PhotoDrag } from "./PhotoThumbnail";

const props = () => ({ photo: { photoId: "photo-a", sortOrder: 0, state: "attached", retryCount: 0,
  localUri: "file:///photo-a.jpg" } satisfies StagedPhoto, index: 0, total: 2,
  onRemove: vi.fn(), onOpenActions: vi.fn(), dragEnabled: true, onDragStart: vi.fn(), onDrop: vi.fn(),
  drag: { from: { value: -1 }, to: { value: -1 }, x: { value: 0 }, y: { value: 0 } } as unknown as PhotoDrag });

describe("PhotoThumbnail", () => {
  it("supplies square dimensions and a cover label for the first tile", () => {
    const screen = renderMobile(<PhotoThumbnail {...props()} />);
    // The badge is for the eye; a screen reader gets "Cover" in the tile's own label.
    expect(screen.getByText("Cover", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText("Photo 1 of 2, Cover, Uploaded")).toBeTruthy();
    const tile = screen.UNSAFE_getAllByType(View).find((node) => StyleSheet.flatten(node.props.style)?.width === 111);
    expect(StyleSheet.flatten(tile?.props.style)).toMatchObject({ width: 111, height: 111 });
    expect(screen.UNSAFE_getByType(Image).props.source).toEqual({ uri: "file:///photo-a.jpg" });
  });
  it("removes the photo by its id", () => {
    const callbacks = props();
    const screen = renderMobile(<PhotoThumbnail {...callbacks} />);
    fireEvent.press(screen.getByLabelText("Remove: Photo 1 of 2"));
    expect(callbacks.onRemove).toHaveBeenCalledWith("photo-a");
  });
  it("opens the photo's actions when the tile is tapped", () => {
    const callbacks = props();
    const screen = renderMobile(<PhotoThumbnail {...callbacks} />);
    fireEvent.press(screen.getByLabelText("Photo 1 of 2, Cover, Uploaded"));
    expect(callbacks.onOpenActions).toHaveBeenCalledWith("photo-a");
  });
  it("shows a queued photo as queued, with its spinner clear of the remove button", () => {
    const callbacks = props();
    const queued = { ...callbacks.photo, state: "compressed" as const };
    const screen = renderMobile(<PhotoThumbnail {...callbacks} photo={queued} />);
    // The tile says it is waiting, as the header chip counts it, instead of looking finished.
    expect(screen.getByText("In queue", { includeHiddenElements: true })).toBeTruthy();
    const spinner = screen.UNSAFE_getByType(ActivityIndicator);
    let holder = spinner.parent;
    while (holder && !holder.props.className) holder = holder.parent;
    // Centred over the photo, not tucked into the top-right corner under ✕.
    expect(holder?.props.className).toMatch(/\binset-0\b/);
    expect(holder?.props.className).not.toMatch(/\b(?:right-1|top-1)\b/);
    // ✕ stays on top and tappable, with a 28 pt button plus 8 pt slop each side: 44 pt.
    const remove = screen.getByLabelText("Remove: Photo 1 of 2");
    expect(remove.props.className).toMatch(/\bh-7 w-7\b/);
    expect(remove.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
    fireEvent.press(remove);
    expect(callbacks.onRemove).toHaveBeenCalledWith("photo-a");
  });
  it("opens the actions for a failed photo too, instead of retrying on the spot", () => {
    const callbacks = props();
    const failed = { ...callbacks.photo, state: "failed" as const, error: { code: "NETWORK_ERROR" as const, message: "Offline", retryable: true } };
    const screen = renderMobile(<PhotoThumbnail {...callbacks} photo={failed} />);
    // The overlay is for the eye and never takes the tap; the label above carries the state.
    expect(screen.getByText("Offline", { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Photo 1 of 2, Cover, Failed"));
    expect(callbacks.onOpenActions).toHaveBeenCalledWith("photo-a");
  });
});
