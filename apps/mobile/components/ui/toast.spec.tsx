import { AccessibilityInfo, StyleSheet } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "@/components/ui/toast";
import { renderMobile, act, fireEvent } from "@/test/render";

const insets = vi.hoisted(() => ({ top: 0, right: 0, bottom: 0, left: 0 }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => insets }));
beforeEach(() => { insets.top = 0; insets.bottom = 0; });

let toast: ReturnType<typeof useToast>;
function Capture() {
  toast = useToast();
  return null;
}
function renderToasts() {
  return renderMobile(<ToastProvider><Capture /></ToastProvider>);
}

afterEach(() => vi.useRealTimers());

describe("Toast", () => {
  it("runs its action and closes when the action is pressed", async () => {
    const onUndo = vi.fn();
    const view = await renderToasts();
    await act(() => { toast.show({ title: "Removed from Favorites", action: { label: "Undo", onPress: onUndo } }); });
    await fireEvent.press(view.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(view.queryByText("Removed from Favorites")).toBeNull();
  });

  it("gives the action a target of at least 44 pt", async () => {
    const view = await renderToasts();
    await act(() => { toast.show({ title: "Removed", action: { label: "Undo", onPress: vi.fn() } }); });
    expect(view.getByRole("button", { name: "Undo" }).props.className).toMatch(/min-h-11/);
  });

  it("leaves the action reachable by a screen reader and announces the toast", async () => {
    const announcements = (AccessibilityInfo as unknown as { announcements: string[] }).announcements;
    announcements.length = 0;
    const view = await renderToasts();
    await act(() => { toast.show({ title: "Removed from Favorites", action: { label: "Undo", onPress: vi.fn() } }); });
    // An accessible ancestor groups its children into one element on iOS, hiding Undo.
    let ancestor = view.getByRole("button", { name: "Undo" }).parent;
    while (ancestor) {
      expect(ancestor.props.accessible).not.toBe(true);
      ancestor = ancestor.parent;
    }
    // The announcement names the action, so a screen-reader user knows Undo is there.
    expect(announcements).toEqual(["Removed from Favorites. Undo"]);
  });

  it("sits above the tab bar when asked, and at the top otherwise", async () => {
    const view = await renderToasts();
    await act(() => { toast.show({ title: "Above the tab bar", placement: "aboveTabBar" }); });
    await act(() => { toast.show({ title: "At the top" }); });
    const bottom = view.getByTestId("toast-viewport-above-tab-bar");
    expect(StyleSheet.flatten(bottom.props.style).bottom).toBe(80);
    expect(view.getByTestId("toast-viewport-top")).toBeTruthy();
  });

  it.each([0, 24, 59])("clears the screen header with a %i pt top safe area", async (top) => {
    insets.top = top;
    const view = await renderToasts();
    await act(() => { toast.show({ title: "Скопировано" }); });
    const viewport = view.getByTestId("toast-viewport-top");
    // Reserve 64 pt for the standard header, plus an 8 pt gap below it.
    expect(StyleSheet.flatten(viewport.props.style)?.top).toBe(top + 64 + 8);
    expect(viewport.props.className).not.toMatch(/\b(?:top-0|pt-12)\b/);
    expect(view.getByText("Скопировано")).toBeTruthy();
  });

  it("updates top clearance when safe-area insets change without moving bottom toasts", async () => {
    insets.bottom = 34;
    const view = await renderToasts();
    await act(() => {
      toast.show({ title: "Copied" });
      toast.show({ title: "Removed", placement: "aboveTabBar" });
    });
    insets.top = 59;
    await view.rerender(<ToastProvider><Capture /></ToastProvider>);
    expect(StyleSheet.flatten(view.getByTestId("toast-viewport-top").props.style)?.top).toBe(131);
    expect(StyleSheet.flatten(view.getByTestId("toast-viewport-above-tab-bar").props.style).bottom).toBe(98);
  });

  it.each([
    ["default", "border-border", "text-foreground"],
    ["success", "border-success-500/20", "text-success-500"],
    ["destructive", "border-destructive/20", "text-destructive"],
    ["warning", "border-warning-500/20", "text-warning-500"],
    ["info", "border-info-500/20", "text-info-500"],
  ] as const)("renders an opaque themed %s toast with its semantic accent", async (variant, border, text) => {
    const view = await renderToasts();
    await act(() => { toast.show({ title: "Отмечено как проданное", description: "Saved", variant }); });
    const title = view.getByText("Отмечено как проданное");
    // The native host passes utilities through; actual theme/layout needs native proof.
    let card = title.parent;
    while (card && !card.props.className?.split(" ").includes("border")) {
      card = card.parent;
    }
    expect(card?.props.className.split(" ")).toContain("bg-card");
    expect(card?.props.className).not.toMatch(/\bbg-\S+\/\d+/);
    expect(card?.props.className).toContain(border);
    expect(title.props.className).toContain(text);
    expect(view.getByText("Saved")).toBeTruthy();
  });

  it("dismisses a status toast when tapped", async () => {
    const view = await renderToasts();
    await act(() => { toast.show({ title: "Saved", variant: "success" }); });
    await fireEvent.press(view.getByText("Saved"));
    expect(view.queryByText("Saved")).toBeNull();
  });

  it("closes each toast after its own duration", async () => {
    vi.useFakeTimers();
    const view = await renderToasts();
    await act(() => { toast.show({ title: "First", duration: 1000 }); });
    await act(() => { vi.advanceTimersByTime(500); });
    await act(() => { toast.show({ title: "Second", duration: 1000 }); });
    await act(() => { vi.advanceTimersByTime(600); });
    expect(view.queryByText("First")).toBeNull();
    expect(view.getByText("Second")).toBeTruthy();
    await act(() => { vi.advanceTimersByTime(500); });
    expect(view.queryByText("Second")).toBeNull();
  });
});
