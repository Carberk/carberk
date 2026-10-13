import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfileScreen from "../../app/profile";
import { profileNoticeStore } from "../../src/identity/profileNotice";
import { act, fireEvent, first, renderMobile, routerMock } from "../render";

const state = vi.hoisted(() => ({
  isAuthenticated: true as boolean | null,
  me: { isPending: false, isError: false, data: undefined as unknown },
  logout: vi.fn(),
}));

vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: state.isAuthenticated, phone: "" }) }));
vi.mock("../../src/auth/useLogout", () => ({ useLogout: () => ({ mutate: state.logout, isPending: false }) }));
vi.mock("../../src/api/identity/useMe", () => ({
  useMe: () => ({ ...state.me, error: new Error("Network request failed"), refetch: vi.fn() }),
}));

const me: { id: string; displayName: string | null; nameNumber: number; avatarIndex: number; avatarKey: string | null; phone: string | null; email: string | null; avatarUrl: string | null; role: string; createdAt: string } = {
  id: "user-1", displayName: "Aman", nameNumber: 4821, avatarIndex: 7, avatarKey: null, phone: "+99365123456", email: null, avatarUrl: null,
  role: "seller", createdAt: "2026-01-15T00:00:00.000Z",
};

beforeEach(() => {
  state.isAuthenticated = true;
  state.me = { isPending: false, isError: false, data: me };
  state.logout.mockClear();
  profileNoticeStore.setState({ notice: null });
});

function withMe(overrides: Partial<typeof me>) {
  state.me = { isPending: false, isError: false, data: { ...me, ...overrides } };
}

const PHONE_ROW = "Phone, +993 65 XX-XX-56";
const EMAIL_ROW = "Email, a•••@example.com";

describe("Profile Sign-in Methods", () => {
  it("shows a phone-only User the name, a masked phone and Add for email", async () => {
    const view = await renderMobile(<ProfileScreen />);
    expect(view.getByText("Aman")).toBeTruthy();
    expect(view.getByText("Sign-in methods")).toBeTruthy();
    expect(view.getByRole("button", { name: PHONE_ROW })).toBeTruthy();
    expect(view.getByRole("button", { name: "Email, Add" })).toBeTruthy();
  });

  it("shows an email-only User without a name the generated name, the avatar and the rows", async () => {
    withMe({ displayName: null, phone: null, email: "aman@example.com" });
    const view = await renderMobile(<ProfileScreen />);
    expect(view.getByRole("button", { name: "Phone, Add" })).toBeTruthy();
    expect(view.getByRole("button", { name: EMAIL_ROW })).toBeTruthy();
    // No masked method stands in for the missing name.
    expect(view.getAllByText("a•••@example.com")).toHaveLength(1);
    expect(view.queryByText("Aman")).toBeNull();
    expect(view.getByText("Driver 4821")).toBeTruthy();
  });

  it("shows both masked methods when the User has both", async () => {
    withMe({ email: "aman@example.com" });
    const view = await renderMobile(<ProfileScreen />);
    expect(view.getByRole("button", { name: PHONE_ROW })).toBeTruthy();
    expect(view.getByRole("button", { name: EMAIL_ROW })).toBeTruthy();
  });

  it("shows no role, tick, tenure or helper text, and no remove or switch control", async () => {
    withMe({ email: "aman@example.com" });
    const view = await renderMobile(<ProfileScreen />);
    for (const text of ["Seller", "Verified", "Member since", "Not added", "Both open this same account.", "Change"]) {
      expect(view.queryByText(text)).toBeNull();
    }
    expect(view.queryByRole("button", { name: /Remove|Switch account|Sign in/ })).toBeNull();
  });

  it("opens Add directly, with no confirm sheet", async () => {
    const view = await renderMobile(<ProfileScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Email, Add" }));
    expect(view.queryByText("Change email?")).toBeNull();
    expect(routerMock.push).toHaveBeenCalledWith("/account/add-email");
  });

  it.each([
    ["phone", PHONE_ROW, "Change phone?", "/account/add-phone"],
    ["email", EMAIL_ROW, "Change email?", "/account/add-email"],
  ])("asks before changing the %s; Continue opens the change screen", async (_method, row, title, href) => {
    withMe({ email: "aman@example.com" });
    const view = await renderMobile(<ProfileScreen />);
    await fireEvent.press(view.getByRole("button", { name: row }));
    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText("After you confirm the new value with a code, the old one stops opening this account. Your listings and chats stay.")).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("button", { name: "Continue" }));
    expect(routerMock.push).toHaveBeenCalledWith(href);
    expect(view.queryByText(title)).toBeNull();
  });

  it.each(["Cancel", "Close"])("closes the confirm sheet with %s and changes nothing", async (control) => {
    const view = await renderMobile(<ProfileScreen />);
    await fireEvent.press(view.getByRole("button", { name: PHONE_ROW }));
    await fireEvent.press(view.getByRole("button", { name: control }));
    expect(view.queryByText("Change phone?")).toBeNull();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it.each([
    ["added", "Added: +993 65 XX-XX-56"],
    ["changed", "Changed: +993 65 XX-XX-56"],
  ] as const)("says the method was %s, in the page and not over it", async (kind, text) => {
    vi.useFakeTimers();
    try {
      profileNoticeStore.getState().show({ kind, value: "+993 65 XX-XX-56" });
      const view = await renderMobile(<ProfileScreen />);
      expect(view.getByText(text)).toBeTruthy();
      await act(() => { vi.advanceTimersByTime(5000); });
      expect(view.queryByText(text)).toBeNull();
      expect(profileNoticeStore.getState().notice).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the loading skeleton and the error Retry", async () => {
    state.me = { isPending: true, isError: false, data: undefined };
    const loading = await renderMobile(<ProfileScreen />);
    expect(loading.queryByText("Sign-in methods")).toBeNull();
    await loading.unmount();
    state.me = { isPending: false, isError: true, data: undefined };
    const failed = await renderMobile(<ProfileScreen />);
    expect(failed.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(failed.queryByText("Sign-in methods")).toBeNull();
  });

  it.each(["ru", "tk"])("reads the rows and the sheet in %s", async (locale) => {
    const view = await renderMobile(<ProfileScreen />, { locale });
    const t = view.i18n.t.bind(view.i18n);
    expect(view.getByText(t("account:signInMethods"))).toBeTruthy();
    expect(view.getByRole("button", { name: `${t("account:email")}, ${t("account:add")}` })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: `${t("account:phone")}, +993 65 XX-XX-56` }));
    expect(view.getByText(t("account:changePhoneConfirmTitle"))).toBeTruthy();
    expect(view.getByText(t("account:changeMethodConfirmBody"))).toBeTruthy();
    expect(view.getByRole("button", { name: t("account:changeMethodContinue") })).toBeTruthy();
  });
});

describe("Profile account actions", () => {
  it("shows Log out and Delete account below the Sign-in Methods", async () => {
    const view = await renderMobile(<ProfileScreen />);
    expect(view.getByRole("button", { name: "Log out" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Delete account" })).toBeTruthy();
    // Rendered order: the Sign-in Methods, then Log out, then Delete account.
    const text = JSON.stringify(view.toJSON());
    expect(text.indexOf("Sign-in methods")).toBeGreaterThan(-1);
    expect(text.indexOf("Sign-in methods")).toBeLessThan(text.indexOf("Log out"));
    expect(text.indexOf("Log out")).toBeLessThan(text.indexOf("Delete account"));
  });

  it("asks before logging out; Cancel keeps the session", async () => {
    const view = await renderMobile(<ProfileScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Log out" }));
    expect(view.getByText("Log out?")).toBeTruthy();
    await fireEvent.press(view.getByText("Cancel"));
    expect(state.logout).not.toHaveBeenCalled();
    expect(view.queryByText("Log out?")).toBeNull();
  });

  it("logs out after the User confirms", async () => {
    const view = await renderMobile(<ProfileScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Log out" }));
    // The dialog's own Log out button follows its title.
    await fireEvent.press(first(view.getAllByText("Log out").reverse()));
    expect(state.logout).toHaveBeenCalledOnce();
  });

  it("opens the existing Delete account screen", async () => {
    const view = await renderMobile(<ProfileScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Delete account" }));
    expect(routerMock.push).toHaveBeenCalledWith("/account/delete");
  });

  it("keeps Log out reachable when /me fails", async () => {
    state.me = { isPending: false, isError: true, data: undefined };
    const view = await renderMobile(<ProfileScreen />);
    expect(view.getByRole("button", { name: "Log out" })).toBeTruthy();
  });

  it("shows no account actions to a signed-out visitor", async () => {
    state.isAuthenticated = false;
    const view = await renderMobile(<ProfileScreen />);
    expect(view.queryByRole("button", { name: "Log out" })).toBeNull();
    expect(view.queryByRole("button", { name: "Delete account" })).toBeNull();
  });

  it.each(["ru", "tk"])("reads the account rows in %s", async (locale) => {
    const view = await renderMobile(<ProfileScreen />, { locale });
    expect(view.getByRole("button", { name: view.i18n.t("account:logout") })).toBeTruthy();
    expect(view.getByRole("button", { name: view.i18n.t("account:deleteAccount") })).toBeTruthy();
  });
});

// Profile loads these native modules; only this spec supplies its stand-ins.
vi.mock("expo-file-system/legacy", async () => (await import("../profile-photo-device")).fileSystemFake);
vi.mock("expo-image-manipulator", async () => (await import("../profile-photo-device")).imageManipulatorFake);
