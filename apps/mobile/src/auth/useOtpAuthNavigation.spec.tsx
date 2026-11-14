// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Router } from "expo-router";

import { useAuthIntentStore } from "./intentStore";
import { useOtpAuthNavigation } from "./useOtpAuthNavigation";

let onPreventedRemove: (() => void) | undefined;
let removalGuardEnabled = false;
afterEach(() => vi.unstubAllGlobals());

vi.mock("@react-navigation/native", () => ({
  usePreventRemove: (enabled: boolean, callback: () => void) => {
    removalGuardEnabled = enabled;
    onPreventedRemove = callback;
  },
}));

function fakeRouter() {
  return {
    back: vi.fn(),
    dismissTo: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  } as unknown as Router;
}

const LISTING_ID = "listing-abc";
const LISTING_ROUTE = `/(public)/listings/${LISTING_ID}` as const;

describe("useOtpAuthNavigation", () => {
  beforeEach(() => {
    onPreventedRemove = undefined;
    removalGuardEnabled = false;
    useAuthIntentStore.setState({ intent: null, replayAction: null });
  });

  it("returns after successful sign-in even if no animation frame arrives", () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    const router = fakeRouter();
    useAuthIntentStore.getState().requireSignIn(router, { returnTo: "/(tabs)/services" });
    const { result } = renderHook(() => useOtpAuthNavigation(router));

    act(() => result.current.complete());

    expect(removalGuardEnabled).toBe(false);
    expect(router.dismissTo).toHaveBeenCalledExactlyOnceWith("/(tabs)/services");
    expect(useAuthIntentStore.getState().intent).toBeNull();
  });

  it("cancels a native Back or swipe and dismisses to the caller", () => {
    const router = fakeRouter();
    useAuthIntentStore.getState().requireSignIn(router, {
      returnTo: LISTING_ROUTE,
      action: { kind: "favorite", listingId: LISTING_ID },
    });
    renderHook(() => useOtpAuthNavigation(router));

    expect(removalGuardEnabled).toBe(true);
    act(() => onPreventedRemove?.());

    expect(removalGuardEnabled).toBe(false);
    expect(router.dismissTo).toHaveBeenCalledWith(LISTING_ROUTE);
    expect(useAuthIntentStore.getState().intent).toBeNull();
    expect(useAuthIntentStore.getState().replayAction).toBeNull();
  });

  it("lets Change number or email pop to the existing entry screen without cancelling", () => {
    const router = fakeRouter();
    useAuthIntentStore.getState().requireSignIn(router, {
      returnTo: LISTING_ROUTE,
      action: { kind: "message", listingId: LISTING_ID },
    });
    const { result } = renderHook(() => useOtpAuthNavigation(router));

    act(() => result.current.changeMethod());

    expect(removalGuardEnabled).toBe(false);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(useAuthIntentStore.getState().intent).not.toBeNull();
  });

  it("lets Use phone instead return to the phone entry without cancelling", () => {
    const router = fakeRouter();
    useAuthIntentStore.getState().requireSignIn(router, {
      returnTo: LISTING_ROUTE,
      action: { kind: "message", listingId: LISTING_ID },
    });
    const { result } = renderHook(() => useOtpAuthNavigation(router));

    act(() => result.current.usePhoneInstead());

    expect(removalGuardEnabled).toBe(false);
    expect(router.dismissTo).toHaveBeenCalledWith("/(auth)/phone");
    expect(useAuthIntentStore.getState().intent).not.toBeNull();
  });

  it("replaces an invalid phone OTP route with Phone after disabling the guard", () => {
    const router = fakeRouter();
    useAuthIntentStore.getState().requireSignIn(router, {
      returnTo: LISTING_ROUTE,
      action: { kind: "message", listingId: LISTING_ID },
    });
    const { result } = renderHook(() => useOtpAuthNavigation(router));

    act(() => result.current.invalidDestination("phone"));

    expect(removalGuardEnabled).toBe(false);
    expect(router.replace).toHaveBeenCalledWith("/(auth)/phone");
    expect(useAuthIntentStore.getState().intent).not.toBeNull();
  });

  it("replaces an invalid email OTP route with Email after disabling the guard", () => {
    const router = fakeRouter();
    useAuthIntentStore.getState().requireSignIn(
      router,
      { returnTo: LISTING_ROUTE, action: { kind: "message", listingId: LISTING_ID } },
      "email",
    );
    const { result } = renderHook(() => useOtpAuthNavigation(router));

    act(() => result.current.invalidDestination("email"));

    expect(removalGuardEnabled).toBe(false);
    expect(router.replace).toHaveBeenCalledWith("/(auth)/email");
    expect(useAuthIntentStore.getState().intent).not.toBeNull();
  });

  it("completes sign-in only after disabling the removal guard", () => {
    const router = fakeRouter();
    const action = { kind: "report", listingId: LISTING_ID } as const;
    useAuthIntentStore
      .getState()
      .requireSignIn(router, { returnTo: LISTING_ROUTE, action });
    const { result } = renderHook(() => useOtpAuthNavigation(router));

    act(() => result.current.complete());
    expect(removalGuardEnabled).toBe(false);
    expect(router.dismissTo).toHaveBeenCalledWith(LISTING_ROUTE);
    expect(useAuthIntentStore.getState().replayAction).toEqual(action);
  });

  it("does not turn completed History auth into Back when a late native removal callback arrives", () => {
    const router = fakeRouter();
    const action = { kind: "history", attemptKey: "10000000-0000-4000-8000-000000000101", sourceListingId: null } as const;
    useAuthIntentStore.getState().requireSignIn(router, { returnTo: "/vehicle-history", action });
    const { result } = renderHook(() => useOtpAuthNavigation(router));
    const pendingRemoval = onPreventedRemove;
    act(() => result.current.complete());
    act(() => pendingRemoval?.());
    expect(router.back).not.toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenCalledExactlyOnceWith("/vehicle-history");
    expect(useAuthIntentStore.getState().replayAction).toEqual(action);
  });

  it("does not replace a chosen cancel with a delayed verification result", () => {
    const router = fakeRouter();
    useAuthIntentStore.getState().requireSignIn(router, {
      returnTo: LISTING_ROUTE, action: { kind: "message", listingId: LISTING_ID },
    });
    const { result } = renderHook(() => useOtpAuthNavigation(router));
    act(() => result.current.cancel());
    act(() => result.current.complete());
    expect(router.dismissTo).toHaveBeenCalledExactlyOnceWith(LISTING_ROUTE);
    expect(useAuthIntentStore.getState().replayAction).toBeNull();
  });

  it("ignores a verification result after Code is disposed", () => {
    const router = fakeRouter();
    const { result, unmount } = renderHook(() => useOtpAuthNavigation(router));
    const complete = result.current.complete;
    unmount();
    act(() => complete());
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});
