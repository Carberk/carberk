import { useFocusEffect } from "expo-router";
import { waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CabinetScreen from "../../app/(tabs)/services";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { maskEmail } from "../../src/auth/email";
import { maskTmPhone } from "../../src/auth/phone";
import { localeStore } from "../../src/locale/localeStore";
import { themeStore } from "../../src/theme/themeStore";
import { queryKeys } from "../../src/api/queryKeys";
import { act, fireEvent, renderMobile, routerMock } from "../render";

type Me = { displayName: string | null; nameNumber: number; avatarIndex: number; avatarKey: string | null; phone: string | null; email: string | null; avatarUrl: string | null };
const state = vi.hoisted(() => ({
  isAuthenticated: false as boolean | null,
  me: { isPending: false, isError: false, data: undefined as Me | undefined },
  refetch: vi.fn(),
  userId: null as string | null,
  get: vi.fn(),
}));

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) },
}));
vi.mock("../../src/auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: state.isAuthenticated, phone: "", userId: state.userId }),
}));
vi.mock("../../src/api/client", () => ({ apiClient: { get: state.get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock("../../src/api/identity/useMe", () => ({
  useMe: () => ({ ...state.me, error: new Error("Network request failed"), refetch: state.refetch }),
}));

const PHONE = "+99365123456";
const EMAIL = "aman@example.com";
const USER_ID = "00000000-0000-4000-8000-00000000000a";
const counts = (total: number) => ({ active: 0, sold: 0, archived: 0, banned: 0, drafts: 0, total });

function signedIn(me: Partial<Me> | "pending" | "error" = {}) {
  state.isAuthenticated = true;
  state.userId = USER_ID;
  if (me === "pending") state.me = { isPending: true, isError: false, data: undefined };
  else if (me === "error") state.me = { isPending: false, isError: true, data: undefined };
  else state.me = { isPending: false, isError: false, data: { displayName: null, nameNumber: 4821, avatarIndex: 7, avatarKey: null, phone: PHONE, email: null, avatarUrl: null, ...me } };
}

beforeEach(() => {
  state.isAuthenticated = false;
  state.userId = null;
  state.get.mockReset().mockReturnValue(new Promise(() => {}));
  state.me = { isPending: false, isError: false, data: undefined };
  state.refetch.mockClear();
  localeStore.setState({ locale: "en" });
  themeStore.setState({ theme: "system" });
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
});

/** The menu rows every visitor sees, signed in or not. */
function expectMenuRows(view: Awaited<ReturnType<typeof renderMobile>>) {
  expect(view.getByRole("button", { name: "Language, English" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Theme, System" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Terms of Service" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Privacy Policy" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Posting rules" })).toBeTruthy();
}

describe("Cabinet signed out", () => {
  it("shows the Sign in row and the menu rows, and nothing that needs an account", async () => {
    const view = await renderMobile(<CabinetScreen />);
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
    expect(state.get).not.toHaveBeenCalled();
  });

  it("has no gear and no List a car action", async () => {
    const view = await renderMobile(<CabinetScreen />);
    expect(view.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(view.queryByText("List a car")).toBeNull();
    expect(view.queryByRole("button", { name: /List a car/ })).toBeNull();
  });

  it("returns to Cabinet after the code is confirmed", async () => {
    const view = await renderMobile(<CabinetScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Sign in, By phone or email" }));
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/(auth)/phone", params: { authRoot: "1" } });
    useAuthIntentStore.getState().completeSignIn(routerMock);
    expect(routerMock.dismissTo).toHaveBeenCalledWith("/(tabs)/services");
  });

  it.each(["en", "ru", "tk"])("reads the rows in %s", async (locale) => {
    const view = await renderMobile(<CabinetScreen />, { locale });
    const t = view.i18n.t.bind(view.i18n);
    expect(view.getByRole("button", { name: `${t("common:signIn")}, ${t("account:signInSub")}` })).toBeTruthy();
    for (const key of ["account:termsOfService", "account:privacyPolicy", "account:postingRules"]) {
      expect(view.getByRole("button", { name: t(key) })).toBeTruthy();
    }
    expect(view.getByText(t("common:cabinet"))).toBeTruthy();
  });
});

describe("Cabinet signed in", () => {
  it("shows the display name over the masked method, then Notifications and My listings above the menu rows", async () => {
    signedIn({ displayName: "Aman" });
    const view = await renderMobile(<CabinetScreen />);
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

  it("lists Notifications as the first menu row, then My listings", async () => {
    signedIn({ displayName: "Aman" });
    const view = await renderMobile(<CabinetScreen />);
    const names = view.getAllByRole("button").map((row) => row.props.accessibilityLabel);
    expect(names.slice(0, 4)).toEqual([`Aman, ${maskTmPhone(PHONE)}`, "Notifications", "My listings", "Language, English"]);
  });

  it("opens Notifications", async () => {
    signedIn({ displayName: "Aman" });
    const view = await renderMobile(<CabinetScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Notifications" }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/notifications");
  });

  it.each([
    ["ru", "Уведомления"],
    ["tk", "Habarnamalar"],
  ])("reads Notifications in %s", async (locale, label) => {
    signedIn({ displayName: "Aman" });
    const view = await renderMobile(<CabinetScreen />, { locale });
    expect(view.getByRole("button", { name: label })).toBeTruthy();
  });

  it("shows the generated name over the masked method when there is no display name", async () => {
    signedIn({ phone: null, email: EMAIL });
    const view = await renderMobile(<CabinetScreen />);
    expect(view.getByRole("button", { name: `Driver 4821, ${maskEmail(EMAIL)}` })).toBeTruthy();
  });

  it("opens Profile and My listings", async () => {
    signedIn({ displayName: "Aman" });
    const view = await renderMobile(<CabinetScreen />);
    await fireEvent.press(view.getByRole("button", { name: `Aman, ${maskTmPhone(PHONE)}` }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/profile");
    await fireEvent.press(view.getByRole("button", { name: "My listings" }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/listings/manage");
  });

  it("shows a skeleton profile row while /me loads and keeps every menu row working", async () => {
    signedIn("pending");
    const view = await renderMobile(<CabinetScreen />);
    expect(view.getByLabelText(view.i18n.t("common:loading"))).toBeTruthy();
    expectMenuRows(view);
    expect(view.getByRole("button", { name: "My listings" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Language, English" }));
    await fireEvent.press(view.getByRole("radio", { name: "Русский" }));
    expect(localeStore.getState().locale).toBe("ru");
  });

  it("offers Retry when /me fails and keeps every menu row working", async () => {
    signedIn("error");
    const view = await renderMobile(<CabinetScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Retry" }));
    expect(state.refetch).toHaveBeenCalledOnce();
    expectMenuRows(view);
    await fireEvent.press(view.getByRole("button", { name: "Theme, System" }));
    await fireEvent.press(view.getByRole("radio", { name: "Dark" }));
    expect(themeStore.getState().theme).toBe("dark");
  });
});

describe("Cabinet My listings total", () => {
  /** Settles the counts request the row made on mount. */
  async function settle() {
    await act(async () => { await Promise.resolve(); });
  }

  it("shows the total on the row and reads it with the row label", async () => {
    signedIn({ displayName: "Aman" });
    state.get.mockResolvedValue(counts(5));
    const view = await renderMobile(<CabinetScreen />);
    expect(await view.findByRole("button", { name: "My listings, 5" })).toBeTruthy();
    expect(view.getByText("5")).toBeTruthy();
    expect(state.get).toHaveBeenCalledWith("/me/listings/counts", expect.anything());
    await fireEvent.press(view.getByRole("button", { name: "My listings, 5" }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/listings/manage");
  });

  it.each([
    ["the total is zero", () => state.get.mockResolvedValue(counts(0))],
    ["the request is pending", () => state.get.mockReturnValue(new Promise(() => {}))],
    ["the request fails", () => state.get.mockRejectedValue(new Error("Network request failed"))],
  ])("shows the row without a number when %s, and it still opens My listings", async (_name, arrange) => {
    signedIn({ displayName: "Aman" });
    arrange();
    const view = await renderMobile(<CabinetScreen />);
    await settle();
    await settle();
    expect(state.get).toHaveBeenCalledOnce();
    const row = view.getByRole("button", { name: "My listings" });
    expect(view.queryByText("0")).toBeNull();
    await fireEvent.press(row);
    expect(routerMock.push).toHaveBeenLastCalledWith("/listings/manage");
  });

  it("updates the number when a mutation invalidates the counts", async () => {
    signedIn({ displayName: "Aman" });
    state.get.mockResolvedValueOnce(counts(5)).mockResolvedValueOnce(counts(4));
    const view = await renderMobile(<CabinetScreen />);
    await view.findByRole("button", { name: "My listings, 5" });
    await act(async () => { await view.queryClient.invalidateQueries({ queryKey: queryKeys.listings.all() }); });
    expect(await view.findByRole("button", { name: "My listings, 4" })).toBeTruthy();
  });

  it.each(["focus", "invalidation"])("hides the cached number after a failed %s refetch and still opens My listings", async (trigger) => {
    signedIn();
    state.get.mockResolvedValueOnce(counts(5)).mockRejectedValueOnce(new Error("Network request failed"));
    const view = await renderMobile(<CabinetScreen />);
    await view.findByRole("button", { name: "My listings, 5" });

    await act(async () => {
      if (trigger === "focus") vi.mocked(useFocusEffect).mock.lastCall?.[0]();
      else await view.queryClient.invalidateQueries({ queryKey: queryKeys.listings.myCountsAll() });
    });
    await waitFor(() => expect(view.queryClient.getQueryState(queryKeys.listings.myCounts(USER_ID))?.status).toBe("error"));
    expect(state.get).toHaveBeenCalledTimes(2);
    expect(view.queryClient.getQueryData(queryKeys.listings.myCounts(USER_ID))).toEqual(counts(5));
    await waitFor(() => expect(view.getByRole("button", { name: /^My listings$/ }).props.accessibilityLabel).toBe("My listings"));
    const row = view.getByRole("button", { name: /^My listings$/ });
    expect(view.queryByText("5")).toBeNull();
    await fireEvent.press(row);
    expect(routerMock.push).toHaveBeenLastCalledWith("/listings/manage");
  });

  it.each(["focus", "invalidation"])("keeps the cached number during a pending %s refetch, keeps navigation and shows the next total", async (trigger) => {
    signedIn();
    let resolveCounts: (value: ReturnType<typeof counts>) => void = () => {};
    state.get.mockResolvedValueOnce(counts(5)).mockReturnValueOnce(new Promise((resolve) => { resolveCounts = resolve; }));
    const view = await renderMobile(<CabinetScreen />);
    await view.findByRole("button", { name: "My listings, 5" });

    await act(async () => {
      if (trigger === "focus") vi.mocked(useFocusEffect).mock.lastCall?.[0]();
      else void view.queryClient.invalidateQueries({ queryKey: queryKeys.listings.myCountsAll() });
    });
    await waitFor(() => expect(view.queryClient.getQueryState(queryKeys.listings.myCounts(USER_ID))?.fetchStatus).toBe("fetching"));
    expect(state.get).toHaveBeenCalledTimes(2);
    // The number does not blink out on each refresh (#665).
    await settle();
    const row = view.getByRole("button", { name: "My listings, 5" });
    expect(view.getByText("5")).toBeTruthy();
    await fireEvent.press(row);
    expect(routerMock.push).toHaveBeenLastCalledWith("/listings/manage");

    await act(async () => { resolveCounts(counts(7)); });
    expect(await view.findByRole("button", { name: "My listings, 7" })).toBeTruthy();
  });

  it("refreshes the number when Cabinet comes back into view", async () => {
    signedIn({ displayName: "Aman" });
    state.get.mockResolvedValueOnce(counts(5)).mockResolvedValueOnce(counts(7));
    const view = await renderMobile(<CabinetScreen />);
    await view.findByRole("button", { name: "My listings, 5" });
    const onFocus = vi.mocked(useFocusEffect).mock.lastCall?.[0];
    expect(onFocus).toBeTypeOf("function");
    await act(async () => { onFocus?.(); });
    expect(await view.findByRole("button", { name: "My listings, 7" })).toBeTruthy();
  });
});
