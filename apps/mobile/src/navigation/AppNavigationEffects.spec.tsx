import { describe, expect, it, vi } from "vitest";

import { act, renderMobile, routerMock } from "../../test/render";
import { ApiError } from "../api/client";

import { AppNavigationEffects } from "./AppNavigationEffects";

const state = vi.hoisted(() => ({ pathname: "/conversations/conv-a", clear: vi.fn() }));
vi.mock("expo-router", async () => ({
  router: (await import("../../test/native-setup")).routerMock,
  usePathname: () => state.pathname,
}));
vi.mock("../auth/session", () => ({ clearAuthSession: state.clear }));
vi.mock("../notifications/useDirectMessagePushRouting", () => ({ useDirectMessagePushRouting: vi.fn() }));

describe("app auth error navigation", () => {
  it("clears an expired session on a Conversation without replacing its route", async () => {
    state.pathname = "/conversations/conv-a";
    const screen = renderMobile(<AppNavigationEffects />);
    await act(async () => {
      await screen.queryClient.fetchQuery({ queryKey: ["expired"], queryFn: () => Promise.reject(new ApiError("UNAUTHENTICATED", 401, "Expired")) }).catch(() => {});
    });
    expect(state.clear).toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("uses the latest route and redirects an expired session outside a Conversation", async () => {
    state.pathname = "/conversations/conv-a";
    const screen = renderMobile(<AppNavigationEffects />);
    state.pathname = "/favorites";
    screen.rerender(<AppNavigationEffects />);
    await act(async () => {
      await screen.queryClient.fetchQuery({ queryKey: ["expired"], queryFn: () => Promise.reject(new ApiError("UNAUTHENTICATED", 401, "Expired")) }).catch(() => {});
    });
    expect(routerMock.replace).toHaveBeenCalledWith("/(auth)/phone");
  });
});
