import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderMobile } from "../render";
import OnboardingLayout from "../../app/(onboarding)/_layout";
import { HOME_HREF } from "../../src/navigation/homeHref";

const FLAG = "@auto-tm/onboarding-completed";

const stored = vi.hoisted(() => ({ flag: null as string | null }));
const secureStore = vi.hoisted(() => ({ session: null as string | null }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
const setOptions = vi.hoisted(() => vi.fn());

vi.mock("expo-router", () => ({
  router,
  useNavigation: () => ({ setOptions }),
  Stack: Object.assign(({ children }: React.PropsWithChildren) => children, {
    Screen: () => null,
  }),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => secureStore.session),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

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

beforeEach(() => {
  stored.flag = null;
  secureStore.session = null;
  vi.mocked(AsyncStorage.getItem).mockImplementation(async (key: string) =>
    key === FLAG ? stored.flag : null,
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(AsyncStorage.getItem).mockImplementation(async () => null);
});

describe("Onboarding group guard", () => {
  it("stays on the screen while onboarding is still owed", async () => {
    stored.flag = "pending";
    await renderMobile(<OnboardingLayout />);
    await act(async () => {});

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("redirects to the tabs when onboarding was already completed", async () => {
    stored.flag = "true";
    await renderMobile(<OnboardingLayout />);
    await act(async () => {});

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(HOME_HREF);
  });

  it("redirects to the tabs when a session exists, even with the flag still pending", async () => {
    stored.flag = "pending";
    secureStore.session = JSON.stringify(SESSION);
    await renderMobile(<OnboardingLayout />);
    await act(async () => {});

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(HOME_HREF);
  });

  it("stays when storage cannot be read; the launch gate owns that failure path", async () => {
    stored.flag = "true";
    vi.mocked(AsyncStorage.getItem).mockRejectedValue(new Error("storage unavailable"));
    await renderMobile(<OnboardingLayout />);
    await act(async () => {});

    expect(router.replace).not.toHaveBeenCalled();
  });
});
