import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Platform, View } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, fireEvent, renderMobile, getAllHosts } from "../render";
import { AutoTmTabBar } from "../../components/navigation/AutoTmTabBar";

import { useReduceMotion } from "@/lib/motion";

const gestures = vi.hoisted(() => ({ handlers: {} as Record<string, (event: { x: number }) => void> }));
vi.mock("react-native-gesture-handler", async () => {
  const { View } = await import("react-native");
  const builder = () => {
    const chain = new Proxy({}, { get: (_, name: string) => (...args: unknown[]) => {
      if (name.startsWith("on")) gestures.handlers[name] = args[0] as (event: { x: number }) => void;
      return chain;
    } });
    return chain;
  };
  return { GestureHandlerRootView: View, GestureDetector: ({ children }: { children: unknown }) => children, Gesture: { Pan: builder } };
});
vi.mock("@react-navigation/native", () => ({
  CommonActions: { navigate: (name: string, params?: object) => ({ type: "NAVIGATE", payload: { name, params } }) },
}));
vi.mock("expo-notifications", () => ({ addNotificationReceivedListener: vi.fn(() => ({ remove: vi.fn() })) }));

const routes = ["(search)", "favorites", "sell", "chat", "services"].map((name) => ({ key: name, name, params: undefined }));
async function renderBar(prevented = false, locale = "en") {
  const navigation = { emit: vi.fn(() => ({ defaultPrevented: prevented })), dispatch: vi.fn() };
  const props = {
    state: { index: 0, key: "tabs", routes },
    descriptors: Object.fromEntries(routes.map((route) => [route.key, { options: {} }])), navigation,
  } as unknown as BottomTabBarProps;
  const view = await renderMobile(<AutoTmTabBar {...props} />, { locale });
  const bar = getAllHosts(view.container, "View").find((node) => node.props.accessibilityRole === "tablist");
  if (!bar) throw new Error("Tab material did not render");
  await act(() => bar.props.onLayout({ nativeEvent: { layout: { width: 358 } } }));
  return { view, navigation };
}
function gesture(name: string, x: number) {
  const handler = gestures.handlers[name];
  if (!handler) throw new Error(`Missing gesture handler ${name}`);
  handler({ x });
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(useReduceMotion).mockReturnValue(false); Platform.OS = "ios"; });

describe("Tab bar selection feedback", () => {
  it.each([["en", "Favorites"], ["ru", "Избранное"], ["tk", "Halanlarym"]])("keeps a labeled tab action in %s", async (locale, label) => {
    const { view, navigation } = await renderBar(false, locale);
    await fireEvent.press(view.getByRole("tab", { name: label }));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: { name: "favorites", params: undefined } }));
  });
  it("ticks once when a tap opens Favorites", async () => {
    const { view, navigation } = await renderBar();
    await fireEvent.press(view.getByRole("tab", { name: "Favorites" }));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
  });
  it("does not repeat feedback before an accepted tap updates focus", async () => {
    const { view } = await renderBar();
    const favorites = view.getByRole("tab", { name: "Favorites" });
    await fireEvent.press(favorites);
    await fireEvent.press(favorites);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });
  it("does not tick when the open tab is tapped", async () => {
    const { view } = await renderBar();
    await fireEvent.press(view.getByRole("tab", { name: "Search" }));
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });
  it("does not tick when tab selection is prevented", async () => {
    const { view, navigation } = await renderBar(true);
    await fireEvent.press(view.getByRole("tab", { name: "Favorites" }));
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });
  it("uses Android's clock tick for a tab tap", async () => {
    Platform.OS = "android";
    const { view } = await renderBar();
    await fireEvent.press(view.getByRole("tab", { name: "Favorites" }));
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith("clock-tick");
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });
  it("ticks once per crossed tab and does not add a tick on slide release", async () => {
    const { navigation } = await renderBar();
    await act(() => {
      gesture("onBegin", 35);
      gesture("onStart", 35);
      gesture("onUpdate", 110);
      gesture("onUpdate", 115);
      gesture("onUpdate", 185);
      gesture("onUpdate", 185);
      gesture("onEnd", 185);
    });
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
  });
});

describe("Tab bar selection feedback with Reduce Motion on", () => {
  beforeEach(() => { vi.mocked(useReduceMotion).mockReturnValue(true); });

  it("still ticks once when a tap opens Favorites, and not again on a repeat", async () => {
    const { view, navigation } = await renderBar();
    const favorites = view.getByRole("tab", { name: "Favorites" });
    await fireEvent.press(favorites);
    await fireEvent.press(favorites);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: { name: "favorites", params: undefined } }));
  });
  it("still ticks once per crossed tab and selects the tab on slide release", async () => {
    const { navigation } = await renderBar();
    await act(() => {
      gesture("onBegin", 35);
      gesture("onStart", 35);
      gesture("onUpdate", 110);
      gesture("onUpdate", 115);
      gesture("onUpdate", 185);
      gesture("onEnd", 185);
    });
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: { name: "sell", params: undefined } }));
  });
  it("does not tick when the open tab is tapped or selection is prevented", async () => {
    await fireEvent.press((await renderBar()).view.getByRole("tab", { name: "Search" }));
    await fireEvent.press((await renderBar(true)).view.getByRole("tab", { name: "Favorites" }));
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });
});
