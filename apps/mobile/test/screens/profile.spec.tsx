import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfileScreen from "../../app/profile";
import { signInMethodNoticeStore } from "../../src/auth/signInMethodNotice";
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

const me: { id: string; displayName: string | null; phone: string | null; email: string | null; avatarUrl: string | null; role: string; createdAt: string } = {
  id: "user-1", displayName: "Aman", phone: "+99365123456", email: null, avatarUrl: null,
  role: "seller", createdAt: "2026-01-15T00:00:00.000Z",
};

beforeEach(() => {
  state.isAuthenticated = true;
  state.me = { isPending: false, isError: false, data: me };
  state.logout.mockClear();
  signInMethodNoticeStore.setState({ notice: null });
});

function withMe(overrides: Partial<typeof me>) {
  state.me = { isPending: false, isError: false, data: { ...me, ...overrides } };
}

const PHONE_ROW = "Phone, +993 65 XX-XX-56";
const EMAIL_ROW = "Email, a•••@example.com";

describe("Profile Sign-in Methods", () => {
  it("shows a phone-only User the name, a masked phone and Add for email", () => {
    const view = renderMobile(<ProfileScreen />);
    expect(view.getByText("Aman")).toBeTruthy();
    expect(view.getByText("Sign-in methods")).toBeTruthy();
    expect(view.getByRole("button", { name: PHONE_ROW })).toBeTruthy();
    expect(view.getByRole("button", { name: "Email, Add" })).toBeTruthy();
  });

  it("shows an email-only User without a name only the avatar and the rows", () => {
    withMe({ displayName: null, phone: null, email: "aman@example.com" });
    const view = renderMobile(<ProfileScreen />);
    expect(view.getByRole("button", { name: "Phone, Add" })).toBeTruthy();
    expect(view.getByRole("button", { name: EMAIL_ROW })).toBeTruthy();
    // No masked method stands in for the missing name.
    expect(view.getAllByText("a•••@example.com")).toHaveLength(1);
    expect(view.queryByText("Aman")).toBeNull();
  });

  it("shows both masked methods when the User has both", () => {
    withMe({ email: "aman@example.com" });
    const view = renderMobile(<ProfileScreen />);
    expect(view.getByRole("button", { name: PHONE_ROW })).toBeTruthy();
    expect(view.getByRole("button", { name: EMAIL_ROW })).toBeTruthy();
  });

  it("shows no role, tick, tenure or helper text, and no remove or switch control", () => {
    withMe({ email: "aman@example.com" });
    const view = renderMobile(<ProfileScreen />);
    for (const text of ["Seller", "Verified", "Member since", "Not added", "Both open this same account.", "Change"]) {
      expect(view.queryByText(text)).toBeNull();
    }
    expect(view.queryByRole("button", { name: /Remove|Switch account|Sign in/ })).toBeNull();
  });

  it("opens Add directly, with no confirm sheet", () => {
    const view = renderMobile(<ProfileScreen />);
    fireEvent.press(view.getByRole("button", { name: "Email, Add" }));
    expect(view.queryByText("Change email?")).toBeNull();
    expect(routerMock.push).toHaveBeenCalledWith("/account/add-email");
  });

  it.each([
    ["phone", PHONE_ROW, "Change phone?", "/account/add-phone"],
    ["email", EMAIL_ROW, "Change email?", "/account/add-email"],
  ])("asks before changing the %s; Continue opens the change screen", (_method, row, title, href) => {
    withMe({ email: "aman@example.com" });
    const view = renderMobile(<ProfileScreen />);
    fireEvent.press(view.getByRole("button", { name: row }));
    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText("After you confirm the new value with a code, the old one stops opening this account. Your listings and chats stay.")).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole("button", { name: "Continue" }));
    expect(routerMock.push).toHaveBeenCalledWith(href);
    expect(view.queryByText(title)).toBeNull();
  });

  it.each(["Cancel", "Close"])("closes the confirm sheet with %s and changes nothing", (control) => {
    const view = renderMobile(<ProfileScreen />);
    fireEvent.press(view.getByRole("button", { name: PHONE_ROW }));
    fireEvent.press(view.getByRole("button", { name: control }));
    expect(view.queryByText("Change phone?")).toBeNull();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it.each([
    ["added", "Added: +993 65 XX-XX-56"],
    ["changed", "Changed: +993 65 XX-XX-56"],
  ] as const)("says the method was %s, in the page and not over it", (kind, text) => {
    vi.useFakeTimers();
    try {
      signInMethodNoticeStore.getState().show({ kind, value: "+993 65 XX-XX-56" });
      const view = renderMobile(<ProfileScreen />);
      expect(view.getByText(text)).toBeTruthy();
      act(() => { vi.advanceTimersByTime(5000); });
      expect(view.queryByText(text)).toBeNull();
      expect(signInMethodNoticeStore.getState().notice).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the loading skeleton and the error Retry", () => {
    state.me = { isPending: true, isError: false, data: undefined };
    const loading = renderMobile(<ProfileScreen />);
    expect(loading.queryByText("Sign-in methods")).toBeNull();
    loading.unmount();
    state.me = { isPending: false, isError: true, data: undefined };
    const failed = renderMobile(<ProfileScreen />);
    expect(failed.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(failed.queryByText("Sign-in methods")).toBeNull();
  });

  it.each(["ru", "tk"])("reads the rows and the sheet in %s", (locale) => {
    const view = renderMobile(<ProfileScreen />, { locale });
    const t = view.i18n.t.bind(view.i18n);
    expect(view.getByText(t("account:signInMethods"))).toBeTruthy();
    expect(view.getByRole("button", { name: `${t("account:email")}, ${t("account:add")}` })).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: `${t("account:phone")}, +993 65 XX-XX-56` }));
    expect(view.getByText(t("account:changePhoneConfirmTitle"))).toBeTruthy();
    expect(view.getByText(t("account:changeMethodConfirmBody"))).toBeTruthy();
    expect(view.getByRole("button", { name: t("account:changeMethodContinue") })).toBeTruthy();
  });
});

describe("Profile account actions", () => {
  it("shows Log out and Delete account below the Sign-in Methods", () => {
    const view = renderMobile(<ProfileScreen />);
    expect(view.getByRole("button", { name: "Log out" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Delete account" })).toBeTruthy();
    // Rendered order: the Sign-in Methods, then Log out, then Delete account.
    const text = JSON.stringify(view.toJSON());
    expect(text.indexOf("Sign-in methods")).toBeGreaterThan(-1);
    expect(text.indexOf("Sign-in methods")).toBeLessThan(text.indexOf("Log out"));
    expect(text.indexOf("Log out")).toBeLessThan(text.indexOf("Delete account"));
  });

  it("asks before logging out; Cancel keeps the session", () => {
    const view = renderMobile(<ProfileScreen />);
    fireEvent.press(view.getByRole("button", { name: "Log out" }));
    expect(view.getByText("Log out?")).toBeTruthy();
    fireEvent.press(view.getByText("Cancel"));
    expect(state.logout).not.toHaveBeenCalled();
    expect(view.queryByText("Log out?")).toBeNull();
  });

  it("logs out after the User confirms", () => {
    const view = renderMobile(<ProfileScreen />);
    fireEvent.press(view.getByRole("button", { name: "Log out" }));
    // The dialog's own Log out button follows its title.
    fireEvent.press(first(view.getAllByText("Log out").reverse()));
    expect(state.logout).toHaveBeenCalledOnce();
  });

  it("opens the existing Delete account screen", () => {
    const view = renderMobile(<ProfileScreen />);
    fireEvent.press(view.getByRole("button", { name: "Delete account" }));
    expect(routerMock.push).toHaveBeenCalledWith("/account/delete");
  });

  it("keeps Log out reachable when /me fails", () => {
    state.me = { isPending: false, isError: true, data: undefined };
    const view = renderMobile(<ProfileScreen />);
    expect(view.getByRole("button", { name: "Log out" })).toBeTruthy();
  });

  it("shows no account actions to a signed-out visitor", () => {
    state.isAuthenticated = false;
    const view = renderMobile(<ProfileScreen />);
    expect(view.queryByRole("button", { name: "Log out" })).toBeNull();
    expect(view.queryByRole("button", { name: "Delete account" })).toBeNull();
  });

  it.each(["ru", "tk"])("reads the account rows in %s", (locale) => {
    const view = renderMobile(<ProfileScreen />, { locale });
    expect(view.getByRole("button", { name: view.i18n.t("account:logout") })).toBeTruthy();
    expect(view.getByRole("button", { name: view.i18n.t("account:deleteAccount") })).toBeTruthy();
  });
});
