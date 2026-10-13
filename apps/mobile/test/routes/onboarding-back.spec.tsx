import { createRequire } from "node:module";

import type * as Native from "react-native";
import * as React from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderMobile } from "../render";
import RootLayout, { unstable_settings } from "../../app/_layout";
import { OnboardingLaunch } from "../../src/onboarding/OnboardingLaunch";

const FLAG = "@auto-tm/onboarding-completed";
const LOCALE = "@auto-tm/locale";
const LANGUAGE = "/(onboarding)/language";

const appearance = vi.hoisted(() => ({
  current: "light", hold: false, destinations: [] as string[],
  listeners: new Set<() => void>(),
}));
vi.mock("nativewind", async () => {
  const React = await import("react");
  return {
    cssInterop: vi.fn(), remapProps: vi.fn(),
    useColorScheme: () => ({
      colorScheme: React.useSyncExternalStore(
        (listener) => { appearance.listeners.add(listener); return () => { appearance.listeners.delete(listener); }; },
        () => appearance.current,
      ),
      setColorScheme: (scheme: string) => {
        if (appearance.hold) return;
        appearance.current = scheme === "system" ? "light" : scheme;
        for (const listener of appearance.listeners) listener();
      },
    }),
  };
});

const fontState = vi.hoisted(() => ({ loaded: true, error: null as Error | null }));

const launch = vi.hoisted(() => ({
  pathname: "/",
  stored: {} as Record<string, string>,
  push: vi.fn(),
}));

// A stored session for the root-level test: the real loadAuthSession parses it
// through the contracts schema.
const secureStore = vi.hoisted(() => ({ session: null as string | null }));
const SESSION = {
  accessToken: "access",
  refreshToken: "refresh",
  user: {
    id: "11111111-2222-4222-8222-333333333333",
    phone: "+99361234567",
    email: null,
    displayName: null,
    role: "buyer",
  },
  storedAt: "2026-10-09T00:00:00.000Z",
};

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => launch.stored[key] ?? null),
    getAllKeys: vi.fn(async () => Object.keys(launch.stored)),
    setItem: vi.fn(async (key: string, value: string) => { launch.stored[key] = value; }),
    removeItem: vi.fn(async () => {}),
  },
}));
vi.mock("expo-font", () => ({ useFonts: () => [fontState.loaded, fontState.error] }));
vi.mock("expo-splash-screen", () => ({ preventAutoHideAsync: vi.fn(), hide: vi.fn() }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
vi.mock("@react-native-community/netinfo", () => ({ default: {
  fetch: async () => ({ isConnected: true }), addEventListener: () => () => {},
} }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: ({ children }: React.PropsWithChildren) => <View>{children}</View>, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native-gesture-handler", () => ({ GestureHandlerRootView: ({ children }: React.PropsWithChildren) => <View>{children}</View> }));
vi.mock("@react-navigation/native", () => ({ ThemeProvider: ({ children }: React.PropsWithChildren) => <View>{children}</View>, DefaultTheme: { colors: {} }, DarkTheme: { colors: {} } }));
vi.mock("expo-notifications", () => ({ DEFAULT_ACTION_IDENTIFIER: "default", getLastNotificationResponse: () => null, addNotificationResponseReceivedListener: () => ({ remove() {} }) }));
vi.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///documents/" }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => secureStore.session),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));
vi.mock("expo-router", async () => {
  // Model the root Stack's screens. This proves what the launch asks the router
  // to do; the dismissal path runs on the production screens in onboarding-flow.spec.
  const native = await import("react-native");
  const Stack = Object.assign(({ children }: React.PropsWithChildren) => <native.View>{children}</native.View>, {
    Screen: ({ name }: { name: string }) => {
      if (name === "(tabs)") appearance.destinations.push(appearance.current);
      return <native.View testID={name} />;
    },
  });
  return {
    Stack,
    router: { replace: vi.fn(), push: launch.push },
    usePathname: () => launch.pathname,
    useRootNavigationState: () => ({ routes: [{ name: "(tabs)" }], index: 0 }),
  };
});

// The signed-in case is decided in `onboardingGate.spec.ts`; a session here
// would start the signed-in root effects, which this spec does not model.
async function launchApp() {
  const screen = renderMobile(<RootLayout />);
  await act(async () => {});
  await act(async () => {});
  return screen;
}

beforeEach(() => {
  createRequire(import.meta.url).extensions[".ttf"] = (module) => { module.exports = {}; };
  appearance.current = "light";
  appearance.hold = false;
  appearance.destinations = [];
  fontState.loaded = true;
  fontState.error = null;
  launch.pathname = "/";
  launch.stored = {};
  launch.push.mockClear();
  launch.push.mockImplementation(() => {});
  secureStore.session = null;
  vi.mocked(SplashScreen.hide).mockClear();
  vi.mocked(AsyncStorage.getItem).mockClear();
  vi.mocked(AsyncStorage.getAllKeys).mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(AsyncStorage.getItem).mockImplementation(async (key: string) => launch.stored[key] ?? null);
});

describe("Startup resource failures", () => {
  it("mounts the first destination with the saved Light appearance already applied", async () => {
    appearance.current = "dark";
    appearance.hold = true;
    launch.stored = { "@auto-tm/theme": "light", [LOCALE]: "en" };
    const screen = await launchApp();
    expect(screen.queryByTestId("(tabs)")).toBeNull();
    act(() => {
      appearance.current = "light";
      appearance.hold = false;
      for (const listener of appearance.listeners) listener();
    });
    expect(screen.getByTestId("(tabs)")).toBeTruthy();
    expect(appearance.destinations.length).toBeGreaterThan(0);
    expect(appearance.destinations.every((scheme) => scheme === "light")).toBe(true);
  });

  it("keeps the launch cover until the saved theme has settled", async () => {
    let resolveTheme!: (theme: string) => void;
    const pendingTheme = new Promise<string>((resolve) => { resolveTheme = resolve; });
    vi.mocked(AsyncStorage.getItem).mockImplementation(async (key: string) =>
      key === "@auto-tm/theme" ? pendingTheme : "en",
    );
    const screen = await launchApp();
    expect(screen.queryByTestId("(tabs)")).toBeNull();
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
    await act(async () => resolveTheme("dark"));
    expect(screen.getByTestId("(tabs)")).toBeTruthy();
  });

  it("mounts the destination when bundled fonts fail instead of holding launch forever", async () => {
    fontState.loaded = false;
    fontState.error = new Error("font unavailable");
    launch.stored = { [LOCALE]: "en" };
    const screen = await launchApp();
    expect(screen.getByTestId("(tabs)")).toBeTruthy();
    expect(screen.getByText("By Alpha Motors")).toBeTruthy();
  });

  it("mounts the destination if locale storage fails and keeps deep-link precedence", async () => {
    launch.pathname = "/listings/linked";
    vi.mocked(AsyncStorage.getItem).mockImplementation(async (key: string) => {
      if (key === LOCALE) throw new Error("locale storage unavailable");
      return null;
    });
    const screen = await launchApp();
    expect(screen.getByTestId("(tabs)")).toBeTruthy();
    expect(launch.push).not.toHaveBeenCalled();
  });
});

describe("Root Back anchor", () => {
  it("uses the tabs as the deep-link Back anchor", () => {
    expect(unstable_settings.initialRouteName).toBe("(tabs)");
  });

  it("mounts and remounts the root with a stored session without ever opening onboarding, whatever the flag says", async () => {
    secureStore.session = JSON.stringify(SESSION);
    launch.stored = { [FLAG]: "pending", [LOCALE]: "ru" };
    const first = await launchApp();

    expect(first.getByTestId("(tabs)")).toBeTruthy();
    expect(launch.push).not.toHaveBeenCalled();
    first.unmount();

    await launchApp();

    expect(launch.push).not.toHaveBeenCalled();
    expect(launch.stored[FLAG]).toBe("true");
  });
});

describe("Onboarding on launch", () => {
  it("opens the Language screen above the tabs on a fresh install", async () => {
    const screen = await launchApp();

    expect(screen.getByTestId("(tabs)")).toBeTruthy();
    expect(launch.push).toHaveBeenCalledTimes(1);
    expect(launch.push).toHaveBeenCalledWith(LANGUAGE);
    expect(launch.stored[FLAG]).toBe("pending");
    // Only the entrance layout releases native; navigation never does.
    expect(SplashScreen.hide).not.toHaveBeenCalled();
  });

  it("reads storage before the launch reads the language, so nothing can be written first", async () => {
    await launchApp();

    const keysRead = vi.mocked(AsyncStorage.getAllKeys).mock.invocationCallOrder[0] ?? Infinity;
    const localeRead = vi.mocked(AsyncStorage.getItem).mock.invocationCallOrder[
      vi.mocked(AsyncStorage.getItem).mock.calls.findIndex(([key]) => key === LOCALE)
    ] ?? -1;
    expect(keysRead).toBeLessThan(localeRead);
  });

  it("goes straight to Home for someone who already has a stored language", async () => {
    launch.stored = { [LOCALE]: "tk" };
    const screen = await launchApp();

    expect(screen.getByTestId("(tabs)")).toBeTruthy();
    expect(launch.push).not.toHaveBeenCalled();
    expect(launch.stored[FLAG]).toBe("true");
    expect(SplashScreen.hide).not.toHaveBeenCalled();
  });

  it("lets a deep link win on a fresh install and keeps onboarding for the next plain start", async () => {
    launch.pathname = "/listings/550e8400-e29b-41d4-a716-446655440000";
    const screen = await launchApp();

    expect(screen.getByTestId("(tabs)")).toBeTruthy();
    expect(launch.push).not.toHaveBeenCalled();
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    expect(launch.stored[FLAG]).toBe("pending");
  });

  it("opens Home without onboarding after one second of slow storage", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(AsyncStorage.getItem).mockImplementation((key) =>
      key === FLAG ? new Promise(() => {}) : Promise.resolve(null),
    );
    const screen = renderMobile(<RootLayout />);
    await act(async () => {});
    expect(screen.queryByTestId("(tabs)")).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(screen.getByTestId("(tabs)")).toBeTruthy();
    expect(launch.push).not.toHaveBeenCalled();
    expect(SplashScreen.hide).not.toHaveBeenCalled();
  });
});

describe("Back after onboarding", () => {
  it("never opens onboarding again once it was finished, so publishing a Listing cannot go Back to it", async () => {
    launch.stored = { [FLAG]: "true", [LOCALE]: "ru" };
    await launchApp();

    expect(launch.push).not.toHaveBeenCalled();
  });
});

describe("OnboardingLaunch", () => {
  it("pushes the Language screen above the tabs when the launch owes onboarding", () => {
    renderMobile(<OnboardingLaunch decision="show" />);

    expect(launch.push).toHaveBeenCalledWith(LANGUAGE);
  });

  it("leaves native handoff to the entrance when nothing is owed or a deep link won", () => {
    const skip = renderMobile(<OnboardingLaunch decision="skip" />);
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    expect(launch.push).not.toHaveBeenCalled();
    skip.unmount();

    launch.pathname = "/listings/550e8400-e29b-41d4-a716-446655440000";
    renderMobile(<OnboardingLaunch decision="show" />);
    expect(launch.push).not.toHaveBeenCalled();
    expect(SplashScreen.hide).not.toHaveBeenCalled();
  });

  it("leaves native handoff to the entrance when the push itself throws", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    launch.push.mockImplementation(() => {
      throw new Error("router is down");
    });
    renderMobile(<OnboardingLaunch decision="show" />);

    // Navigation failure cannot release native before the entrance has laid out.
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(SplashScreen.hide).not.toHaveBeenCalled();
  });

  it("never releases native from a navigation fallback timer", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const screen = renderMobile(<OnboardingLaunch decision="show" />);
    screen.unmount();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(SplashScreen.hide).not.toHaveBeenCalled();
  });
});

vi.mock("react-native", async (original) => ({
  ...await original<typeof Native>(),
  AppState: { addEventListener: () => ({ remove() {} }) },
}));
