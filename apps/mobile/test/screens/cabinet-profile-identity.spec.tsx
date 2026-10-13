import type { ReactElement } from "react";
import { delay, http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CabinetScreen from "../../app/(tabs)/services";
import ProfileScreen from "../../app/profile";
import { clearAuthSession, storeAuthSession } from "../../src/auth/session";
import { server } from "../msw";
import { act, fireEvent, first, renderMobile, routerMock, queryAllHosts } from "../render";

import { ToastProvider } from "@/components/ui/toast";

// Cabinet and Profile with the real session, API client and `/me` query
// against an in-memory API. Only the device's storage is replaced.

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
  deleteItemAsync: async (key: string) => { storage.delete(key); },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const AMAN_ID = "00000000-0000-4000-8000-00000000000a";
const MERDAN_ID = "00000000-0000-4000-8000-00000000000b";

function meOf(overrides: Record<string, unknown> = {}) {
  return {
    id: AMAN_ID, phone: "+99365123456", email: null, phoneVerified: true,
    displayName: null, nameNumber: 4821, avatarIndex: 7, avatarKey: null,
    role: "buyer", avatarUrl: null, locale: "ru",
    createdAt: "2026-01-15T00:00:00.000Z", deletionScheduledAt: null,
    ...overrides,
  };
}

const PHONE = "+993 65 XX-XX-56";
// The first stroke of the key (index 7) and of the SUV (index 2).
const KEY_MARK = "M11.5 12H21M17 12v3M20 12v2.4M6.5 12h.01";
const SUV_MARK = "M3 15V9.4C3 8.6 3.6 8 4.4 8H15l3.2 3.6 2.8.6V15";
const LONG_NAME = "Abdyrahman Gurbanguly Atamyrad";

/** What `/me` answers for each access token, and how often it was asked. */
const api = { users: new Map<string, () => Promise<Response> | Response>(), meRequests: 0 };

function serve(token: string, me: Record<string, unknown>) {
  api.users.set(token, () => HttpResponse.json(me));
}

async function signIn(token: string, id = AMAN_ID) {
  await storeAuthSession({
    accessToken: token, refreshToken: `refresh-${token}`,
    user: { id, phone: "+99365123456", email: null, displayName: null, role: "buyer" },
  });
}

beforeEach(async () => {
  storage.clear();
  // The app remembers the session it last read, so the previous test's User is signed out too.
  await clearAuthSession();
  api.users.clear();
  api.meRequests = 0;
  server.use(
    http.get("*/me", ({ request }) => {
      api.meRequests += 1;
      const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
      return api.users.get(token)?.() ?? HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    }),
    http.get("*/me/listings/counts", () =>
      HttpResponse.json({ active: 0, sold: 0, archived: 0, banned: 0, drafts: 0, total: 0 })),
    http.post("*/auth/logout", () => HttpResponse.json({})),
    http.post("*/auth/refresh", () => HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 })),
  );
});

function render(screen: ReactElement, options?: { locale?: string }) {
  return renderMobile(<ToastProvider>{screen}</ToastProvider>, options);
}

type View = Awaited<ReturnType<typeof renderMobile>>;
type Host = { type: unknown; props: Record<string, unknown>; parent: Host | null };

/** Rendered host nodes of one native type, such as the avatar's `Svg`. */
const hosts = (view: View, type: string) => queryAllHosts(view.container, type) as unknown as Host[];
/** The native view that holds the avatar's drawing: its circle. */
function avatarCircle(view: View): Record<string, unknown> {
  let node = first(hosts(view, "Svg")).parent;
  while (node && typeof node.type !== "string") node = node.parent;
  const { style, accessible, accessibilityElementsHidden, importantForAccessibility } = node?.props ?? {};
  return { style, accessible, accessibilityElementsHidden, importantForAccessibility };
}
const marks = (view: View) => hosts(view, "Path").map((path) => path.props.d);
const personIcons = (view: View) => hosts(view, "Icon").filter((icon) => icon.props.name === "User");

describe("Cabinet profile row", () => {
  it.each([
    ["en", "Driver 4821"],
    ["ru", "Водитель 4821"],
    ["tk", "Sürüji 4821"],
  ])("shows a User without a name their generated name in %s, over the masked method", async (locale, name) => {
    serve("aman", meOf());
    await signIn("aman");
    const view = await render(<CabinetScreen />, { locale });
    expect(await view.findByRole("button", { name: `${name}, ${PHONE}` })).toBeTruthy();
    expect(view.getByText(name)).toBeTruthy();
    expect(view.getByText(PHONE)).toBeTruthy();
  });

  it("changes the generated name with the app language, without a reload", async () => {
    serve("aman", meOf());
    await signIn("aman");
    const view = await render(<CabinetScreen />);
    await view.findByRole("button", { name: `Driver 4821, ${PHONE}` });
    await act(async () => { await view.i18n.changeLanguage("ru"); });
    expect(view.getByRole("button", { name: `Водитель 4821, ${PHONE}` })).toBeTruthy();
    expect(view.queryByText("Driver 4821")).toBeNull();
    expect(api.meRequests).toBe(1);
  });

  it("shows the name the User set, over the masked method", async () => {
    serve("aman", meOf({ displayName: "Aman" }));
    await signIn("aman");
    const view = await render(<CabinetScreen />);
    expect(await view.findByRole("button", { name: `Aman, ${PHONE}` })).toBeTruthy();
    expect(view.queryByText(/4821/)).toBeNull();
  });

  it("shows an email-only User the generated name over the masked email", async () => {
    serve("aman", meOf({ phone: null, phoneVerified: false, email: "aman@example.com" }));
    await signIn("aman");
    const view = await render(<CabinetScreen />);
    expect(await view.findByRole("button", { name: "Driver 4821, a•••@example.com" })).toBeTruthy();
  });

  it("draws the User's car mark at 48 points, with no letter and no person icon", async () => {
    serve("aman", meOf({ displayName: "Aman" }));
    await signIn("aman");
    const view = await render(<CabinetScreen />);
    await view.findByRole("button", { name: `Aman, ${PHONE}` });
    expect(marks(view)).toEqual([KEY_MARK]);
    expect(avatarCircle(view).style).toMatchObject({ width: 48, height: 48 });
    expect(view.queryByText("A")).toBeNull();
    expect(personIcons(view)).toHaveLength(0);
  });

  it("still draws a mark for an avatar index this app does not have", async () => {
    serve("aman", meOf({ avatarIndex: 14 }));
    await signIn("aman");
    const view = await render(<CabinetScreen />);
    await view.findByRole("button", { name: `Driver 4821, ${PHONE}` });
    expect(marks(view)[0]).toBe(SUV_MARK);
  });

  it("keeps a 30-character name on one line, with the masked method under it", async () => {
    serve("aman", meOf({ displayName: LONG_NAME }));
    await signIn("aman");
    const view = await render(<CabinetScreen />);
    await view.findByRole("button", { name: `${LONG_NAME}, ${PHONE}` });
    expect(view.getByText(LONG_NAME).props.numberOfLines).toBe(1);
    expect(view.getByText(PHONE)).toBeTruthy();
  });

  it("is read as one button with the name and the method; the avatar is not read on its own", async () => {
    serve("aman", meOf());
    await signIn("aman");
    const view = await render(<CabinetScreen />);
    const row = await view.findByRole("button", { name: `Driver 4821, ${PHONE}` });
    expect(view.queryByRole("image")).toBeNull();
    expect(avatarCircle(view)).toMatchObject({
      accessible: false, accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants",
    });
    await fireEvent.press(row);
    expect(routerMock.push).toHaveBeenLastCalledWith("/profile");
  });

  it("keeps the signed-out row: Sign in, the person icon, no car and no request", async () => {
    const view = await render(<CabinetScreen />);
    expect(await view.findByRole("button", { name: "Sign in, By phone or email" })).toBeTruthy();
    expect(personIcons(view)).toHaveLength(1);
    expect(hosts(view, "Svg")).toHaveLength(0);
    expect(api.meRequests).toBe(0);
  });

  it("keeps the skeleton row while /me loads", async () => {
    api.users.set("aman", async () => { await delay("infinite"); return HttpResponse.json(meOf()); });
    await signIn("aman");
    const view = await render(<CabinetScreen />);
    expect(await view.findByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(view.getByLabelText("Please wait...")).toBeTruthy();
    expect(hosts(view, "Svg")).toHaveLength(0);
    expect(personIcons(view)).toHaveLength(0);
  });

  it("keeps the person icon and Retry when /me fails, then shows the name after Retry", async () => {
    api.users.set("aman", () => HttpResponse.json({ code: "INTERNAL" }, { status: 500 }));
    await signIn("aman");
    const view = await render(<CabinetScreen />);
    const retry = await view.findByRole("button", { name: "Retry" });
    expect(view.getByText("Something went wrong")).toBeTruthy();
    expect(personIcons(view)).toHaveLength(1);
    expect(hosts(view, "Svg")).toHaveLength(0);
    serve("aman", meOf());
    await fireEvent.press(retry);
    expect(await view.findByRole("button", { name: `Driver 4821, ${PHONE}` })).toBeTruthy();
  });
});

describe("Profile header", () => {
  it.each([
    ["en", "Driver 4821"],
    ["ru", "Водитель 4821"],
    ["tk", "Sürüji 4821"],
  ])("shows a User without a name their generated name in %s", async (locale, name) => {
    serve("aman", meOf());
    await signIn("aman");
    const view = await render(<ProfileScreen />, { locale });
    expect(await view.findByText(name)).toBeTruthy();
  });

  it("changes the generated name with the app language, without a reload", async () => {
    serve("aman", meOf());
    await signIn("aman");
    const view = await render(<ProfileScreen />);
    await view.findByText("Driver 4821");
    await act(async () => { await view.i18n.changeLanguage("tk"); });
    expect(view.getByText("Sürüji 4821")).toBeTruthy();
    expect(view.queryByText("Driver 4821")).toBeNull();
  });

  it("shows the name the User set", async () => {
    serve("aman", meOf({ displayName: "Aman" }));
    await signIn("aman");
    const view = await render(<ProfileScreen />);
    expect(await view.findByText("Aman")).toBeTruthy();
    expect(view.queryByText(/4821/)).toBeNull();
  });

  it("draws the User's car mark at 72 points, with no letter and no person icon", async () => {
    serve("aman", meOf({ displayName: "Aman" }));
    await signIn("aman");
    const view = await render(<ProfileScreen />);
    await view.findByText("Aman");
    expect(marks(view)).toEqual([KEY_MARK]);
    expect(avatarCircle(view).style).toMatchObject({ width: 72, height: 72 });
    expect(view.queryByText("A")).toBeNull();
    expect(personIcons(view)).toHaveLength(0);
  });

  it("still draws a mark for an avatar index this app does not have", async () => {
    serve("aman", meOf({ avatarIndex: 14 }));
    await signIn("aman");
    const view = await render(<ProfileScreen />);
    await view.findByText("Driver 4821");
    expect(marks(view)[0]).toBe(SUV_MARK);
  });

  it("keeps a 30-character name on one line", async () => {
    serve("aman", meOf({ displayName: LONG_NAME }));
    await signIn("aman");
    const view = await render(<ProfileScreen />);
    const name = await view.findByText(LONG_NAME);
    expect(name.props.numberOfLines).toBe(1);
  });

  it("reads the name as the Edit name button; the avatar is not read on its own", async () => {
    serve("aman", meOf());
    await signIn("aman");
    const view = await render(<ProfileScreen />);
    await view.findByText("Driver 4821");
    expect(view.queryByRole("image")).toBeNull();
    expect(avatarCircle(view)).toMatchObject({
      accessible: false, accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants",
    });
    expect(view.getByRole("button", { name: "Edit name" })).toBeTruthy();
  });

  it("keeps the error state when /me fails: Retry and Log out, no name and no avatar", async () => {
    api.users.set("aman", () => HttpResponse.json({ code: "INTERNAL" }, { status: 500 }));
    await signIn("aman");
    const view = await render(<ProfileScreen />);
    expect(await view.findByRole("button", { name: "Retry" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Log out" })).toBeTruthy();
    expect(hosts(view, "Svg")).toHaveLength(0);
    expect(view.queryByText("Sign-in methods")).toBeNull();
  });

  it("keeps the loading state while /me loads: no name, no avatar, no rows", async () => {
    api.users.set("aman", async () => { await delay("infinite"); return HttpResponse.json(meOf()); });
    await signIn("aman");
    const view = await render(<ProfileScreen />);
    await act(async () => { await Promise.resolve(); });
    expect(view.getByText("Profile")).toBeTruthy();
    expect(hosts(view, "Svg")).toHaveLength(0);
    expect(view.queryByText("Sign-in methods")).toBeNull();
    expect(view.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});

describe("Signing out and signing in as someone else", () => {
  it("never shows the previous User's name or avatar", async () => {
    serve("aman", meOf({ displayName: "Aman" }));
    await signIn("aman");
    const view = await render(<CabinetScreen />);
    await view.findByRole("button", { name: `Aman, ${PHONE}` });

    // Aman logs out from Profile and lands on Cabinet, signed out.
    await view.rerender(<ToastProvider><ProfileScreen /></ToastProvider>);
    expect(await view.findByText("Aman")).toBeTruthy();
    await fireEvent.press(await view.findByRole("button", { name: "Log out" }));
    await fireEvent.press(first(view.getAllByText("Log out").reverse()));
    await vi.waitFor(() => expect(routerMock.dismissTo).toHaveBeenCalledWith("/(tabs)/services"));
    await view.rerender(<ToastProvider><CabinetScreen /></ToastProvider>);
    expect(await view.findByRole("button", { name: "Sign in, By phone or email" })).toBeTruthy();
    expect(view.queryByText("Aman")).toBeNull();
    expect(hosts(view, "Svg")).toHaveLength(0);

    // Merdan signs in on the same phone. His /me has not answered yet.
    let answer: ((response: Response) => void) | null = null;
    api.users.set("merdan", () => new Promise<Response>((resolve) => { answer = resolve; }));
    await act(async () => { await signIn("merdan", MERDAN_ID); });
    expect(await view.findByLabelText("Please wait...")).toBeTruthy();
    expect(view.queryByText("Aman")).toBeNull();
    expect(hosts(view, "Svg")).toHaveLength(0);

    await vi.waitFor(() => expect(answer).not.toBeNull());
    await act(async () => {
      answer?.(HttpResponse.json(meOf({ id: MERDAN_ID, nameNumber: 2057, avatarIndex: 2 })));
    });
    expect(await view.findByRole("button", { name: `Driver 2057, ${PHONE}` })).toBeTruthy();
    expect(marks(view)[0]).toBe(SUV_MARK);
    expect(view.queryByText("Aman")).toBeNull();

    await view.rerender(<ToastProvider><ProfileScreen /></ToastProvider>);
    expect(await view.findByText("Driver 2057")).toBeTruthy();
    expect(view.queryByText("Aman")).toBeNull();
    await act(async () => { await clearAuthSession(); });
  });
});

// Profile loads these native modules; only this spec supplies its stand-ins.
vi.mock("expo-file-system/legacy", async () => (await import("../profile-photo-device")).fileSystemFake);
vi.mock("expo-image-manipulator", async () => (await import("../profile-photo-device")).imageManipulatorFake);
