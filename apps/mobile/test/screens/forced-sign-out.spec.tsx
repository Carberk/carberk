import { http, HttpResponse } from "msw";
import { Pressable } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CabinetScreen from "../../app/(tabs)/services";
import ProfileScreen from "../../app/profile";
import { useRequestSignInMethodChange } from "../../src/api/identity/useRequestSignInMethodChange";
import { useUpdateDisplayName } from "../../src/api/identity/useUpdateDisplayName";
import { useVerifySignInMethodChange } from "../../src/api/identity/useVerifySignInMethodChange";
import { clearAuthSession, loadAuthSession, storeAuthSession } from "../../src/auth/session";
import { AppNavigationEffects } from "../../src/navigation/AppNavigationEffects";
import { server } from "../msw";
import { act, fireEvent, first, renderMobile, routerMock, queryAllHosts } from "../render";

import { ToastProvider } from "@/components/ui/toast";

// Cabinet and Profile under the root's own effects, with the real session, API client and
// queries against an in-memory API. Only the device is replaced: its storage,
// its notifications and the navigator.

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
vi.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "default",
  getLastNotificationResponse: () => null,
  clearLastNotificationResponse: () => undefined,
  addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
}));
// What Cabinet does when its tab comes back into view.
const tab = vi.hoisted(() => ({ onFocus: null as null | (() => void) }));
vi.mock("expo-router", async () => ({
  router: (await import("../native-setup")).routerMock,
  useRouter: () => routerMock,
  usePathname: () => "/services",
  useRootNavigationState: () => undefined,
  useFocusEffect: (callback: () => void) => { tab.onFocus = callback; },
}));

const AMAN_ID = "00000000-0000-4000-8000-00000000000a";
const MERDAN_ID = "00000000-0000-4000-8000-00000000000b";
const PHONE = "+993 65 XX-XX-56";
// The first stroke of the SUV (avatar index 2).
const SUV_MARK = "M3 15V9.4C3 8.6 3.6 8 4.4 8H15l3.2 3.6 2.8.6V15";

function meOf(overrides: Record<string, unknown>) {
  return {
    id: AMAN_ID, phone: "+99365123456", email: null, phoneVerified: true,
    displayName: null, nameNumber: 4821, avatarIndex: 7, avatarKey: null,
    role: "buyer", avatarUrl: null, locale: "ru",
    createdAt: "2026-01-15T00:00:00.000Z", deletionScheduledAt: null,
    ...overrides,
  };
}

/** What `/me` answers for each access token the API still accepts. */
const accepted = new Map<string, () => Promise<Response> | Response>();
const unauthenticated = () => HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
const tokenOf = (request: Request) => request.headers.get("authorization")?.replace("Bearer ", "") ?? "";

async function signIn(token: string, id: string) {
  await storeAuthSession({
    accessToken: token, refreshToken: `refresh-${token}`,
    user: { id, phone: "+99365123456", email: null, displayName: null, role: "buyer" },
  });
}

beforeEach(() => {
  storage.clear();
  accepted.clear();
  tab.onFocus = null;
  server.use(
    http.get("*/me", ({ request }) => accepted.get(tokenOf(request))?.() ?? unauthenticated()),
    http.get("*/me/listings/counts", ({ request }) => accepted.has(tokenOf(request))
      ? HttpResponse.json({ active: 0, sold: 0, archived: 0, banned: 0, drafts: 0, total: 0 })
      : unauthenticated()),
    http.post("*/auth/refresh", unauthenticated),
  );
});

type View = Awaited<ReturnType<typeof renderMobile>>;
type Host = { props: Record<string, unknown> };
/** Rendered host nodes of one native type, such as the avatar's `Svg`. */
const hosts = (view: View, type: string) => queryAllHosts(view.container, type) as unknown as Host[];

describe("Signing in as someone else after the API ended the session", () => {
  it("shows Cabinet's skeleton until the new User's /me arrives, never the previous User's name or avatar", async () => {
    accepted.set("aman", () => HttpResponse.json(meOf({ displayName: "Aman" })));
    await signIn("aman", AMAN_ID);
    const view = await renderMobile(<><AppNavigationEffects /><CabinetScreen /></>);
    await view.findByRole("button", { name: `Aman, ${PHONE}` });

    // The API no longer accepts Aman's tokens. He comes back to Cabinet, its
    // listing count is refused, and so is the refresh: he is signed out and
    // sent to sign-in.
    accepted.delete("aman");
    await act(async () => { tab.onFocus?.(); });
    expect(await view.findByRole("button", { name: "Sign in, By phone or email" })).toBeTruthy();
    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/(auth)/phone"));
    expect(view.queryByText("Aman")).toBeNull();
    expect(hosts(view, "Svg")).toHaveLength(0);

    // Merdan signs in on the same phone. His /me has not answered yet.
    let answer: ((response: Response) => void) | null = null;
    accepted.set("merdan", () => new Promise<Response>((resolve) => { answer = resolve; }));
    await act(async () => { await signIn("merdan", MERDAN_ID); });
    expect(await view.findByLabelText("Please wait...")).toBeTruthy();
    expect(view.queryByText("Aman")).toBeNull();
    expect(hosts(view, "Svg")).toHaveLength(0);

    await vi.waitFor(() => expect(answer).not.toBeNull());
    await act(async () => {
      answer?.(HttpResponse.json(meOf({ id: MERDAN_ID, nameNumber: 2057, avatarIndex: 2 })));
    });
    expect(await view.findByRole("button", { name: `Driver 2057, ${PHONE}` })).toBeTruthy();
    expect(first(hosts(view, "Path")).props.d).toBe(SUV_MARK);
    expect(view.queryByText("Aman")).toBeNull();
    await act(async () => { await clearAuthSession(); });
  });

  it("shows nobody on Profile while signed out, then only the new User", async () => {
    accepted.set("aman", () => HttpResponse.json(meOf({ displayName: "Aman" })));
    await signIn("aman", AMAN_ID);
    // Profile is stacked above Cabinet, which stays mounted under it.
    const view = await renderMobile(
      <ToastProvider><AppNavigationEffects /><CabinetScreen /><ProfileScreen /></ToastProvider>,
    );
    await view.findByRole("button", { name: "Edit name" });
    expect(view.getByText("Sign-in methods")).toBeTruthy();
    expect(view.getAllByText(PHONE).length).toBeGreaterThan(0);

    // A request other than /me is refused, and so is the refresh. Aman's /me
    // is still cached, and nobody is signed in.
    accepted.delete("aman");
    await act(async () => { tab.onFocus?.(); });
    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/(auth)/phone"));
    await vi.waitFor(() => expect(view.queryByText("Aman")).toBeNull());
    expect(view.queryByText("Sign-in methods")).toBeNull();
    expect(view.queryByText(PHONE)).toBeNull();
    expect(hosts(view, "Svg")).toHaveLength(0);
    expect(view.queryByRole("button", { name: "Log out" })).toBeNull();
    expect(view.getByText("Profile")).toBeTruthy();

    // Merdan signs in on the same phone. His /me has not answered yet.
    let answer: ((response: Response) => void) | null = null;
    accepted.set("merdan", () => new Promise<Response>((resolve) => { answer = resolve; }));
    await act(async () => { await signIn("merdan", MERDAN_ID); });
    await vi.waitFor(() => expect(answer).not.toBeNull());
    expect(view.queryByText("Aman")).toBeNull();
    expect(view.queryByText("Sign-in methods")).toBeNull();
    expect(hosts(view, "Svg")).toHaveLength(0);

    await act(async () => {
      answer?.(HttpResponse.json(meOf({ id: MERDAN_ID, nameNumber: 2057, avatarIndex: 2 })));
    });
    expect(await view.findByRole("button", { name: "Edit name" })).toBeTruthy();
    // Cabinet's row and Profile's name.
    expect(view.getAllByText("Driver 2057")).toHaveLength(2);
    expect(view.getByText("Sign-in methods")).toBeTruthy();
    expect(view.getByRole("button", { name: "Log out" })).toBeTruthy();
    expect(view.queryByText("Aman")).toBeNull();
    await act(async () => { await clearAuthSession(); });
  });
});

/** One account edit, saved the way its screen saves it. */
function Save({ useSave }: { useSave: () => { mutate: () => void } }) {
  const save = useSave();
  return <Pressable accessibilityRole="button" accessibilityLabel="Save" onPress={() => save.mutate()} />;
}

describe("Saving an account edit after the API ended the session (#673)", () => {
  it.each([
    {
      edit: "a new Display Name",
      route: http.patch("*/me", unauthenticated),
      useSave: () => { const m = useUpdateDisplayName(); return { mutate: () => m.mutate("Aman") }; },
    },
    {
      edit: "an email to add",
      route: http.post("*/me/sign-in-methods/request", unauthenticated),
      useSave: () => { const m = useRequestSignInMethodChange(); return { mutate: () => m.mutate({ email: "aman@example.com" }) }; },
    },
    {
      edit: "a phone to add",
      route: http.post("*/me/sign-in-methods/request", unauthenticated),
      useSave: () => { const m = useRequestSignInMethodChange(); return { mutate: () => m.mutate({ phone: "+99365123457" }) }; },
    },
    {
      edit: "the code for a new Sign-in Method",
      route: http.post("*/me/sign-in-methods/verify", unauthenticated),
      useSave: () => { const m = useVerifySignInMethodChange(); return { mutate: () => m.mutate({ email: "aman@example.com", code: "123456" }) }; },
    },
  ])("signs the User out and offers sign-in when $edit is refused", async ({ route, useSave }) => {
    server.use(route);
    await signIn("aman", AMAN_ID);
    const view = await renderMobile(<><AppNavigationEffects /><Save useSave={useSave} /></>);

    await fireEvent.press(view.getByRole("button", { name: "Save" }));

    await act(async () => {
      await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/(auth)/phone"));
    });
    expect(await loadAuthSession()).toBeNull();
  });
});

// Profile loads these native modules; only this spec supplies its stand-ins.
vi.mock("expo-file-system/legacy", async () => (await import("../profile-photo-device")).fileSystemFake);
vi.mock("expo-image-manipulator", async () => (await import("../profile-photo-device")).imageManipulatorFake);
