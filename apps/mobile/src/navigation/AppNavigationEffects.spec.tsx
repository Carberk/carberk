import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderMobile, routerMock } from "../../test/render";
import { ApiError } from "../api/client";

import { AppNavigationEffects } from "./AppNavigationEffects";

const state = vi.hoisted(() => ({
  pathname: "/conversations/conv-a",
  clear: vi.fn(),
  session: null as object | null,
  sessionListeners: new Set<() => void>(),
}));
vi.mock("expo-router", async () => ({
  router: (await import("../../test/native-setup")).routerMock,
  usePathname: () => state.pathname,
}));
vi.mock("../auth/session", () => ({
  clearAuthSession: state.clear,
  loadAuthSession: async () => state.session,
  subscribeAuthSession: (listener: () => void) => {
    state.sessionListeners.add(listener);
    return () => state.sessionListeners.delete(listener);
  },
  subscribeAuthUserChange: () => () => {},
}));
vi.mock("../notifications/useDirectMessagePushRouting", () => ({ useDirectMessagePushRouting: vi.fn() }));

describe("app auth error navigation", () => {
  beforeEach(() => {
    state.session = null;
    state.sessionListeners.clear();
  });

  it("clears an expired session on a Conversation without replacing its route", async () => {
    state.pathname = "/conversations/conv-a";
    const screen = await renderMobile(<AppNavigationEffects />);
    await act(async () => {
      await screen.queryClient.fetchQuery({ queryKey: ["expired"], queryFn: () => Promise.reject(new ApiError("UNAUTHENTICATED", 401, "Expired")) }).catch(() => {});
    });
    expect(state.clear).toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("uses the latest route and redirects an expired session outside a Conversation", async () => {
    state.pathname = "/conversations/conv-a";
    const screen = await renderMobile(<AppNavigationEffects />);
    state.pathname = "/favorites";
    await screen.rerender(<AppNavigationEffects />);
    await act(async () => {
      await screen.queryClient.fetchQuery({ queryKey: ["expired"], queryFn: () => Promise.reject(new ApiError("UNAUTHENTICATED", 401, "Expired")) }).catch(() => {});
    });
    expect(routerMock.replace).toHaveBeenCalledWith("/(auth)/phone");
  });

  it("redirects an expired session after a refused mutation, as after a refused query (#673)", async () => {
    state.pathname = "/account/display-name";
    state.clear.mockClear();
    const screen = await renderMobile(<AppNavigationEffects />);
    const mutation = screen.queryClient.getMutationCache().build(screen.queryClient, {
      mutationFn: () => Promise.reject(new ApiError("UNAUTHENTICATED", 401, "Expired")),
    });
    await act(async () => {
      await mutation.execute(undefined).catch(() => {});
    });
    expect(state.clear).toHaveBeenCalled();
    expect(routerMock.replace).toHaveBeenCalledWith("/(auth)/phone");
  });

  it("keeps a Conversation's route after a refused mutation there", async () => {
    state.pathname = "/conversations/conv-a";
    state.clear.mockClear();
    const screen = await renderMobile(<AppNavigationEffects />);
    const mutation = screen.queryClient.getMutationCache().build(screen.queryClient, {
      mutationFn: () => Promise.reject(new ApiError("UNAUTHENTICATED", 401, "Expired")),
    });
    await act(async () => {
      await mutation.execute(undefined).catch(() => {});
    });
    expect(state.clear).toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("redirects again when a later session expires after a new sign-in", async () => {
    state.pathname = "/favorites";
    const screen = await renderMobile(<AppNavigationEffects />);
    const expire = (key: string) =>
      act(async () => {
        await screen.queryClient.fetchQuery({ queryKey: [key], queryFn: () => Promise.reject(new ApiError("UNAUTHENTICATED", 401, "Expired")) }).catch(() => {});
      });
    await expire("first");
    expect(routerMock.replace).toHaveBeenCalledTimes(1);

    // The session ending notifies the listeners too; only a stored session re-arms the redirect.
    await act(async () => state.sessionListeners.forEach((listener) => listener()));
    await expire("burst");
    expect(routerMock.replace).toHaveBeenCalledTimes(1);

    state.session = { user: { id: "user-1" } };
    await act(async () => state.sessionListeners.forEach((listener) => listener()));
    state.session = null;
    await expire("second");
    expect(routerMock.replace).toHaveBeenCalledTimes(2);
  });
});
