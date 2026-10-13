import { Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PhotoActionSheet } from "../../src/listings/wizard/PhotoActionSheet";
import type { StagedPhoto } from "../../src/listings/uploadStaging/types";

import { act, fireEvent, renderMobile } from "../../test/render";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useReduceMotion } from "@/lib/motion";

// The shared native shell replaces the Sheet in every other spec, so this one loads the real file.
vi.unmock("@/components/ui/sheet");

// The dialog primitive, Reanimated and react-native-screens need a device. This stand-in keeps
// what the backdrop depends on: Close reports `onOpenChange(false)` through the Root.
vi.mock("@rn-primitives/dialog", async () => {
  const React = await import("react");
  const { View, Text } = await import("react-native");
  const Open = React.createContext({ open: false, onOpenChange: (_open: boolean) => {} });
  const Box = ({ children }: React.PropsWithChildren) => <View>{children}</View>;
  const Close = ({ children }: { children: React.ReactNode }) => {
    const { onOpenChange } = React.useContext(Open);
    return React.cloneElement(children as React.ReactElement<{ onPress: () => void }>, { onPress: () => onOpenChange(false) });
  };
  const Root = ({ open, onOpenChange, children }: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) =>
    <Open.Provider value={{ open, onOpenChange }}>{children}</Open.Provider>;
  const Present = ({ forceMount, children }: React.PropsWithChildren<{ forceMount?: boolean }>) =>
    React.useContext(Open).open || forceMount ? <View>{children}</View> : null;
  return { Root, Close, useRootContext: () => React.useContext(Open), Portal: Present, Overlay: Present, Content: Present, Trigger: Box, Title: Text, Description: Text };
});
vi.mock("react-native-screens", async () => ({ FullWindowOverlay: (await import("react-native")).View }));
vi.mock("@/components/ui/native-only-animated-view", async () => ({ NativeOnlyAnimatedView: (await import("react-native")).View }));

// The backdrop is hidden from accessibility, so queries must include hidden elements.
const hidden = { includeHiddenElements: true };

function renderSheet(closeOnBackdropPress?: boolean) {
  const onOpenChange = vi.fn();
  const view = renderMobile(
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent closeOnBackdropPress={closeOnBackdropPress}>
        <Text>Body</Text>
      </SheetContent>
    </Sheet>,
  );
  return { view, onOpenChange };
}

describe("Sheet backdrop", () => {
  it("closes on a tap outside when the sheet opts in", () => {
    const { view, onOpenChange } = renderSheet(true);
    fireEvent.press(view.getByTestId("sheet-backdrop", hidden));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has no backdrop by default, so a stray tap cannot discard a draft", () => {
    const { view } = renderSheet();
    expect(view.queryByTestId("sheet-backdrop", hidden)).toBeNull();
  });

  it("keeps the sheet open when the body is tapped", () => {
    const { view, onOpenChange } = renderSheet(true);
    fireEvent.press(view.getByText("Body"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

beforeEach(() => { vi.useFakeTimers(); vi.mocked(useReduceMotion).mockReturnValue(false); });
afterEach(() => vi.useRealTimers());

describe("Sheet dismissal", () => {
  const sheet = (open: boolean) => <Sheet open={open} onOpenChange={() => {}}><SheetContent><Text>Options</Text></SheetContent></Sheet>;

  it("retains the whole sheet for its exit before removing it", () => {
    const view = renderMobile(sheet(true));
    view.rerender(sheet(false));
    expect(view.getByText("Options", hidden)).toBeTruthy();
    act(() => vi.advanceTimersByTime(220));
    expect(view.queryByText("Options")).toBeNull();
  });

  it("uses a brief fade dismissal when motion is reduced", () => {
    vi.mocked(useReduceMotion).mockReturnValue(true);
    const view = renderMobile(sheet(true));
    view.rerender(sheet(false));
    expect(view.getByText("Options", hidden)).toBeTruthy();
    act(() => vi.advanceTimersByTime(150));
    expect(view.queryByText("Options", hidden)).toBeNull();
  });

  it("cancels pending removal when reopened during the exit", () => {
    const view = renderMobile(sheet(true));
    view.rerender(sheet(false));
    act(() => vi.advanceTimersByTime(100));
    view.rerender(sheet(true));
    act(() => vi.advanceTimersByTime(50));
    view.rerender(sheet(false));
    act(() => vi.advanceTimersByTime(70));
    // First exit would finish now. The second exit still owes 150 ms.
    expect(view.getByText("Options", hidden)).toBeTruthy();
    act(() => vi.advanceTimersByTime(149));
    expect(view.getByText("Options", hidden)).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(view.queryByText("Options", hidden)).toBeNull();
  });
});


describe("Photo actions dismissal", () => {
  it("retains the selected photo's title and actions after the parent clears selection", () => {
    const photo: StagedPhoto = { photoId: "photo-1", state: "uploaded", sortOrder: 1, retryCount: 0 };
    const actions = { onOpenChange: vi.fn(), onSetAsCover: vi.fn(), onMoveEarlier: vi.fn(), onMoveLater: vi.fn(), onRemove: vi.fn(), onRetry: vi.fn() };
    const sheet = (selected: StagedPhoto | null) => <PhotoActionSheet open={selected !== null} photo={selected} index={1} total={3} {...actions} />;
    const view = renderMobile(sheet(photo));
    expect(view.getByText("Photo 2 of 3")).toBeTruthy();
    expect(view.getByText("Set as cover")).toBeTruthy();
    view.rerender(sheet(null));
    expect(view.getByText("Photo 2 of 3", hidden)).toBeTruthy();
    expect(view.getByText("Set as cover", hidden)).toBeTruthy();
    act(() => vi.advanceTimersByTime(220));
    expect(view.queryByText("Photo 2 of 3", hidden)).toBeNull();
  });
});
