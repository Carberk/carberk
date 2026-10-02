import { beforeEach, describe, expect, it, vi } from "vitest";

import CabinetScreen from "../../app/(tabs)/services";
import { localeStore } from "../../src/locale/localeStore";
import { themeStore } from "../../src/theme/themeStore";
import { fireEvent, renderMobile, routerMock } from "../render";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) },
}));

const auth = vi.hoisted(() => ({ isAuthenticated: false as boolean | null }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../../src/api/identity/useMe", () => ({
  useMe: () => ({
    data: { displayName: "Merdan", phone: "+99361234567", email: null, avatarUrl: null },
    isPending: false,
    isError: false,
  }),
}));

beforeEach(() => {
  localeStore.setState({ locale: "en" });
  themeStore.setState({ theme: "system" });
});

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
    expect(labels[theme + 1]).toBe(screen.i18n.t("support:help"));
    expect(labels.at(-1)).toBe(screen.i18n.t("support:about"));
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
