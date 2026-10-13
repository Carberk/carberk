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
vi.mock("expo-font", () => ({ useFonts: () => [true] }));
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
    Screen: ({ name }: { name: string }) => <native.View testID={name} />,
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
  const screen = await renderMobile(<RootLayout />);
  await act(async () => {});
  await act(async () => {});
  return screen;
}

beforeEach(() => {
  createRequire(import.meta.url).extensions[".ttf"] = (module) => { module.exports = {}; };
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
    await first.unmount();

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
    // The Language screen lets the launch screen go, so Home is not seen first.
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
    expect(SplashScreen.hide).toHaveBeenCalled();
  });

  it("lets a deep link win on a fresh install and keeps onboarding for the next plain start", async () => {
    launch.pathname = "/listings/550e8400-e29b-41d4-a716-446655440000";
    const screen = await launchApp();

    expect(screen.getByTestId("(tabs)")).toBeTruthy();
    expect(launch.push).not.toHaveBeenCalled();
    expect(SplashScreen.hide).toHaveBeenCalled();
    expect(launch.stored[FLAG]).toBe("pending");
  });

  it("opens Home without onboarding after one second of slow storage", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(AsyncStorage.getItem).mockImplementation((key) =>
      key === FLAG ? new Promise(() => {}) : Promise.resolve(null),
    );
    const screen = await renderMobile(<RootLayout />);
    await act(async () => {});
    expect(screen.queryByTestId("(tabs)")).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(screen.getByTestId("(tabs)")).toBeTruthy();
    expect(launch.push).not.toHaveBeenCalled();
    expect(SplashScreen.hide).toHaveBeenCalled();
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
  it("pushes the Language screen above the tabs when the launch owes onboarding", async () => {
    await renderMobile(<OnboardingLaunch decision="show" />);

    expect(launch.push).toHaveBeenCalledWith(LANGUAGE);
  });

  it("lets the launch screen go at once, without pushing, when nothing is owed or a deep link won", async () => {
    const skip = await renderMobile(<OnboardingLaunch decision="skip" />);
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    expect(launch.push).not.toHaveBeenCalled();
    await skip.unmount();

    launch.pathname = "/listings/550e8400-e29b-41d4-a716-446655440000";
    await renderMobile(<OnboardingLaunch decision="show" />);
    expect(launch.push).not.toHaveBeenCalled();
    expect(SplashScreen.hide).toHaveBeenCalledTimes(2);
  });

  it("still lets the launch screen go when the push itself throws", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    launch.push.mockImplementation(() => {
      throw new Error("router is down");
    });
    await renderMobile(<OnboardingLaunch decision="show" />);

    // The splash goes at once instead of waiting out the fallback timer.
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    await act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
  });

  it("clears the fallback timer when the launch gate leaves the tree", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const screen = await renderMobile(<OnboardingLaunch decision="show" />);
    await screen.unmount();

    await act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(SplashScreen.hide).not.toHaveBeenCalled();
  });
});

vi.mock("react-native", async (original) => ({
  ...await original<typeof Native>(),
  AppState: { addEventListener: () => ({ remove() {} }) },
}));
