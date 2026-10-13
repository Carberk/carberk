import { createRef, type ComponentProps } from "react";
import type { View } from "react-native";
import { Platform } from "react-native";
import { beforeEach, expect, it, vi } from "vitest";

import { renderMobile, getAllHosts } from "../render";
import { Text } from "../../components/ui/text";
import { GlassSurface } from "../../components/ui/glass-surface";

const settings = vi.hoisted(() => ({ reduced: false, dark: false }));
vi.mock("@/lib/motion", () => ({ useReduceTransparency: () => settings.reduced }));
vi.mock("nativewind", () => ({ cssInterop: vi.fn(), useColorScheme: () => ({ colorScheme: settings.dark ? "dark" : "light" }) }));
vi.mock("expo-blur", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  return { BlurView: (props: object) => React.createElement(View, { ...props, testID: "native-blur" }), BlurTargetView: View };
});
beforeEach(() => { settings.reduced = false; settings.dark = false; Platform.OS = "android"; });
const target = createRef<View>();
function surface(withTarget = true) {
  const props = { blurTarget: withTarget ? target : undefined, accessibilityLabel: "Tab material" } as ComponentProps<typeof GlassSurface>;
  return renderMobile(<GlassSurface {...props}><Text>Favorites</Text></GlassSurface>);
}
it.each([false, true])("samples the focused screen with readable content in dark=%s", async (dark) => {
  settings.dark = dark;
  const view = await surface();
  expect(view.getByText("Favorites")).toBeTruthy();
  expect(view.getByTestId("native-blur").props).toMatchObject({ blurTarget: target, blurMethod: "dimezisBlurViewSdk31Plus", intensity: 60, tint: dark ? "dark" : "light" });
});
it("uses the opaque surface when Reduce Transparency is on", async () => {
  settings.reduced = true;
  const view = await surface();
  expect(view.queryByTestId("native-blur")).toBeNull();
  expect(view.getByText("Favorites")).toBeTruthy();
  expect(getAllHosts(view.container, "View").some((node) => node.props.className?.includes("bg-card"))).toBe(true);
});
it("keeps the tuned fallback without an Android blur target", async () => {
  const view = await surface(false);
  expect(view.queryByTestId("native-blur")).toBeNull();
  expect(view.getByText("Favorites")).toBeTruthy();
});
