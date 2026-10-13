import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryAllHosts, renderMobile } from "../render";
import type { TabScreen } from "../../components/navigation/TabScreen";
import { Text } from "../../components/ui/text";

const device = vi.hoisted(() => ({ liquidGlass: true, reduced: false }));
vi.mock("@/lib/motion", () => ({ useReduceTransparency: () => device.reduced }));
vi.mock("nativewind", () => ({ cssInterop: vi.fn(), useColorScheme: () => ({ colorScheme: "dark" }) }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

/** `GlassSurface` reads the system glass once, when its module loads. */
async function onDevice({ liquidGlass, reduced = false }: { liquidGlass: boolean; reduced?: boolean }) {
  device.liquidGlass = liquidGlass;
  device.reduced = reduced;
  vi.resetModules();
  vi.doMock("expo-glass-effect", async () => {
    const { View } = await import("react-native");
    return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => device.liquidGlass, isGlassEffectAPIAvailable: () => device.liquidGlass };
  });
  const screen = await import("../../components/navigation/TabScreen");
  return { TabScreen: screen.TabScreen as typeof TabScreen };
}

/**
 * The ScrollEdgeFade views: test-renderer keeps only host elements, and the
 * fade is the only View drawn with the platform gradient.
 */
const edgeFades = (view: Awaited<ReturnType<typeof renderMobile>>) =>
  queryAllHosts(view.container, "View").filter((node) => typeof node.props.style?.experimental_backgroundImage === "string");

beforeEach(() => { device.liquidGlass = true; device.reduced = false; });

describe("The page tone under the tab bar", () => {
  it("is not drawn where content runs under a tab bar of system glass, so the glass shows the content", async () => {
    const { TabScreen } = await onDevice({ liquidGlass: true });
    const view = await renderMobile(<TabScreen underTabBar overlay={<Text>Filters</Text>}><Text>Listing photo</Text></TabScreen>);
    expect(edgeFades(view)).toHaveLength(0);
    expect(view.getByText("Listing photo")).toBeTruthy();
    expect(view.getByText("Filters")).toBeTruthy();
  });

  it("stays where the tab bar is the opaque surface: Reduce Transparency", async () => {
    const { TabScreen } = await onDevice({ liquidGlass: true, reduced: true });
    const view = await renderMobile(<TabScreen underTabBar><Text>Listing photo</Text></TabScreen>);
    expect(edgeFades(view)).toHaveLength(1);
  });

  it("stays where there is no system glass: Android and iOS below 26", async () => {
    const { TabScreen } = await onDevice({ liquidGlass: false });
    const view = await renderMobile(<TabScreen underTabBar><Text>Listing photo</Text></TabScreen>);
    expect(edgeFades(view)).toHaveLength(1);
  });

  it("stays on a screen that stops above the tab bar (Sell, with its pinned button), where only the page is behind the glass", async () => {
    const { TabScreen } = await onDevice({ liquidGlass: true });
    const view = await renderMobile(<TabScreen><Text>Sell</Text></TabScreen>);
    expect(edgeFades(view)).toHaveLength(1);
  });

  it("is still left out when the screen turns it off", async () => {
    const { TabScreen } = await onDevice({ liquidGlass: false });
    const view = await renderMobile(<TabScreen edgeFade={false}><Text>Search</Text></TabScreen>);
    expect(edgeFades(view)).toHaveLength(0);
  });
});
