import { describe, expect, it, vi } from "vitest";

import CabinetScreen from "../../app/(tabs)/services";
import { fireEvent, renderMobile, routerMock } from "../render";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
// The installed avatar distribution imports an extensionless path Node cannot resolve.
vi.mock("@rn-primitives/avatar", async () => {
  const native = await import("react-native");
  return { Root: native.View, Image: native.Image, Fallback: native.View };
});

const auth = vi.hoisted(() => ({ isAuthenticated: false as boolean | null }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../../src/api/identity/useMe", () => ({
  useMe: () => ({
    data: { displayName: "Merdan", phone: "+99361234567", email: null, avatarUrl: null },
    isPending: false,
    isError: false,
  }),
}));

describe.each([
  ["signed out", false],
  ["signed in", true],
])("Cabinet %s", (_, signedIn) => {
  it("lists Help right after Theme and, last, About the app", () => {
    auth.isAuthenticated = signedIn;
    const screen = renderMobile(<CabinetScreen />);

    const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
    const theme = labels.findIndex((l) => String(l).startsWith(screen.i18n.t("account:theme")));
    expect(theme).toBeGreaterThan(-1);
    expect(labels[theme + 1]).toBe("Help");
    expect(labels.at(-1)).toBe("About the app");
  });

  it("opens Help and About", () => {
    auth.isAuthenticated = signedIn;
    const screen = renderMobile(<CabinetScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Help" }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/help");
    fireEvent.press(screen.getByRole("button", { name: "About the app" }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/about");
  });
});
