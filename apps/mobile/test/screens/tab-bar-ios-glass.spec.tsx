import { createRef } from "react";
import type { View } from "react-native";
import { beforeEach, expect, it, vi } from "vitest";

import { renderMobile, getAllHosts } from "../render";
import { Text } from "../../components/ui/text";
import { GlassSurface } from "../../components/ui/glass-surface";

const settings = vi.hoisted(() => ({ reduced: false, dark: false }));
vi.mock("@/lib/motion", () => ({ useReduceTransparency: () => settings.reduced }));
vi.mock("nativewind", () => ({ cssInterop: vi.fn(), useColorScheme: () => ({ colorScheme: settings.dark ? "dark" : "light" }) }));
vi.mock("expo-glass-effect", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  return { GlassView: (props: object) => React.createElement(View, { ...props, testID: "system-glass" }), GlassContainer: View, isLiquidGlassAvailable: () => true, isGlassEffectAPIAvailable: () => true };
});
beforeEach(() => { settings.reduced = false; settings.dark = false; });
it.each([false, true])("keeps iOS system glass in dark=%s", async (dark) => {
  settings.dark = dark;
  const view = await renderMobile(<GlassSurface blurTarget={createRef<View>()}><Text>Search</Text></GlassSurface>);
  expect(view.getByTestId("system-glass").props).toMatchObject({ glassEffectStyle: "regular", colorScheme: dark ? "dark" : "light" });
  expect(view.getByText("Search")).toBeTruthy();
});
it("uses the opaque material when iOS Reduce Transparency is on", async () => {
  settings.reduced = true;
  const view = await renderMobile(<GlassSurface><Text>Search</Text></GlassSurface>);
  expect(view.queryByTestId("system-glass")).toBeNull();
  expect(getAllHosts(view.container, "View").some((node) => node.props.className?.includes("bg-card"))).toBe(true);
  expect(view.getByText("Search")).toBeTruthy();
});
