import { beforeEach, describe, expect, it, vi } from "vitest";

import CabinetScreen from "../../app/(tabs)/services";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { maskEmail } from "../../src/auth/email";
import { maskTmPhone } from "../../src/auth/phone";
import { localeStore } from "../../src/locale/localeStore";
import { themeStore } from "../../src/theme/themeStore";
import { fireEvent, renderMobile, routerMock } from "../render";

type Me = { displayName: string | null; phone: string | null; email: string | null; avatarUrl: string | null };
const state = vi.hoisted(() => ({
  isAuthenticated: false as boolean | null,
  me: { isPending: false, isError: false, data: undefined as Me | undefined },
  refetch: vi.fn(),
}));

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) },
}));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: state.isAuthenticated, phone: "" }) }));
vi.mock("../../src/api/identity/useMe", () => ({
  useMe: () => ({ ...state.me, error: new Error("Network request failed"), refetch: state.refetch }),
}));

const PHONE = "+99365123456";
const EMAIL = "aman@example.com";

function signedIn(me: Partial<Me> | "pending" | "error" = {}) {
  state.isAuthenticated = true;
  if (me === "pending") state.me = { isPending: true, isError: false, data: undefined };
  else if (me === "error") state.me = { isPending: false, isError: true, data: undefined };
  else state.me = { isPending: false, isError: false, data: { displayName: null, phone: PHONE, email: null, avatarUrl: null, ...me } };
}

beforeEach(() => {
  state.isAuthenticated = false;
  state.me = { isPending: false, isError: false, data: undefined };
  state.refetch.mockClear();
  localeStore.setState({ locale: "en" });
  themeStore.setState({ theme: "system" });
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
});

/** The menu rows every visitor sees, signed in or not. */
function expectMenuRows(view: ReturnType<typeof renderMobile>) {
  expect(view.getByRole("button", { name: "Language, English" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Theme, System" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Terms of Service" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Privacy Policy" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Posting rules" })).toBeTruthy();
}

describe("Cabinet signed out", () => {
  it("shows the Sign in row and the menu rows, and nothing that needs an account", () => {
    const view = renderMobile(<CabinetScreen />);
    expect(view.getByRole("button", { name: "Sign in, By phone or email" })).toBeTruthy();
    expectMenuRows(view);
    // No profile row in any of its states.
    expect(view.queryByLabelText(view.i18n.t("common:loading"))).toBeNull();
    expect(view.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(view.queryByRole("button", { name: maskTmPhone(PHONE) })).toBeNull();
    expect(view.queryByRole("button", { name: /My listings/ })).toBeNull();
    expect(view.queryByRole("button", { name: "Notifications" })).toBeNull();
    expect(view.queryByRole("button", { name: /Log out/ })).toBeNull();
    expect(view.queryByRole("button", { name: /Delete account/ })).toBeNull();
  });

  it("has no gear and no List a car action", () => {
    const view = renderMobile(<CabinetScreen />);
    expect(view.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(view.queryByText("List a car")).toBeNull();
    expect(view.queryByRole("button", { name: /List a car/ })).toBeNull();
  });

  it("returns to Cabinet after the code is confirmed", () => {
    const view = renderMobile(<CabinetScreen />);
    fireEvent.press(view.getByRole("button", { name: "Sign in, By phone or email" }));
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/(auth)/phone", params: { authRoot: "1" } });
    useAuthIntentStore.getState().completeSignIn(routerMock);
    expect(routerMock.dismissTo).toHaveBeenCalledWith("/(tabs)/services");
  });

  it.each(["en", "ru", "tk"])("reads the rows in %s", (locale) => {
    const view = renderMobile(<CabinetScreen />, { locale });
    const t = view.i18n.t.bind(view.i18n);
    expect(view.getByRole("button", { name: `${t("common:signIn")}, ${t("account:signInSub")}` })).toBeTruthy();
    for (const key of ["account:termsOfService", "account:privacyPolicy", "account:postingRules"]) {
      expect(view.getByRole("button", { name: t(key) })).toBeTruthy();
    }
    expect(view.getByText(t("common:cabinet"))).toBeTruthy();
  });
});

describe("Cabinet signed in", () => {
  it("shows the display name over the masked method, then Notifications and My listings above the menu rows", () => {
    signedIn({ displayName: "Aman" });
    const view = renderMobile(<CabinetScreen />);
    expect(view.getByRole("button", { name: `Aman, ${maskTmPhone(PHONE)}` })).toBeTruthy();
    expect(view.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(view.getByRole("button", { name: "My listings" })).toBeTruthy();
    expectMenuRows(view);
    // Rendered order: the profile row, Notifications, My listings, then the menu rows.
    const text = JSON.stringify(view.toJSON());
    expect(text.indexOf("Aman")).toBeLessThan(text.indexOf("Notifications"));
    expect(text.indexOf("Notifications")).toBeLessThan(text.indexOf("My listings"));
    expect(text.indexOf("My listings")).toBeLessThan(text.indexOf("Language"));
    expect(text.indexOf("Language")).toBeLessThan(text.indexOf("Posting rules"));
    expect(view.queryByRole("button", { name: /Sign in/ })).toBeNull();
    expect(view.queryByRole("button", { name: /Log out/ })).toBeNull();
    expect(view.queryByRole("button", { name: /Delete account/ })).toBeNull();
  });

  it("lists Notifications as the first menu row, then My listings", () => {
    signedIn({ displayName: "Aman" });
    const view = renderMobile(<CabinetScreen />);
    const names = view.getAllByRole("button").map((row) => row.props.accessibilityLabel);
    expect(names.slice(0, 4)).toEqual([`Aman, ${maskTmPhone(PHONE)}`, "Notifications", "My listings", "Language, English"]);
  });

  it("opens Notifications", () => {
    signedIn({ displayName: "Aman" });
    const view = renderMobile(<CabinetScreen />);
    fireEvent.press(view.getByRole("button", { name: "Notifications" }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/notifications");
  });

  it.each([
    ["ru", "Уведомления"],
    ["tk", "Habarnamalar"],
  ])("reads Notifications in %s", (locale, label) => {
    signedIn({ displayName: "Aman" });
    const view = renderMobile(<CabinetScreen />, { locale });
    expect(view.getByRole("button", { name: label })).toBeTruthy();
  });

  it("shows the masked method alone when there is no display name", () => {
    signedIn({ phone: null, email: EMAIL });
    const view = renderMobile(<CabinetScreen />);
    expect(view.getByRole("button", { name: maskEmail(EMAIL) })).toBeTruthy();
  });

  it("opens Profile and My listings", () => {
    signedIn({ displayName: "Aman" });
    const view = renderMobile(<CabinetScreen />);
    fireEvent.press(view.getByRole("button", { name: `Aman, ${maskTmPhone(PHONE)}` }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/profile");
    fireEvent.press(view.getByRole("button", { name: "My listings" }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/listings/manage");
  });

  it("shows a skeleton profile row while /me loads and keeps every menu row working", () => {
    signedIn("pending");
    const view = renderMobile(<CabinetScreen />);
    expect(view.getByLabelText(view.i18n.t("common:loading"))).toBeTruthy();
    expectMenuRows(view);
    expect(view.getByRole("button", { name: "My listings" })).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "Language, English" }));
    fireEvent.press(view.getByRole("radio", { name: "Русский" }));
    expect(localeStore.getState().locale).toBe("ru");
  });

  it("offers Retry when /me fails and keeps every menu row working", () => {
    signedIn("error");
    const view = renderMobile(<CabinetScreen />);
    fireEvent.press(view.getByRole("button", { name: "Retry" }));
    expect(state.refetch).toHaveBeenCalledOnce();
    expectMenuRows(view);
    fireEvent.press(view.getByRole("button", { name: "Theme, System" }));
    fireEvent.press(view.getByRole("radio", { name: "Dark" }));
    expect(themeStore.getState().theme).toBe("dark");
  });
});
