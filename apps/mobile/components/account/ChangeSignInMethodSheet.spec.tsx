import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../test/render";

import { ChangeSignInMethodSheet } from "./ChangeSignInMethodSheet";

// Load the real sheet so the tap-outside backdrop is part of the test; the
// dialog primitive is replaced the same way `components/ui/sheet.spec.tsx` does.
vi.unmock("@/components/ui/sheet");
vi.mock("@rn-primitives/dialog", async () => {
  const React = await import("react");
  const { Text, View } = await import("react-native");
  const Open = React.createContext<(open: boolean) => void>(() => {});
  const Box = ({ children }: React.PropsWithChildren) => <View>{children}</View>;
  const Close = ({ children }: { children: React.ReactNode }) => {
    const onOpenChange = React.useContext(Open);
    return React.cloneElement(children as React.ReactElement<{ onPress: () => void }>, { onPress: () => onOpenChange(false) });
  };
  const Root = ({ open, onOpenChange, children }: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) =>
    open ? <Open.Provider value={onOpenChange}>{children}</Open.Provider> : null;
  return { Root, Close, Portal: Box, Overlay: Box, Content: Box, Trigger: Box, Title: Text, Description: Text };
});
vi.mock("react-native-reanimated", () => ({ SlideInDown: { duration: () => ({}) }, SlideOutDown: { duration: () => ({}) } }));
vi.mock("react-native-screens", async () => ({ FullWindowOverlay: (await import("react-native")).View }));
vi.mock("@/components/ui/native-only-animated-view", async () => ({ NativeOnlyAnimatedView: (await import("react-native")).View }));

function renderSheet() {
  const onOpenChange = vi.fn();
  const onContinue = vi.fn();
  const view = renderMobile(
    <ChangeSignInMethodSheet method="email" open onOpenChange={onOpenChange} onContinue={onContinue} />,
  );
  return { view, onOpenChange, onContinue };
}

describe("ChangeSignInMethodSheet", () => {
  it("closes on a tap outside without continuing", () => {
    const { view, onOpenChange, onContinue } = renderSheet();
    fireEvent.press(view.getByTestId("sheet-backdrop", { includeHiddenElements: true }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("continues only from Continue", () => {
    const { view, onContinue } = renderSheet();
    expect(view.getByText("Change email?")).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
