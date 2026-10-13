import { Text } from "react-native";
import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../test/render";

import { Sheet, SheetContent } from "@/components/ui/sheet";

// The shared native shell replaces the Sheet in every other spec, so this one loads the real file.
vi.unmock("@/components/ui/sheet");

// The dialog primitive, Reanimated and react-native-screens need a device. This stand-in keeps
// what the backdrop depends on: Close reports `onOpenChange(false)` through the Root.
vi.mock("@rn-primitives/dialog", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  const Open = React.createContext<(open: boolean) => void>(() => {});
  const Box = ({ children }: React.PropsWithChildren) => <View>{children}</View>;
  const Close = ({ children }: { children: React.ReactNode }) => {
    const onOpenChange = React.useContext(Open);
    return React.cloneElement(children as React.ReactElement<{ onPress: () => void }>, { onPress: () => onOpenChange(false) });
  };
  const Root = ({ onOpenChange, children }: React.PropsWithChildren<{ onOpenChange: (open: boolean) => void }>) =>
    <Open.Provider value={onOpenChange}>{children}</Open.Provider>;
  return { Root, Close, Portal: Box, Overlay: Box, Content: Box, Trigger: Box, Title: Box, Description: Box };
});
vi.mock("react-native-reanimated", () => ({ SlideInDown: { duration: () => ({}) }, SlideOutDown: { duration: () => ({}) } }));
vi.mock("react-native-screens", async () => ({ FullWindowOverlay: (await import("react-native")).View }));
vi.mock("@/components/ui/native-only-animated-view", async () => ({ NativeOnlyAnimatedView: (await import("react-native")).View }));

// The backdrop is hidden from accessibility, so queries must include hidden elements.
const hidden = { includeHiddenElements: true };

async function renderSheet(closeOnBackdropPress?: boolean) {
  const onOpenChange = vi.fn();
  const view = await renderMobile(
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent closeOnBackdropPress={closeOnBackdropPress}>
        <Text>Body</Text>
      </SheetContent>
    </Sheet>,
  );
  return { view, onOpenChange };
}

describe("Sheet backdrop", () => {
  it("closes on a tap outside when the sheet opts in", async () => {
    const { view, onOpenChange } = await renderSheet(true);
    await fireEvent.press(view.getByTestId("sheet-backdrop", hidden));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has no backdrop by default, so a stray tap cannot discard a draft", async () => {
    const { view } = await renderSheet();
    expect(view.queryByTestId("sheet-backdrop", hidden)).toBeNull();
  });

  it("keeps the sheet open when the body is tapped", async () => {
    const { view, onOpenChange } = await renderSheet(true);
    await fireEvent.press(view.getByText("Body"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
